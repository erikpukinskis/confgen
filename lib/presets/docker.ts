import type {
  Contribution,
  JsonValue,
  ProduceContributions,
  StructuredAddress,
} from "../contributions"
import { ConfgenError } from "../errors"
import type { ProjectFacts } from "../facts"
import type { Selection } from "../selection"
import { NODE_VERSION, YARN_VERSION } from "../toolchain"

/** Node API containers listen on this port inside their own network namespace. */
export const SERVICE_PORT = 7001

const DEV_CLUSTER_VERSION = "0.2.0"
const SERVER_ENTRYPOINT = [
  "sh",
  "-c",
  'update-ca-certificates && install -D -o root -g www-data -m 0440 /run/secrets/local.multiplayerdb.dev.key "${SSL_PATH:?}/local.multiplayerdb.dev.key" && exec gosu www-data "$@"',
  "--",
]

/**
 * Docker owns the ordinary Node service image, Compose layers, and the
 * direct local Compose commands.
 */
export const contributions: ProduceContributions = (selection, facts) => {
  if (!selection.runtimes.includes("server")) return []
  const identity = requireContainerIdentity(facts)
  const corner = gatewaySelected(selection)
    ? identity.gatewayServiceName
    : identity.serviceName
  const produced: Contribution[] = [
    dependency(
      "dev-cluster",
      process.env.DEV_CLUSTER_VERSION ?? DEV_CLUSTER_VERSION
    ),
    script("dev-cluster", "dev-cluster"),
    script("generate:local:ssl", "dev-cluster certs"),
    script(
      "start:containers:local",
      `docker compose -f compose.base.yaml -f compose.local.yaml up --build --abort-on-container-exit --attach-dependencies ${corner}`
    ),
    script(
      "stop:containers:local",
      "docker compose -f compose.base.yaml -f compose.local.yaml down"
    ),
    script("start:server", startServerCommand(selection)),
    dockerfileContribution(
      "Dockerfile",
      dockerfile(selection, identity, facts)
    ),
    wholeFile("Caddyfile.local", LOCAL_CADDYFILE),
    ...dockerignoreLines(facts),
    ...baseCompose(selection, identity, facts),
    ...localCompose(selection, identity),
    ...packageServiceCompose(facts),
  ]
  if (selection.runtimes.includes("integration")) {
    assertHttpsOrigin(identity.serviceUrlName, identity.serviceUrl)
  }
  if (gatewaySelected(selection)) {
    produced.push(
      dockerfileContribution("gateway/Dockerfile", GATEWAY_DOCKERFILE)
    )
  }
  return produced
}

function packageServiceCompose(facts: ProjectFacts): Contribution[] {
  if (!facts.root.dependencies.includes("@multiplayerdb/package-service")) {
    return []
  }
  return [
    yaml(
      "package-service-base-include",
      "compose.base.yaml",
      ["include"],
      [
        {
          path: `${requiredReference(
            "PACKAGE_SERVICE_PATH"
          )}/compose.base.yaml`,
          project_directory: "${PACKAGE_SERVICE_PATH}",
        },
      ],
      "merge"
    ),
    yaml(
      "package-service-local-include",
      "compose.local.yaml",
      ["include"],
      [
        {
          path: `${requiredReference(
            "PACKAGE_SERVICE_PATH"
          )}/compose.local.yaml`,
          project_directory: "${PACKAGE_SERVICE_PATH}",
        },
      ],
      "merge"
    ),
  ]
}

function gatewaySelected(selection: Selection): boolean {
  return (
    selection.runtimes.includes("gateway") &&
    selection.presets.includes("httpd")
  )
}

export type ContainerIdentity = {
  directoryName: string
  serviceName: string
  workdir: string
  yarnVolume: string
  /** GitHub owner used in published GHCR image names. Empty when no repository URL was supplied. */
  owner: string
  image: string
  gatewayServiceName: string
  gatewayAlias: string
  gatewayImage: string
  integrationServiceName: string
  integrationImage: string
  integrationYarnVolume: string
  serviceUrlName: string
  serviceUrl: string
}

/**
 * Service names come from the root package. GHCR image names also require the
 * repository URL so Compose refers to the images the publication workflow pushes.
 */
export function requireContainerIdentity(
  facts: ProjectFacts
): ContainerIdentity {
  const repository = facts.root.repository
  if (repository === undefined) {
    throw new ConfgenError([
      "package.json repository is required to name the published GHCR images.",
    ])
  }
  return containerIdentity(facts.root.name, repository.url)
}

