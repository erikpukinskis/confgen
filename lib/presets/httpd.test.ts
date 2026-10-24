import { collectContributions, type Contribution } from "../contributions.js"
import type { ProjectFacts } from "../facts.js"
import { reconcile } from "../reconcile.js"
import { parseSelection } from "../selection.js"
import { expect, test } from "vitest"
import { parseDocument } from "yaml"

const root = {
  path: "package.json",
  name: "@example/package-service",
  version: "0.1.0",
  repository: {
    type: "git",
    url: "https://github.com/example/package-service.git",
  },
  workspaces: [],
  dependencies: [],
}
const facts: ProjectFacts = { root, packages: [root] }

const selection = parseSelection([
  "runtimes=#lib,#server,#client,#integration,#gateway",
  "yarn",
  "typescript",
  "vite",
  "vitest",
  "docker",
  "httpd",
])

test("the gateway proxies health and API and shares the integration host across environments", () => {
  const contributions = collectContributions(selection, facts)
  const conf = text(contributions, "gateway/httpd.conf")
  expect(conf).toContain(
    'SSLCertificateFile "/usr/local/share/ca-certificates/local.multiplayerdb.dev.crt"'
  )
  expect(conf).toContain(
    'SSLCertificateKeyFile "/etc/apache2/ssl/local.multiplayerdb.dev.key"'
  )
  expect(conf).toContain("SSLProxyVerify require")
  expect(conf).toContain("SSLProxyCheckPeerName on")
  expect(conf).toContain("SSLProxyCheckPeerExpire on")
  expect(conf).toContain(
    "SSLProxyCACertificateFile /usr/local/share/ca-certificates/local.multiplayerdb.dev.crt"
  )
  expect(conf).toContain(
    "ProxyPass /healthcheck https://package-api-server.local.multiplayerdb.dev:7001/healthcheck"
  )
  expect(conf).toContain(
    "ProxyPass /api https://package-api-server.local.multiplayerdb.dev:7001/api"
  )
  expect(conf).toContain("DocumentRoot /srv/homepage")
  expect(text(contributions, "gateway/public/index.html")).toContain(
    "Package service"
  )
  expect(text(contributions, "gateway/Dockerfile")).toContain("FROM httpd:2.4")
  expect(text(contributions, "gateway/Dockerfile")).toContain("git")
  expect(text(contributions, "gateway/Dockerfile")).toContain(
    String.raw`ENTRYPOINT ["sh", "-c", "update-ca-certificates && exec \"$@\"", "--"]`
  )
  expect(text(contributions, "gateway/Dockerfile")).not.toContain(
    "docker-entrypoint-httpd.sh"
  )
  expect(text(contributions, "Dockerfile")).toContain(
    "FROM source AS integration-test-host"
  )

  const created = reconcile({
    selection,
    contributions,
    prior: undefined,
    files: new Map([
      [
        "package.json",
        JSON.stringify({
          name: "@example/package-service",
          scripts: {
            bump: "./scripts/bump.sh",
            "generate:local:ssl": "./scripts/generate_local_ssl.sh",
          },
        }),
      ],
    ]),
    yarnLockPresent: false,
    pnpPresent: false,
  })
  const base = yamlObject(written(created.files, "compose.base.yaml"))
  const services = objectField(base, "services")
  const baseHost = objectField(
    services,
    "package-service-integration-test-host"
  )
  expect(baseHost.image).toBe(
    "ghcr.io/example/package-service-integration-test-host:${IMAGE_TAG:?}"
  )
  expect(baseHost.environment).toEqual({
    PACKAGE_SERVICE_URL: "${PACKAGE_SERVICE_URL:?}",
  })
  expect(baseHost.depends_on).toEqual({
    "package-service": { condition: "service_healthy" },
  })
  expect(baseHost.volumes).toEqual([
    "${SSL_PATH:?}/local.multiplayerdb.dev.crt:/usr/local/share/ca-certificates/local.multiplayerdb.dev.crt:ro",
  ])
  expect(baseHost.build).toBeUndefined()
  expect(baseHost.profiles).toBeUndefined()
  const gateway = objectField(services, "package-service")
  expect(gateway.image).toBe("ghcr.io/example/package-service:${IMAGE_TAG:?}")
  expect(JSON.stringify(gateway.healthcheck)).toContain("/healthcheck")
  const local = yamlObject(written(created.files, "compose.local.yaml"))
  const localServices = objectField(local, "services")
  const host = objectField(
    localServices,
    "package-service-integration-test-host"
  )
  expect(objectField(host, "build").target).toBe("integration-test-host")
  expect(host.entrypoint).toBeUndefined()
  expect(host.command).toBeNull()
  expect(host.user).toBeUndefined()
  expect(host.volumes).toEqual([
    ".:/mnt/package-service",
    "package-service-integration-test-host-yarn:/mnt/package-service/.yarn",
  ])
  expect(host.environment).toBeUndefined()
  expect(host.depends_on).toBeUndefined()

  const existingFiles = new Map<string, string>()
  for (const change of created.files) {
    if (change.type === "write") existingFiles.set(change.path, change.contents)
  }
  existingFiles.set(
    "compose.local.yaml",
    written(created.files, "compose.local.yaml").replace(
      "command: null",
      "command: scripts/integration-local.sh"
    )
  )
  const inherited = reconcile({
    selection,
    contributions,
    prior: created.lock,
    files: existingFiles,
    yarnLockPresent: true,
    pnpPresent: true,
  })
  const inheritedServices = objectField(
    yamlObject(written(inherited.files, "compose.local.yaml")),
    "services"
  )
  expect(
    objectField(inheritedServices, "package-service-integration-test-host")
      .command
  ).toBeNull()
  expect(
    created.files.find(
      (change) => change.path === "scripts/test-integration-ci.sh"
    )
  ).toBeUndefined()
  const manifest = jsonObject(written(created.files, "package.json"))
  const scripts = objectField(manifest, "scripts")
  expect(scripts.bump).toBe("bump-n-pub --bump-only")
  expect(scripts["generate:local:ssl"]).toBe("dev-cluster certs")
  expect(scripts["test:integration:run"]).toBe(
    "vitest run --config vite.integration.config.ts"
  )
  expect(scripts["test:integration:local"]).toBe(
    "docker compose -f compose.base.yaml -f compose.local.yaml up --build --abort-on-container-exit --attach-dependencies package-service-integration-test-host"
  )
  expect(scripts["test:integration:ci"]).toBe(
    "docker compose -f compose.base.yaml up --attach-dependencies --exit-code-from package-service-integration-test-host package-service-integration-test-host"
  )
  expect(scripts["start:containers:local"]).toBe(
    "docker compose -f compose.base.yaml -f compose.local.yaml up --build --abort-on-container-exit --attach-dependencies package-service"
  )
  const unit = written(created.files, "vite.test.config.ts")
  expect(unit).not.toContain("integration/**/*.test.ts")
  expect(written(created.files, "vite.integration.config.ts")).toContain(
    "integration/**/*.test.ts"
  )
  const tsconfig = jsonObject(written(created.files, "tsconfig.json"))
  expect(tsconfig.include).toContain("integration/**/*.ts")
  expect(tsconfig.include).toContain("gateway/**/*.ts")
  const server = contributions.find(
    (contribution) => contribution.id === "runtime:server:index"
  )
  if (server?.kind !== "starter-file") throw new Error("missing server starter")
  expect(server.contents).toContain('"0.0.0.0"')
  expect(server.contents).toContain('path === "/api"')
})

