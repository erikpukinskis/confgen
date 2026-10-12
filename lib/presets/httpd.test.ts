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

test("the gateway proxies health and API and the integration host stays local", () => {
  const contributions = collectContributions(selection, facts)
  const conf = text(contributions, "gateway/httpd.conf")
  expect(conf).toContain(
    'SSLCertificateFile "/etc/apache2/ssl/local.multiplayerdb.dev.crt"'
  )
  expect(conf).toContain(
    'SSLCertificateKeyFile "/etc/apache2/ssl/local.multiplayerdb.dev.key"'
  )
  expect(conf).toContain(
    "ProxyPass /healthcheck http://package-api-server:7001/healthcheck"
  )
  expect(conf).toContain("ProxyPass /api http://package-api-server:7001/api")
  expect(conf).toContain("DocumentRoot /srv/homepage")
  expect(text(contributions, "gateway/public/index.html")).toContain(
    "Package service"
  )
  expect(text(contributions, "gateway/Dockerfile")).toContain("FROM httpd:2.4")
  expect(text(contributions, "gateway/Dockerfile")).toContain("git")
  expect(text(contributions, "Dockerfile")).toContain(
    "FROM source AS integration-test-host"
  )

  const created = reconcile({
    selection,
    contributions,
    prior: undefined,
    files: new Map([
      ["package.json", '{ "name": "@example/package-service" }\n'],
    ]),
    yarnLockPresent: false,
    pnpPresent: false,
  })
  const base = yamlObject(written(created.files, "compose.base.yaml"))
  const services = objectField(base, "services")
  expect(services["package-service-integration-test-host"]).toBeUndefined()
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
  expect(host.entrypoint).toBe("sh")
  expect(host.command).toBe("scripts/integration-local.sh")
  const ci = written(created.files, "scripts/test-integration-ci.sh")
  expect(ci).toContain("docker compose -f compose.base.yaml")
  expect(ci).toContain("up -d --wait --wait-timeout 120")
  expect(ci).not.toContain("compose.local.yaml")
  expect(ci).toContain(
    "ghcr.io/example/package-service-integration-test-host:${IMAGE_TAG:?}"
  )
  const manifest = jsonObject(written(created.files, "package.json"))
  const scripts = objectField(manifest, "scripts")
  expect(scripts["test:integration:run"]).toBe(
    "vitest run --config vite.integration.config.ts"
  )
  expect(scripts["test:integration:local"]).toBe(
    "dev-cluster up package-service-integration-test-host"
  )
  expect(scripts["test:integration:ci"]).toBe(
    "sh scripts/test-integration-ci.sh"
  )
  expect(scripts["start:containers:local"]).toBe(
    "dev-cluster up package-service"
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
  const created = reconcile({
    selection,
    contributions,
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
      { type: "remove", path: "scripts/integration-local.sh" },
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
        contribution.kind === "starter-file") &&
      contribution.path === path
  )
  if (
    found === undefined ||
    (found.kind !== "whole-file" && found.kind !== "starter-file")
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