/** Owner segment of a github.com repository URL. */
export function githubRepositoryOwner(repositoryUrl: string): string {
  const parsed = repositoryUrl.startsWith("git@github.com:")
    ? `https://github.com/${repositoryUrl.slice("git@github.com:".length)}`
    : repositoryUrl
  let url: URL
  try {
    url = new URL(parsed)
  } catch {
    throw new ConfgenError([
      `package.json repository must be a GitHub repository URL ("${repositoryUrl}").`,
    ])
  }
  if (url.hostname !== "github.com") {
    throw new ConfgenError([
      `package.json repository must be a GitHub repository URL ("${repositoryUrl}").`,
    ])
  }
  const owner = url.pathname
    .split("/")
    .filter((segment) => segment.length > 0)[0]
  if (owner === undefined) {
    throw new ConfgenError([
      `package.json repository must include a GitHub owner ("${repositoryUrl}").`,
    ])
  }
  return owner
}

/** Globally distinctive service names derived from the root package name. */
export function containerIdentity(
  packageName: string,
  repositoryUrl?: string
): ContainerIdentity {
  const slash = packageName.lastIndexOf("/")
  const directoryName = slash < 0 ? packageName : packageName.slice(slash + 1)
  const stem = directoryName.endsWith("-service")
    ? directoryName.slice(0, -"-service".length)
    : directoryName
  const serviceName = `${stem}-api-server`
  const gatewayServiceName = directoryName
  const integrationServiceName = `${directoryName}-integration-test-host`
  const serviceUrlName = `${directoryName
    .toUpperCase()
    .replaceAll("-", "_")}_URL`
  const owner =
    repositoryUrl === undefined ? "" : githubRepositoryOwner(repositoryUrl)
  const tag = requiredReference("IMAGE_TAG")
  return {
    directoryName,
    serviceName,
    workdir: `/mnt/${directoryName}`,
    yarnVolume: `${serviceName}-yarn`,
    owner,
    image: publishedImage(owner, serviceName, tag),
    gatewayServiceName,
    gatewayAlias: `${gatewayServiceName}.local.multiplayerdb.dev`,
    gatewayImage: publishedImage(owner, gatewayServiceName, tag),
    integrationServiceName,
    integrationImage: publishedImage(owner, integrationServiceName, tag),
    integrationYarnVolume: `${integrationServiceName}-yarn`,
    serviceUrlName,
    serviceUrl: `https://${gatewayServiceName}.local.multiplayerdb.dev`,
  }
}

/**
 * Accepts an https origin with no user, path, query, or fragment.
 * Compose URL variables use this shape.
 */
export function assertHttpsOrigin(name: string, value: string): string {
  if (!name.endsWith("_URL")) {
    throw new ConfgenError([`${name} must be a *_URL environment variable.`])
  }
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new ConfgenError([
      `${name} must be an https:// host without a path ("${value}").`,
    ])
  }
  if (url.protocol !== "https:" || value !== url.origin) {
    throw new ConfgenError([
      `${name} must be an https:// host without a path ("${value}").`,
    ])
  }
  return value
}

/** Compose interpolation that fails closed when the variable is missing. */
export function requiredReference(name: string): string {
  if (
    name !== "IMAGE_TAG" &&
    !name.endsWith("_URL") &&
    !name.endsWith("_PATH")
  ) {
    throw new ConfgenError([
      `${name} must be IMAGE_TAG, a *_URL variable, or a *_PATH variable.`,
    ])
  }
  return `\${${name}:?}`
}

const LOCAL_CADDYFILE = `{
  auto_https off
}

http://*.local.multiplayerdb.dev {
  redir https://{host}{uri}
}

*.local.multiplayerdb.dev {
  tls /certs/local.multiplayerdb.dev.crt /certs/local.multiplayerdb.dev.key
  reverse_proxy {labels.3}:443 {
    header_up Host {host}
    transport http {
      tls
      tls_server_name {host}
      tls_trust_pool file /certs/local.multiplayerdb.dev.crt
    }
  }
}
`

const DOCKERIGNORE_LINES: readonly (readonly [string, string])[] = [
  ["node-modules", "node_modules"],
  ["yarn", ".yarn"],
  ["pnp", ".pnp.*"],
  ["dist", "dist"],
  ["client-dist", "client/dist"],
  ["git", ".git"],
  ["ssl", "ssl"],
  ["yalc-store", ".yalc-store"],
  ["yalc-lock", "yalc.lock"],
]

