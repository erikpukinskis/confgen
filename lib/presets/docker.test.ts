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
  const dockerfile = text(contributions, "Dockerfile")
  expect(dockerfile).toContain("FROM node:24-bookworm-slim AS base")
  expect(dockerfile).toContain("FROM base AS dev")
  expect(dockerfile).toContain("FROM base AS prod")
  expect(dockerfile).toContain("gosu www-data yarn install --immutable")
  expect(dockerfile).toContain("chown www-data:www-data")
  expect(dockerfile).toContain("/var/www")
  expect(dockerfile).toContain("yarn workspaces focus --production")
  expect(dockerfile).toContain('CMD ["yarn", "node", "dist/server/index.js"]')
  expect(dockerfile).toContain("EXPOSE 7001")
  expect(dockerfile).toContain("COPY client/package.json client/package.json")
  expect(dockerfile).not.toContain(".yalc")
  const dependencies = dockerfile
    .split("FROM base AS dependencies")[1]
    ?.split("FROM dependencies AS source")[0]
  expect(dependencies).toContain("COPY package.json yarn.lock .yarnrc.yml ./")
  expect(dependencies).not.toContain("COPY . .")
  expect(dockerfile).not.toContain("integration-test-host")
  expect(text(contributions, "scripts/docker-entrypoint-node.sh")).toContain(
    "update-ca-certificates"
  )
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
    command: "dev-cluster up package-api-server",
  })
  expect(
    byId(contributions, "docker:script:stop:containers:local")
  ).toMatchObject({
    command: "dev-cluster down",
  })
  const server = contributions.find(
    (contribution) => contribution.id === "runtime:server:index"
  )
  expect(server).toMatchObject({ kind: "starter-file" })
  if (server?.kind !== "starter-file") throw new Error("missing server starter")
  expect(server.contents).toContain('path === "/healthcheck"')
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
  expect(dependency).toMatchObject({ kind: "dependency", range: "0.1.0" })
})

test("compose layers merge and keep unrelated services", () => {
  const identity = containerIdentity(facts.root.name)
  expect(identity.serviceName).toBe("package-api-server")
  expect(identity.alias).toBe("package-api-server.local.multiplayerdb.dev")
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
  expect(service.environment).toEqual({ PORT: String(SERVICE_PORT) })
  expect(service.volumes).toEqual(["${SSL_PATH:?}:/ssl:ro"])
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
    "${SSL_PATH:?}:/ssl:ro",
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
    objectField(local, "services"),
    "schema-service-integration-test-host"
  )
  expect(integration.environment).toMatchObject({
    PACKAGE_SERVICE_URL: "${PACKAGE_SERVICE_URL:?}",
  })
  expect(integration.depends_on).toMatchObject({
    "package-service": { condition: "service_healthy" },
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
  const created = reconcile({
    selection,
    contributions,
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
      contribution.kind === "whole-file" && contribution.path === path
  )
  if (found === undefined || found.kind !== "whole-file") {
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