test("an existing gateway config stays in place", () => {
  const contributions = collectContributions(selection, facts)
  const current = "ServerName package-service.local.multiplayerdb.dev\n"
  const created = reconcile({
    selection,
    contributions,
    prior: undefined,
    files: new Map([
      ["package.json", '{ "name": "@example/package-service" }\n'],
      ["gateway/httpd.conf", current],
      ["gateway/public/index.html", "<p>Git service</p>\n"],
    ]),
    yarnLockPresent: true,
    pnpPresent: true,
  })
  expect(
    created.files.find((change) => change.path === "gateway/httpd.conf")
  ).toBeUndefined()
  expect(
    created.files.find((change) => change.path === "gateway/public/index.html")
  ).toBeUndefined()
})

test("integration starters stay application-owned and deselection removes the runtime", () => {
  const contributions = collectContributions(selection, facts)
  const legacyEntrypoint: Contribution = {
    id: "docker:file:scripts/docker-entrypoint-httpd.sh",
    source: "preset:docker",
    kind: "whole-file",
    path: "scripts/docker-entrypoint-httpd.sh",
    contents: "#!/bin/sh\nupdate-ca-certificates\n",
  }
  const legacyCiScript: Contribution = {
    id: "docker:file:scripts/test-integration-ci.sh",
    source: "preset:docker",
    kind: "whole-file",
    path: "scripts/test-integration-ci.sh",
    contents: "#!/bin/sh\nyarn test:integration:run\n",
  }
  const created = reconcile({
    selection,
    contributions: [...contributions, legacyEntrypoint, legacyCiScript],
    prior: undefined,
    files: new Map([
      ["package.json", '{ "name": "@example/package-service" }\n'],
    ]),
    yarnLockPresent: true,
    pnpPresent: true,
  })
  const files = new Map<string, string>()
  for (const change of created.files) {
    if (change.type === "write") files.set(change.path, change.contents)
  }
  files.set("integration/service.test.ts", "export {}\n")
  const kept = reconcile({
    selection,
    contributions,
    prior: created.lock,
    files,
    yarnLockPresent: true,
    pnpPresent: true,
  })
  expect(
    kept.files.find(
      (change) =>
        change.type === "write" && change.path === "integration/service.test.ts"
    )
  ).toBeUndefined()

  expect(kept.files).toContainEqual({
    type: "remove",
    path: "scripts/test-integration-ci.sh",
  })

  const withoutEdge = parseSelection([
    "runtimes=#lib,#server,#client",
    "yarn",
    "typescript",
    "vite",
    "vitest",
    "docker",
  ])
  const removed = reconcile({
    selection: withoutEdge,
    contributions: collectContributions(withoutEdge, facts),
    prior: created.lock,
    files,
    yarnLockPresent: true,
    pnpPresent: true,
  })
  expect(removed.files).toEqual(
    expect.arrayContaining([
      { type: "remove", path: "gateway/Dockerfile" },
      { type: "remove", path: "scripts/docker-entrypoint-httpd.sh" },
      { type: "remove", path: "scripts/test-integration-ci.sh" },
    ])
  )
  expect(
    removed.files.find((change) => change.path === "gateway/httpd.conf")
  ).toBeUndefined()
  expect(
    removed.files.find((change) => change.path === "gateway/public/index.html")
  ).toBeUndefined()
  expect(
    removed.files.find(
      (change) =>
        change.type === "remove" &&
        change.path === "integration/service.test.ts"
    )
  ).toBeUndefined()
  const base = yamlObject(written(removed.files, "compose.base.yaml"))
  const services = objectField(base, "services")
  expect(services["package-service"]).toBeUndefined()
  expect(services["package-api-server"]).toBeDefined()
})