function hasLocalConfgen(facts: ProjectFacts): boolean {
  return (
    facts.root.dependencyRanges?.devDependencies.confgen ===
    "file:.yalc/confgen"
  )
}

function dockerignoreLines(facts: ProjectFacts): Contribution[] {
  const lines = DOCKERIGNORE_LINES.map(([id, value]) => line(id, value))
  if (hasLocalConfgen(facts)) {
    lines.push(
      line("yalc", ".yalc"),
      line("yalc-a-open", "!.yalc/"),
      line("yalc-b-hide-others", ".yalc/*"),
      line("yalc-c-open-confgen", "!.yalc/confgen/"),
      line("yalc-d-open-confgen-files", "!.yalc/confgen/**")
    )
  } else {
    lines.push(line("yalc", ".yalc"))
  }
  return lines
}

function publishedImage(
  owner: string,
  serviceName: string,
  tag: string
): string {
  if (owner.length === 0) return `${serviceName}:${tag}`
  return `ghcr.io/${owner}/${serviceName}:${tag}`
}

/** Root and workspace manifests Yarn needs before it installs. */
function manifestCopies(
  selection: Selection,
  facts: ProjectFacts,
  includeLocalConfgen = false
): string {
  const workspaces = new Set(facts.root.workspaces)
  if (selection.runtimes.includes("client")) workspaces.add("client")
  const lines = ["COPY package.json yarn.lock .yarnrc.yml ./"]
  for (const workspace of [...workspaces].sort()) {
    lines.push(`COPY ${workspace}/package.json ${workspace}/package.json`)
  }
  if (includeLocalConfgen && hasLocalConfgen(facts)) {
    lines.push("COPY .yalc/confgen .yalc/confgen")
  }
  return `${lines.join("\n")}\n`
}

function line(id: string, value: string): Contribution {
  return {
    id: `docker:ignore:${id}`,
    source: "preset:docker",
    kind: "line",
    path: ".dockerignore",
    value,
  }
}

function startServerCommand(selection: Selection): string {
  if (selection.presets.includes("vite")) {
    return "vite-node --watch --config vite.server.config.ts server/index.ts"
  }
  if (!selection.presets.includes("graphql")) {
    return "node --watch server/index.ts"
  }
  return "node --watch --import ./gql/registerGraphqlRaw.mjs server/index.ts"
}

function dockerfile(
  selection: Selection,
  identity: ContainerIdentity,
  facts: ProjectFacts
): string {
  const manifests = manifestCopies(selection, facts, true)
  return `##################################
FROM node:${NODE_VERSION}-bookworm-slim AS base

RUN apt-get update \\
  && apt-get install -y git curl gosu ca-certificates \\
  && rm -rf /var/lib/apt/lists/*

ENV COREPACK_HOME=/usr/local/share/corepack
RUN corepack enable \\
  && corepack install --global yarn@${YARN_VERSION}

RUN mkdir -p /var/www ${identity.workdir}/.yarn \\
  && chown www-data:www-data \\
  /var/www \\
  ${identity.workdir} \\
  ${identity.workdir}/.yarn

ENV HOME=/var/www

ENV NODE_EXTRA_CA_CERTS=/etc/ssl/certs/ca-certificates.crt

RUN mkdir -p /ssl \\
  && ln -s /usr/local/share/ca-certificates/local.multiplayerdb.dev.crt /ssl/local.multiplayerdb.dev.crt

WORKDIR ${identity.workdir}
EXPOSE ${gatewaySelected(selection) ? SERVICE_PORT : 443}

################
FROM base AS dev
ENTRYPOINT ${JSON.stringify(SERVER_ENTRYPOINT)}
CMD ["sh", "-c", "yarn install --immutable && yarn start:server"]

#########################
FROM base AS dependencies
${manifests}RUN gosu www-data yarn install --immutable

###########################
FROM dependencies AS source
COPY . .

######################
FROM source AS builder
RUN yarn build
${integrationStage(selection)}
#################
FROM base AS prod
${manifestCopies(selection, facts)}RUN yarn workspaces focus --production
COPY --from=builder ${identity.workdir}/dist/server ./dist/server
ENTRYPOINT ${JSON.stringify(SERVER_ENTRYPOINT)}
CMD ["yarn", "node", "dist/server/index.mjs"]
`
}

