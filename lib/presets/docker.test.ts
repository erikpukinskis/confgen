import { collectContributions, type Contribution } from "../contributions.js"
import { ConfgenError } from "../errors.js"
import type { ProjectFacts } from "../facts.js"
import { reconcile } from "../reconcile.js"
import { parseSelection } from "../selection.js"
import {
  assertHttpsOrigin,
  containerIdentity,
  githubRepositoryOwner,
  requiredReference,
  SERVICE_PORT,
} from "./docker.js"
import { expect, test } from "vitest"
import { parseDocument } from "yaml"
import * as ts from "typescript"

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
  "runtimes=#lib,#server,#client",
  "yarn",
  "typescript",
  "vite",
  "docker",
])

test("container contributions describe the ordinary service image", () => {
  const contributions = collectContributions(selection, facts)
  expect(
    contributions.find(
      (contribution) =>
        contribution.kind === "package-script" &&
        contribution.name === "start:server"
    )
  ).toMatchObject({
    command: "vite-node --watch --config vite.server.config.ts server/index.ts",
  })
  const dockerfile = text(contributions, "Dockerfile")
  expect(dockerfile).toContain("FROM node:24-bookworm-slim AS base")
  expect(dockerfile).toContain("FROM base AS dev")
  expect(dockerfile).toContain("FROM base AS prod")
  expect(dockerfile).toContain("gosu www-data yarn install --immutable")
  expect(dockerfile).toContain("chown www-data:www-data")
  expect(dockerfile).toContain("/var/www")
  expect(dockerfile).toContain("yarn workspaces focus --production")
  expect(dockerfile).toContain('CMD ["yarn", "node", "dist/server/index.mjs"]')
  expect(dockerfile).toContain(
    "ENTRYPOINT " +
      JSON.stringify([
        "sh",
        "-c",
        'update-ca-certificates && install -D -o root -g www-data -m 0440 /run/secrets/local.multiplayerdb.dev.key "${SSL_PATH:?}/local.multiplayerdb.dev.key" && exec gosu www-data "$@"',
        "--",
      ])
  )
  const serverEntrypoint = dockerfile
    .split("\n")
    .find((line) => line.startsWith("ENTRYPOINT "))
  if (serverEntrypoint === undefined)
    throw new Error("missing server entrypoint")
  expect(dockerfile.split("FROM base AS prod")[1]).toContain(serverEntrypoint)
  expect(dockerfile).toContain("EXPOSE 443")
  expect(dockerfile).toContain("COPY client/package.json client/package.json")
  expect(dockerfile).not.toContain(".yalc")
  expect(
    byId(contributions, "vite:config:vite.server.config.ts")
  ).toMatchObject({
    kind: "vite-config",
    items: expect.arrayContaining([
      expect.objectContaining({
        id: "property:build-entry-file",
        value: '"index.mjs"',
      }),
    ]),
  })
  expect(byId(contributions, "runtime:server:start")).toMatchObject({
    command: "node dist/server/index.mjs",
  })
  const dependencies = dockerfile
    .split("FROM base AS dependencies")[1]
    ?.split("FROM dependencies AS source")[0]
  expect(dependencies).toContain("COPY package.json yarn.lock .yarnrc.yml ./")
  expect(dependencies).not.toContain("COPY . .")
  expect(dockerfile).not.toContain("integration-test-host")
  expect(
    contributions.some(
      (contribution) =>
        contribution.kind === "whole-file" &&
        contribution.path === "scripts/docker-entrypoint-node.sh"
    )
  ).toBe(false)
  expect(
    contributions.some(
      (contribution) =>
        contribution.kind === "line" &&
        contribution.path === ".dockerignore" &&
        contribution.value === ".yarn"
    )
  ).toBe(true)
  expect(byId(contributions, "docker:script:dev-cluster")).toMatchObject({
    command: "dev-cluster",
  })
  expect(
    byId(contributions, "docker:script:start:containers:local")
  ).toMatchObject({
    command:
      "docker compose -f compose.base.yaml -f compose.local.yaml up --build --abort-on-container-exit --attach-dependencies package-api-server",
  })
  expect(
    byId(contributions, "docker:script:stop:containers:local")
  ).toMatchObject({
    command: "docker compose -f compose.base.yaml -f compose.local.yaml down",
  })
  expect(text(contributions, "Caddyfile.local")).toContain(
    "tls_trust_pool file /certs/local.multiplayerdb.dev.crt"
  )
  const server = contributions.find(
    (contribution) => contribution.id === "runtime:server:index"
  )
  expect(server).toMatchObject({ kind: "starter-file" })
  if (server?.kind !== "starter-file") throw new Error("missing server starter")
  expect(server.contents).toContain('path === "/healthcheck"')
  expect(server.contents).toContain(
    'join(SSL_PATH, "local.multiplayerdb.dev.crt")'
  )
  expect(server.contents).toContain(
    'join(SSL_PATH, "local.multiplayerdb.dev.key")'
  )
  expect(server.contents).toContain(
    'throw new Error("SSL_PATH must be an absolute path")'
  )
  expect(
    ts.transpileModule(server.contents, {
      reportDiagnostics: true,
      compilerOptions: { target: ts.ScriptTarget.ES2024 },
    }).diagnostics
  ).toEqual([])
})

