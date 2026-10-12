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
  return [
    dependency("dev-cluster", DEV_CLUSTER_VERSION),
    script("dev-cluster", "dev-cluster"),
    script("start:containers:local", `dev-cluster up ${identity.serviceName}`),
    script("stop:containers:local", "dev-cluster down"),
    script("start:server", "node --watch server/index.ts"),
    wholeFile("Dockerfile", dockerfile(selection, identity)),
    wholeFile("scripts/docker-entrypoint-node.sh", ENTRYPOINT),
    wholeFile(".dockerignore", DOCKERIGNORE),
    ...baseCompose(identity),
    ...localCompose(identity),
  ]
}

export type ContainerIdentity = {
  directoryName: string
  serviceName: string
  alias: string
  workdir: string
  yarnVolume: string
  image: string
}

/** Globally distinctive service names derived from the root package name. */
export function containerIdentity(packageName: string): ContainerIdentity {
  const slash = packageName.lastIndexOf("/")
  const directoryName = slash < 0 ? packageName : packageName.slice(slash + 1)
  const stem = directoryName.endsWith("-service")
    ? directoryName.slice(0, -"-service".length)
    : directoryName
  const serviceName = `${stem}-api-server`
  return {
    directoryName,
    serviceName,
    alias: `${serviceName}.local.multiplayerdb.dev`,
    workdir: `/mnt/${directoryName}`,
    yarnVolume: `${serviceName}-yarn`,
    image: `${serviceName}:${requiredReference("IMAGE_TAG")}`,
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

#################
FROM base AS prod
COPY package.json yarn.lock .yarnrc.yml ./
COPY .yal[c] ./.yalc
${clientCopy}RUN yarn workspaces focus --production
COPY --from=builder ${identity.workdir}/dist/server ./dist/server
CMD ["yarn", "node", "dist/server/index.js"]
`
}

function baseCompose(identity: ContainerIdentity): Contribution[] {
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
      retries: 100,
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
  ]
}

function localCompose(identity: ContainerIdentity): Contribution[] {
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
  ]
}

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