function integrationStage(selection: Selection): string {
  if (!selection.runtimes.includes("integration")) return ""
  return `
####################################
FROM source AS integration-test-host
ENTRYPOINT ["sh", "-c", "update-ca-certificates && exec gosu www-data \\\"$@\\\"", "--"]
CMD ["sh", "-c", "yarn install --immutable && exec yarn test:integration:run"]
`
}

function baseCompose(
  selection: Selection,
  identity: ContainerIdentity,
  facts: ProjectFacts
): Contribution[] {
  const includesPackageService = facts.root.dependencies.includes(
    "@multiplayerdb/package-service"
  )
  const port = gatewaySelected(selection) ? SERVICE_PORT : 443
  const publicAlias = `${identity.gatewayServiceName}.local.multiplayerdb.dev`
  const service: JsonValue = {
    image: identity.image,
    environment: {
      PORT: String(port),
      SSL_PATH: "/ssl",
      ...(includesPackageService
        ? { PACKAGE_SERVICE_URL: requiredReference("PACKAGE_SERVICE_URL") }
        : {}),
    },
    ...(includesPackageService
      ? {
          depends_on: {
            "package-service": { condition: "service_healthy" },
          },
        }
      : {}),
    volumes: [
      `${requiredReference(
        "SSL_PATH"
      )}/local.multiplayerdb.dev.crt:/usr/local/share/ca-certificates/local.multiplayerdb.dev.crt:ro`,
      `${requiredReference(
        "SSL_PATH"
      )}/local.multiplayerdb.dev.key:/run/secrets/local.multiplayerdb.dev.key:ro`,
    ],
    networks: {
      default: {
        aliases: gatewaySelected(selection)
          ? [`${identity.serviceName}.local.multiplayerdb.dev`]
          : [identity.directoryName, publicAlias],
      },
    },
    healthcheck: {
      test: `curl --fail https://${
        gatewaySelected(selection)
          ? `${identity.serviceName}.local.multiplayerdb.dev:7001`
          : `${publicAlias}:443`
      }/healthcheck`,
      interval: "1s",
      retries: 240,
      start_period: "0s",
      timeout: "1s",
    },
  }
  return [
    yaml(
      "base-name",
      "compose.base.yaml",
      ["name"],
      "multiplayerdb",
      "replace"
    ),
    yaml(
      "base-service",
      "compose.base.yaml",
      ["services", identity.serviceName],
      service,
      "merge"
    ),
    ...gatewayBase(selection, identity),
    ...integrationBase(selection, identity, facts),
  ]
}

function localCompose(
  selection: Selection,
  identity: ContainerIdentity
): Contribution[] {
  const service: JsonValue = {
    build: {
      context: ".",
      dockerfile: "./Dockerfile",
      target: "dev",
    },
    volumes: [
      `.:${identity.workdir}`,
      `${identity.yarnVolume}:${identity.workdir}/.yarn`,
    ],
  }
  return [
    yaml(
      "local-service",
      "compose.local.yaml",
      ["services", identity.serviceName],
      service,
      "merge"
    ),
    yaml(
      "local-volume",
      "compose.local.yaml",
      ["volumes", identity.yarnVolume],
      {},
      "replace"
    ),
    ...gatewayLocal(selection, identity),
    ...integrationLocal(selection, identity),
  ]
}

function gatewayBase(
  selection: Selection,
  identity: ContainerIdentity
): Contribution[] {
  if (!gatewaySelected(selection)) return []
  const service: JsonValue = {
    image: identity.gatewayImage,
    depends_on: {
      [identity.serviceName]: {
        condition: "service_healthy",
      },
    },
    volumes: [
      `${requiredReference(
        "SSL_PATH"
      )}/local.multiplayerdb.dev.crt:/usr/local/share/ca-certificates/local.multiplayerdb.dev.crt:ro`,
      `${requiredReference(
        "SSL_PATH"
      )}/local.multiplayerdb.dev.key:/etc/apache2/ssl/local.multiplayerdb.dev.key:ro`,
    ],
    networks: {
      default: {
        aliases: [identity.gatewayAlias],
      },
    },
    healthcheck: {
      test: `curl --fail https://${identity.gatewayAlias}/healthcheck`,
      interval: "1s",
      retries: 240,
      start_period: "0s",
      timeout: "1s",
    },
  }
  return [
    yaml(
      "base-gateway",
      "compose.base.yaml",
      ["services", identity.gatewayServiceName],
      service,
      "merge"
    ),
  ]
}