test("gateway Compose serves HTTPS and verifies the Node API on port 7001", () => {
  const gatewaySelection = parseSelection([
    "runtimes=#lib,#server,#integration,#gateway",
    "yarn",
    "typescript",
    "vite",
    "httpd",
    "docker",
  ])
  const contributions = collectContributions(gatewaySelection, facts)
  const created = reconcile({
    selection: gatewaySelection,
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
  const api = objectField(services, "package-api-server")
  expect(api.environment).toMatchObject({ PORT: "7001" })
  expect(api.environment).toMatchObject({
    SSL_PATH: "/ssl",
  })
  expect(api.volumes).toEqual([
    "${SSL_PATH:?}/local.multiplayerdb.dev.crt:/usr/local/share/ca-certificates/local.multiplayerdb.dev.crt:ro",
    "${SSL_PATH:?}/local.multiplayerdb.dev.key:/run/secrets/local.multiplayerdb.dev.key:ro",
  ])
  expect(api.networks).toMatchObject({
    default: { aliases: ["package-api-server.local.multiplayerdb.dev"] },
  })
  expect(api.healthcheck).toMatchObject({
    test: expect.stringContaining(
      "https://package-api-server.local.multiplayerdb.dev:7001/healthcheck"
    ),
  })
  const gateway = objectField(services, "package-service")
  expect(gateway.healthcheck).toMatchObject({
    test: expect.stringContaining(
      "https://package-service.local.multiplayerdb.dev/healthcheck"
    ),
  })
  expect(written(created.files, "Dockerfile")).toContain("EXPOSE 7001")
  const gatewayDockerfile = written(created.files, "gateway/Dockerfile")
  expect(gatewayDockerfile).toContain(
    String.raw`ENTRYPOINT ["sh", "-c", "update-ca-certificates && exec \"$@\"", "--"]`
  )
  expect(gatewayDockerfile).not.toContain("docker-entrypoint-httpd.sh")
  expect(text(contributions, "gateway/httpd.conf")).toContain(
    'SSLCertificateFile "/usr/local/share/ca-certificates/local.multiplayerdb.dev.crt"'
  )
  expect(text(contributions, "gateway/Dockerfile")).toContain(
    "update-ca-certificates"
  )
  const integration = objectField(
    services,
    "package-service-integration-test-host"
  )
  expect(integration.volumes).toEqual([
    "${SSL_PATH:?}/local.multiplayerdb.dev.crt:/usr/local/share/ca-certificates/local.multiplayerdb.dev.crt:ro",
  ])
  expect(objectField(base, "services")).not.toHaveProperty("caddy")
  expect(text(contributions, "Caddyfile.local")).toContain(
    "reverse_proxy {labels.3}:443"
  )
})

test("selected runtimes change the image and omit a service without a server", () => {
  const serverOnly = parseSelection(["runtimes=#server", "docker"])
  const serverDockerfile = text(
    collectContributions(serverOnly, facts),
    "Dockerfile"
  )
  expect(serverDockerfile).not.toContain("client/package.json")
  expect(serverDockerfile).toContain("/mnt/package-service")

  const library = parseSelection(["runtimes=#lib", "docker"])
  const produced = collectContributions(library, facts).filter(
    (contribution) => contribution.source === "preset:docker"
  )
  expect(produced).toEqual([])

  const plainServer = parseSelection(["runtimes=#lib,#server", "vite"])
  const starter = collectContributions(plainServer, facts).find(
    (contribution) => contribution.id === "runtime:server:index"
  )
  if (starter?.kind !== "starter-file")
    throw new Error("missing server starter")
  expect(starter.contents).not.toContain("/healthcheck")
})

test("Docker includes only a local Confgen dependency before dependency install", () => {
  const withLocalConfgen: ProjectFacts = {
    root: {
      ...root,
      dependencyRanges: {
        dependencies: {},
        devDependencies: { confgen: "file:.yalc/confgen" },
        peerDependencies: {},
      },
    },
    packages: [],
  }
  const generated = collectContributions(selection, withLocalConfgen)
  const dockerfile = text(generated, "Dockerfile")
  const dependencies = dockerfile
    .split("FROM base AS dependencies")[1]
    ?.split("FROM dependencies AS source")[0]
  const production = dockerfile.split("FROM base AS prod")[1]
  expect(dependencies).toContain("COPY .yalc/confgen .yalc/confgen")
  expect(production).not.toContain(".yalc")
  const ignored = generated.flatMap((contribution) =>
    contribution.kind === "line" && contribution.path === ".dockerignore"
      ? [contribution.value]
      : []
  )
  expect(ignored).toEqual(
    expect.arrayContaining([
      ".yalc",
      "!.yalc/",
      ".yalc/*",
      "!.yalc/confgen/",
      "!.yalc/confgen/**",
    ])
  )

  const withPublishedConfgen: ProjectFacts = {
    ...withLocalConfgen,
    root: {
      ...withLocalConfgen.root,
      dependencyRanges: {
        dependencies: {},
        devDependencies: { confgen: "0.96.0" },
        peerDependencies: {},
      },
    },
  }
  const published = collectContributions(selection, withPublishedConfgen)
  expect(text(published, "Dockerfile")).not.toContain(".yalc")
  expect(
    published.some(
      (contribution) =>
        contribution.kind === "line" &&
        contribution.path === ".dockerignore" &&
        contribution.value.startsWith("!.yalc")
    )
  ).toBe(false)
})

test("replaces the local yalc dev-cluster link with its published version", () => {
  const packageWithLocalDevCluster: ProjectFacts = {
    root: {
      ...root,
      dependencyRanges: {
        dependencies: {},
        devDependencies: { "dev-cluster": "file:.yalc/dev-cluster" },
        peerDependencies: {},
      },
    },
    packages: [
      {
        ...root,
        dependencyRanges: {
          dependencies: {},
          devDependencies: { "dev-cluster": "file:.yalc/dev-cluster" },
          peerDependencies: {},
        },
      },
    ],
  }
  const dependency = collectContributions(
    selection,
    packageWithLocalDevCluster
  ).find(
    (contribution) =>
      contribution.kind === "dependency" &&
      contribution.package === "dev-cluster"
  )
  expect(dependency).toMatchObject({ kind: "dependency", range: "0.2.0" })
})

test("compose layers merge and keep unrelated services", () => {
  const identity = containerIdentity(facts.root.name)
  expect(identity.serviceName).toBe("package-api-server")
  const contributions = collectContributions(selection, facts)
  const created = reconcile({
    selection,
    contributions,
    prior: undefined,
    files: new Map([
      ["package.json", '{ "name": "@example/package-service" }\n'],
      [
        "compose.base.yaml",
        "services:\n  custom-api:\n    image: custom:kept\n    extra: true\n",
      ],
    ]),
    yarnLockPresent: false,
    pnpPresent: false,
  })
  const base = yamlObject(written(created.files, "compose.base.yaml"))
  const services = objectField(base, "services")
  expect(objectField(services, "custom-api")).toMatchObject({
    image: "custom:kept",
    extra: true,
  })
  const service = objectField(services, "package-api-server")
  expect(service.image).toBe(
    "ghcr.io/example/package-api-server:${IMAGE_TAG:?}"
  )
  expect(service.environment).toMatchObject({
    PORT: "443",
    SSL_PATH: "/ssl",
  })
  expect(service.networks).toMatchObject({
    default: {
      aliases: ["package-service", "package-service.local.multiplayerdb.dev"],
    },
  })
  expect(service.healthcheck).toMatchObject({
    test: expect.stringContaining(
      "https://package-service.local.multiplayerdb.dev:443"
    ),
  })
  expect(service.volumes).toEqual([
    "${SSL_PATH:?}/local.multiplayerdb.dev.crt:/usr/local/share/ca-certificates/local.multiplayerdb.dev.crt:ro",
    "${SSL_PATH:?}/local.multiplayerdb.dev.key:/run/secrets/local.multiplayerdb.dev.key:ro",
  ])
  expect(JSON.stringify(service)).not.toContain(":/mnt/")
  const local = yamlObject(written(created.files, "compose.local.yaml"))
  const localService = objectField(
    objectField(local, "services"),
    "package-api-server"
  )
  expect(objectField(localService, "build")).toMatchObject({ target: "dev" })
  expect(localService.volumes).toEqual([
    ".:/mnt/package-service",
    "package-api-server-yarn:/mnt/package-service/.yarn",
  ])

  const withMount = reconcile({
    selection,
    contributions,
    prior: undefined,
    files: new Map([
      ["package.json", '{ "name": "@example/package-service" }\n'],
      [
        "compose.base.yaml",
        "services:\n  package-api-server:\n    volumes:\n      - git-repos:/srv/git\n",
      ],
    ]),
    yarnLockPresent: true,
    pnpPresent: true,
  })
  const mounted = objectField(
    objectField(
      yamlObject(written(withMount.files, "compose.base.yaml")),
      "services"
    ),
    "package-api-server"
  )
  expect(mounted.volumes).toEqual([
    "git-repos:/srv/git",
    "${SSL_PATH:?}/local.multiplayerdb.dev.crt:/usr/local/share/ca-certificates/local.multiplayerdb.dev.crt:ro",
    "${SSL_PATH:?}/local.multiplayerdb.dev.key:/run/secrets/local.multiplayerdb.dev.key:ro",
  ])

  const conflict = () =>
    reconcile({
      selection,
      contributions,
      prior: undefined,
      files: new Map([
        ["package.json", '{ "name": "@example/package-service" }\n'],
        ["compose.base.yaml", "services: custom\n"],
      ]),
      yarnLockPresent: true,
      pnpPresent: true,
    })
  expect(conflict).toThrow(ConfgenError)
})

test("composes the installed Package Service dependency", () => {
  const schemaRoot = {
    ...root,
    name: "@example/schema-service",
    repository: {
      type: "git",
      url: "https://github.com/example/schema-service.git",
    },
    dependencies: ["@multiplayerdb/package-service"],
  }
  const packageFacts: ProjectFacts = {
    root: schemaRoot,
    packages: [schemaRoot],
  }
  const packageSelection = parseSelection([
    "runtimes=#lib,#server,#integration",
    "yarn",
    "typescript",
    "vite",
    "vitest",
    "docker",
  ])
  const contributions = collectContributions(packageSelection, packageFacts)
  const created = reconcile({
    selection: packageSelection,
    contributions,
    prior: undefined,
    files: new Map([
      [
        "package.json",
        '{ "name": "@example/schema-service", "devDependencies": { "@multiplayerdb/package-service": "0.8.0" } }\n',
      ],
    ]),
    yarnLockPresent: false,
    pnpPresent: false,
  })
  const base = yamlObject(written(created.files, "compose.base.yaml"))
  expect(base.include).toEqual([
    {
      path: "${PACKAGE_SERVICE_PATH:?}/compose.base.yaml",
      project_directory: "${PACKAGE_SERVICE_PATH}",
    },
  ])
  const service = objectField(
    objectField(base, "services"),
    "schema-api-server"
  )
  expect(service.environment).toMatchObject({
    PACKAGE_SERVICE_URL: "${PACKAGE_SERVICE_URL:?}",
  })
  expect(service.depends_on).toMatchObject({
    "package-service": { condition: "service_healthy" },
  })
  const local = yamlObject(written(created.files, "compose.local.yaml"))
  expect(local.include).toEqual([
    {
      path: "${PACKAGE_SERVICE_PATH:?}/compose.local.yaml",
      project_directory: "${PACKAGE_SERVICE_PATH}",
    },
  ])
  const integration = objectField(
    objectField(base, "services"),
    "schema-service-integration-test-host"
  )
  expect(integration.environment).toMatchObject({
    PACKAGE_SERVICE_URL: "${PACKAGE_SERVICE_URL:?}",
  })
  expect(integration.depends_on).toMatchObject({
    "package-service": { condition: "service_healthy" },
  })
  expect(integration.volumes).toContain(
    "${SSL_PATH:?}/local.multiplayerdb.dev.crt:/usr/local/share/ca-certificates/local.multiplayerdb.dev.crt:ro"
  )
  const integrationDockerfile = text(contributions, "Dockerfile").split(
    "FROM source AS integration-test-host"
  )[1]
  expect(integrationDockerfile).toContain(
    String.raw`ENTRYPOINT ["sh", "-c", "update-ca-certificates && exec gosu www-data \"$@\"", "--"]`
  )
  expect(integration.entrypoint).toBeUndefined()
  expect(integration.user).toBeUndefined()
  expect(
    contributions.find(
      (contribution) =>
        contribution.kind === "package-script" &&
        contribution.name === "test:integration:local"
    )
  ).toMatchObject({
    command: expect.stringContaining("schema-service-integration-test-host"),
  })
})

test("dockerignore keeps application lines", () => {
  const contributions = collectContributions(selection, facts)
  const created = reconcile({
    selection,
    contributions,
    prior: undefined,
    files: new Map([
      ["package.json", '{ "name": "@example/package-service" }\n'],
      [".dockerignore", "repos\n"],
    ]),
    yarnLockPresent: true,
    pnpPresent: true,
  })
  const ignore = written(created.files, ".dockerignore")
  expect(ignore).toContain("repos")
  expect(ignore).toContain(".yarn")
  expect(ignore).toContain(".yalc")
  expect(ignore).toContain(".yalc-store")
  expect(ignore).toContain("yalc.lock")
})

test("environment contracts accept origins and reject paths", () => {
  expect(
    assertHttpsOrigin(
      "PACKAGE_SERVICE_URL",
      "https://package-service.local.multiplayerdb.dev"
    )
  ).toBe("https://package-service.local.multiplayerdb.dev")
  expect(() =>
    assertHttpsOrigin(
      "PACKAGE_SERVICE_URL",
      "https://package-service.local.multiplayerdb.dev/api"
    )
  ).toThrow(ConfgenError)
  expect(() =>
    assertHttpsOrigin("PACKAGE_SERVICE_URL", "http://package-service.local")
  ).toThrow(ConfgenError)
  expect(requiredReference("SSL_PATH")).toBe("${SSL_PATH:?}")
  expect(
    githubRepositoryOwner("git://github.com/multiplayerdb/package-service.git")
  ).toBe("multiplayerdb")
  expect(() =>
    githubRepositoryOwner("https://gitlab.com/example/service.git")
  ).toThrow(ConfgenError)
  expect(requiredReference("PACKAGE_SERVICE_URL")).toBe(
    "${PACKAGE_SERVICE_URL:?}"
  )
  expect(() => requiredReference("NODE_AUTH_TOKEN")).toThrow(ConfgenError)
})

test("deselecting docker removes its container assets", () => {
  const contributions = collectContributions(selection, facts)
  const legacyEntrypoint: Contribution = {
    id: "docker:file:scripts/docker-entrypoint-node.sh",
    source: "preset:docker",
    kind: "whole-file",
    path: "scripts/docker-entrypoint-node.sh",
    contents: "#!/bin/sh\nupdate-ca-certificates\n",
  }
  const created = reconcile({
    selection,
    contributions: [...contributions, legacyEntrypoint],
    prior: undefined,
    files: new Map([
      ["package.json", '{ "name": "@example/package-service" }\n'],
      [
        "compose.base.yaml",
        "services:\n  custom-api:\n    image: custom:kept\n",
      ],
    ]),
    yarnLockPresent: false,
    pnpPresent: false,
  })
  const files = new Map<string, string>([
    ["package.json", written(created.files, "package.json")],
    ["compose.base.yaml", written(created.files, "compose.base.yaml")],
    ["compose.local.yaml", written(created.files, "compose.local.yaml")],
    ["Dockerfile", written(created.files, "Dockerfile")],
    [
      "scripts/docker-entrypoint-node.sh",
      written(created.files, "scripts/docker-entrypoint-node.sh"),
    ],
    [".dockerignore", written(created.files, ".dockerignore")],
  ])
  const withoutDocker = parseSelection([
    "runtimes=#lib,#server,#client",
    "yarn",
    "typescript",
    "vite",
  ])
  const removed = reconcile({
    selection: withoutDocker,
    contributions: collectContributions(withoutDocker, facts),
    prior: created.lock,
    files,
    yarnLockPresent: true,
    pnpPresent: true,
  })
  expect(removed.files).toEqual(
    expect.arrayContaining([
      { type: "remove", path: "Dockerfile" },
      { type: "remove", path: "scripts/docker-entrypoint-node.sh" },
    ])
  )
  const base = yamlObject(written(removed.files, "compose.base.yaml"))
  const services = objectField(base, "services")
  expect(services["package-api-server"]).toBeUndefined()
  expect(objectField(services, "custom-api").image).toBe("custom:kept")
  const manifest = jsonObject(written(removed.files, "package.json"))
  const scripts = manifest.scripts
  expect(
    isRecord(scripts) ? scripts["start:containers:local"] : undefined
  ).toBe(undefined)
  const devDependencies = manifest.devDependencies
  expect(
    isRecord(devDependencies) ? devDependencies["dev-cluster"] : undefined
  ).toBeUndefined()
})

function byId(
  contributions: readonly Contribution[],
  id: string
): Contribution {
  const found = contributions.find((contribution) => contribution.id === id)
  if (found === undefined) throw new Error(`missing contribution ${id}`)
  return found
}

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