test("httpd without a gateway runtime writes nothing", () => {
  const httpdOnly = parseSelection(["runtimes=#server", "httpd", "docker"])
  const produced = collectContributions(httpdOnly, facts).filter(
    (contribution) => contribution.source === "preset:httpd"
  )
  expect(produced).toEqual([])
  const dockerfile = text(collectContributions(httpdOnly, facts), "Dockerfile")
  expect(dockerfile).not.toContain("integration-test-host")
  expect(dockerfile).not.toContain("gateway/Dockerfile")
})

function text(contributions: readonly Contribution[], path: string): string {
  const found = contributions.find(
    (contribution) =>
      (contribution.kind === "whole-file" ||
        contribution.kind === "dockerfile" ||
        contribution.kind === "starter-file") &&
      contribution.path === path
  )
  if (
    found === undefined ||
    (found.kind !== "whole-file" &&
      found.kind !== "dockerfile" &&
      found.kind !== "starter-file")
  ) {
    throw new Error(`missing file ${path}`)
  }
  return found.contents
}

function written(
  changes: ReturnType<typeof reconcile>["files"],
  path: string
): string {
  const found = changes.find(
    (change) => change.type === "write" && change.path === path
  )
  if (found === undefined || found.type !== "write") {
    throw new Error(`missing write ${path}`)
  }
  return found.contents
}

function yamlObject(contents: string): Record<string, unknown> {
  const document = parseDocument(contents)
  return asRecord(document.toJS())
}

function jsonObject(contents: string): Record<string, unknown> {
  return asRecord(JSON.parse(contents))
}

function objectField(
  value: Record<string, unknown>,
  key: string
): Record<string, unknown> {
  return asRecord(value[key])
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) throw new Error("expected an object")
  return value
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