function gatewayLocal(
  selection: Selection,
  identity: ContainerIdentity
): Contribution[] {
  if (!gatewaySelected(selection)) return []
  const service: JsonValue = {
    build: {
      context: ".",
      dockerfile: "./gateway/Dockerfile",
    },
  }
  return [
    yaml(
      "local-gateway",
      "compose.local.yaml",
      ["services", identity.gatewayServiceName],
      service,
      "merge"
    ),
  ]
}

function integrationBase(
  selection: Selection,
  identity: ContainerIdentity,
  facts: ProjectFacts
): Contribution[] {
  if (!selection.runtimes.includes("integration")) return []
  const upstream = gatewaySelected(selection)
    ? identity.gatewayServiceName
    : identity.serviceName
  const service: JsonValue = {
    image: identity.integrationImage,
    environment: {
      [identity.serviceUrlName]: requiredReference(identity.serviceUrlName),
      ...(facts.root.dependencies.includes("@multiplayerdb/package-service")
        ? { PACKAGE_SERVICE_URL: requiredReference("PACKAGE_SERVICE_URL") }
        : {}),
    },
    depends_on: {
      [upstream]: {
        condition: "service_healthy",
      },
      ...(facts.root.dependencies.includes("@multiplayerdb/package-service")
        ? {
            "package-service": { condition: "service_healthy" },
          }
        : {}),
    },
    volumes: [
      `${requiredReference(
        "SSL_PATH"
      )}/local.multiplayerdb.dev.crt:/usr/local/share/ca-certificates/local.multiplayerdb.dev.crt:ro`,
    ],
  }
  return [
    yaml(
      "base-integration",
      "compose.base.yaml",
      ["services", identity.integrationServiceName],
      service,
      "merge"
    ),
  ]
}

function integrationLocal(
  selection: Selection,
  identity: ContainerIdentity
): Contribution[] {
  if (!selection.runtimes.includes("integration")) return []
  const service: JsonValue = {
    build: {
      context: ".",
      dockerfile: "./Dockerfile",
      target: "integration-test-host",
    },
    command: null,
    volumes: [
      `.:${identity.workdir}`,
      `${identity.integrationYarnVolume}:${identity.workdir}/.yarn`,
    ],
  }
  return [
    yaml(
      "local-integration",
      "compose.local.yaml",
      ["services", identity.integrationServiceName],
      service,
      "merge"
    ),
    yaml(
      "local-integration-volume",
      "compose.local.yaml",
      ["volumes", identity.integrationYarnVolume],
      {},
      "replace"
    ),
  ]
}

const GATEWAY_DOCKERFILE = `FROM httpd:2.4

RUN apt-get update \\
  && apt-get install -y ca-certificates curl git \\
  && rm -rf /var/lib/apt/lists/*

COPY --chown=root:www-data gateway/public/ /srv/homepage/
RUN find /srv/homepage -type d -print0 | xargs -0 chmod 750 \\
  && find /srv/homepage -type f -print0 | xargs -0 chmod 640

COPY gateway/httpd.conf /usr/local/apache2/conf/httpd.conf
RUN mkdir -p /var/log/httpd/ /etc/apache2/ssl
ENV APACHE_LOG_DIR=/var/log/httpd/

WORKDIR /srv
ENTRYPOINT ["sh", "-c", "update-ca-certificates && exec \\\"$@\\\"", "--"]
CMD ["httpd-foreground"]
`

function yaml(
  id: string,
  path: string,
  address: StructuredAddress,
  value: JsonValue,
  update: "merge" | "replace"
): Contribution {
  return {
    id: `docker:yaml:${id}`,
    source: "preset:docker",
    kind: "structured",
    path,
    format: "yaml",
    address,
    value,
    update,
  }
}

function wholeFile(path: string, contents: string): Contribution {
  return {
    id: `docker:file:${path}`,
    source: "preset:docker",
    kind: "whole-file",
    path,
    contents,
  }
}

function dockerfileContribution(path: string, contents: string): Contribution {
  return {
    id: `docker:file:${path}`,
    source: "preset:docker",
    kind: "dockerfile",
    path,
    contents,
  }
}

function script(name: string, command: string): Contribution {
  return {
    id: `docker:script:${name}`,
    source: "preset:docker",
    kind: "package-script",
    manifest: "package.json",
    name,
    command,
  }
}

function dependency(name: string, range: string): Contribution {
  return {
    id: `docker:dependency:${name}`,
    source: "preset:docker",
    kind: "dependency",
    manifest: "package.json",
    section: "devDependencies",
    package: name,
    range,
  }
}
