import type {
  Contribution,
  JsonValue,
  ProduceContributions,
  StructuredAddress,
} from "../contributions.js"
import { ConfgenError } from "../errors.js"
import type { Selection } from "../selection.js"

/** Node API containers listen on this port inside their own network namespace. */
export const SERVICE_PORT = 7001

const YARN_VERSION = "4.11.0"
const DEV_CLUSTER_VERSION = "0.1.0"

/**
 * Docker owns the ordinary Node service image, Compose layers, and the
 * short commands that delegate local orchestration to dev-cluster.
 */
export const contributions: ProduceContributions = (selection, facts) => {
  if (!selection.runtimes.includes("server")) return []
  const identity = containerIdentity(facts.root.name)
  assertHttpsOrigin("SERVICE_URL", `https://${identity.alias}`)
  const corner = gatewaySelected(selection)
    ? identity.gatewayServiceName
    : identity.serviceName
  const produced: Contribution[] = [
    dependency("dev-cluster", DEV_CLUSTER_VERSION),
    script("dev-cluster", "dev-cluster"),
    script("start:containers:local", `dev-cluster up ${corner}`),
    script("stop:containers:local", "dev-cluster down"),
    script("start:server", "node --watch server/index.ts"),
    wholeFile("Dockerfile", dockerfile(selection, identity)),
    wholeFile("scripts/docker-entrypoint-node.sh", ENTRYPOINT),
    wholeFile(".dockerignore", DOCKERIGNORE),
    ...baseCompose(selection, identity),
    ...localCompose(selection, identity),
  ]
  if (selection.runtimes.includes("integration")) {
    assertHttpsOrigin(identity.serviceUrlName, identity.serviceUrl)
    produced.push(
      wholeFile("scripts/test-integration-ci.sh", ciScript(identity)),
      wholeFile("scripts/integration-local.sh", INTEGRATION_LOCAL_SCRIPT)
    )
  }
  if (gatewaySelected(selection)) {
    produced.push(
      wholeFile("gateway/Dockerfile", GATEWAY_DOCKERFILE),
      wholeFile("scripts/docker-entrypoint-httpd.sh", HTTPD_ENTRYPOINT)
    )
  }
  return produced
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
  alias: string
  workdir: string
  yarnVolume: string
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

/** Globally distinctive service names derived from the root package name. */
export function containerIdentity(packageName: string): ContainerIdentity {
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
  return {
    directoryName,
    serviceName,
    alias: `${serviceName}.local.multiplayerdb.dev`,
    workdir: `/mnt/${directoryName}`,
    yarnVolume: `${serviceName}-yarn`,
    image: `${serviceName}:${requiredReference("IMAGE_TAG")}`,
    gatewayServiceName,
    gatewayAlias: `${gatewayServiceName}.local.multiplayerdb.dev`,
    gatewayImage: `${gatewayServiceName}:${requiredReference("IMAGE_TAG")}`,
    integrationServiceName,
    integrationImage: `${integrationServiceName}:${requiredReference(
      "IMAGE_TAG"
    )}`,
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

const ENTRYPOINT = `#!/bin/sh
set -e

if [ -d /ssl ]; then
  found=
  for cert in /ssl/*.crt; do
    if [ -f "$cert" ]; then
      cp "$cert" /usr/local/share/ca-certificates/
      found=1
    fi
  done
  if [ -n "$found" ]; then
    update-ca-certificates
  fi
fi

exec gosu www-data "$@"
`

const DOCKERIGNORE = `node_modules
.yarn
.pnp.*
dist
client/dist
.git
ssl
`

function dockerfile(selection: Selection, identity: ContainerIdentity): string {
  const clientCopy = selection.runtimes.includes("client")
    ? `RUN mkdir -p client
COPY client/package.json ./client/package.json
`
    : ""
  return `##################################
FROM node:24-bookworm-slim AS base

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

COPY scripts/docker-entrypoint-node.sh /usr/local/bin/docker-entrypoint-node.sh
RUN chmod +x /usr/local/bin/docker-entrypoint-node.sh

WORKDIR ${identity.workdir}
ENTRYPOINT ["/usr/local/bin/docker-entrypoint-node.sh"]
EXPOSE ${SERVICE_PORT}

################
FROM base AS dev
CMD ["sh", "-c", "yarn install --immutable && yarn start:server"]

#########################
FROM base AS dependencies
COPY package.json yarn.lock .yarnrc.yml ./
COPY .yal[c] ./.yalc
${clientCopy}RUN gosu www-data yarn install --immutable

###########################
FROM dependencies AS source
COPY . .

######################
FROM source AS builder
RUN yarn build
${integrationStage(selection)}
#################
FROM base AS prod
COPY package.json yarn.lock .yarnrc.yml ./
COPY .yal[c] ./.yalc
${clientCopy}RUN yarn workspaces focus --production
COPY --from=builder ${identity.workdir}/dist/server ./dist/server
CMD ["yarn", "node", "dist/server/index.js"]
`
}

function integrationStage(selection: Selection): string {
  if (!selection.runtimes.includes("integration")) return ""
  return `
####################################
FROM source AS integration-test-host
CMD ["yarn", "test:integration:run"]
`
}

function baseCompose(
  selection: Selection,
  identity: ContainerIdentity
): Contribution[] {
  const service: JsonValue = {
    image: identity.image,
    environment: {
      PORT: String(SERVICE_PORT),
    },
    volumes: [`${requiredReference("SSL_PATH")}:/ssl:ro`],
    networks: {
      default: {
        aliases: [identity.alias],
      },
    },
    healthcheck: {
      test: `curl --fail http://localhost:${SERVICE_PORT}/healthcheck`,
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
      `${requiredReference("SSL_PATH")}:/etc/apache2/ssl:ro`,
      `${requiredReference("SSL_PATH")}:/ssl:ro`,
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

function integrationLocal(
  selection: Selection,
  identity: ContainerIdentity
): Contribution[] {
  if (!selection.runtimes.includes("integration")) return []
  const upstream = gatewaySelected(selection)
    ? identity.gatewayServiceName
    : identity.serviceName
  const service: JsonValue = {
    build: {
      context: ".",
      dockerfile: "./Dockerfile",
      target: "integration-test-host",
    },
    environment: {
      [identity.serviceUrlName]: requiredReference(identity.serviceUrlName),
    },
    depends_on: {
      [upstream]: {
        condition: "service_healthy",
      },
    },
    volumes: [
      `${requiredReference("SSL_PATH")}:/ssl:ro`,
      `.:${identity.workdir}`,
      `${identity.integrationYarnVolume}:${identity.workdir}/.yarn`,
    ],
    entrypoint: ["sh"],
    user: "root",
    command: ["scripts/integration-local.sh"],
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

function ciScript(identity: ContainerIdentity): string {
  return `#!/bin/sh
set -eu

compose() {
  docker compose -f compose.base.yaml "$@"
}

cleanup() {
  status=$?
  if [ "$status" -ne 0 ]; then
    compose logs || true
  fi
  compose down -v --remove-orphans || true
  exit "$status"
}
trap cleanup EXIT

compose up -d --wait --wait-timeout 120

ssl_abs=$(CDPATH= cd -- "\${SSL_PATH:?}" && pwd)
server_id=$(compose ps -q ${identity.serviceName})
network=$(docker inspect --format '{{range $name, $net := .NetworkSettings.Networks}}{{$name}}{{end}}' "$server_id")

docker run --rm \\
  --network "$network" \\
  -e ${identity.serviceUrlName}="\${${identity.serviceUrlName}:?}" \\
  -v "\${ssl_abs}:/ssl:ro" \\
  "${identity.integrationImage}" \\
  yarn test:integration:run
`
}

const INTEGRATION_LOCAL_SCRIPT = `#!/bin/sh
set -eu

if [ -d /ssl ]; then
  cp /ssl/*.crt /usr/local/share/ca-certificates/ || true
  update-ca-certificates
fi

yarn install --immutable
yarn test:integration:run
`

const HTTPD_ENTRYPOINT = `#!/bin/sh
set -e

if [ -d /ssl ]; then
  found=
  for cert in /ssl/*.crt; do
    if [ -f "$cert" ]; then
      cp "$cert" /usr/local/share/ca-certificates/
      found=1
    fi
  done
  if [ -n "$found" ]; then
    update-ca-certificates
  fi
fi

exec "$@"
`

const GATEWAY_DOCKERFILE = `FROM httpd:2.4

RUN apt-get update \\
  && apt-get install -y ca-certificates curl \\
  && rm -rf /var/lib/apt/lists/*

COPY --chown=root:www-data gateway/public/ /srv/homepage/
RUN find /srv/homepage -type d -print0 | xargs -0 chmod 750 \\
  && find /srv/homepage -type f -print0 | xargs -0 chmod 640

COPY gateway/httpd.conf /usr/local/apache2/conf/httpd.conf
RUN mkdir -p /var/log/httpd/ /etc/apache2/ssl
ENV APACHE_LOG_DIR=/var/log/httpd/

COPY scripts/docker-entrypoint-httpd.sh /usr/local/bin/docker-entrypoint-httpd.sh
RUN chmod +x /usr/local/bin/docker-entrypoint-httpd.sh

WORKDIR /srv
ENTRYPOINT ["/usr/local/bin/docker-entrypoint-httpd.sh"]
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
