# Confgen

Confgen creates and maintains TypeScript projects built with the Understory
framework.

Understory is an opinionated application stack: it defines where different
kinds of code live, which tools the stack uses, and how those tools work
together. Confgen is the tool that applies those conventions to a repository.
It can generate a new working project, add a capability to an existing project,
or update an established project to current Understory patterns. See
[UNDERSTORY.md](UNDERSTORY.md) for the reasoning behind the SSL, Docker, and CI
conventions.

Confgen is not part of an application's runtime. It writes ordinary source,
package manifests, Vite configs, TypeScript configs, Compose files, workflows,
and other standard project files. The resulting project builds and runs without
Confgen, and using Confgen only once as a starter-project generator is a
supported workflow.

## Quick start

Use Node 24 and Yarn 4 through Corepack. Install Confgen in the project and
pin its version:

```sh
yarn add --dev --exact confgen
```

Declare the project's runtimes and presets in `package.json`:

```json
{
  "scripts": {
    "confgen": "confgen runtimes=#lib,#server,#client yarn typescript vite vitest"
  }
}
```

Then run:

```sh
yarn confgen
```

Commit the generated files and `confgen.lock`. Run the same command later to
add or remove capabilities, apply updated Understory patterns, or restore
missing generated configuration.

Confgen is pre-1.0 and its releases may make deliberate breaking changes. Pin
the version, upgrade it intentionally, run Confgen from a clean worktree, and
review the resulting diff.

## Command syntax

```text
confgen runtimes=#runtime[,#runtime...] preset [preset...]
```

The `runtimes=` group is required. Each runtime begins with `#` and the complete
group is one shell word, so the `#` characters do not begin shell comments.
Presets are positional names following the runtime group.

For example:

```sh
confgen runtimes=#lib,#server,#client yarn typescript vite vitest
```

This describes a repository with library, server, and separately published
client boundaries, using the Yarn, TypeScript, Vite, and Vitest capabilities.
Confgen sees the complete selection before generating anything, so each preset
can account for the other selected runtimes and presets.

Unknown and duplicate runtimes or presets are errors. Confgen also reports
missing capabilities together rather than failing on the first incompatible
selection.

## Runtimes

A runtime is an execution or packaging boundary within the repository. Runtime
names also establish standard source locations:

| Runtime        | Location       | Purpose                                         |
| -------------- | -------------- | ----------------------------------------------- |
| `#lib`         | `lib/`         | Publishable or internally consumed library code |
| `#app`         | `app/`         | Browser application code                        |
| `#server`      | `server/`      | Node service code                               |
| `#client`      | `client/`      | Separately published client workspace           |
| `#integration` | `integration/` | Container-backed integration tests              |
| `#gateway`     | `gateway/`     | Independently built edge process                |
| `#docs`        | `docs/`        | Documentation application                       |

These locations are Understory conventions and cannot be redirected through
Confgen options.

A repository may contain several runtimes and technologies while still having
one product purpose. A service can contain its server, published library,
client package, integration environment, and gateway. Confgen is not an
arbitrary multi-application monorepo generator.

## Presets

Presets select tools or coherent optional capabilities. Examples include Yarn,
TypeScript, Vite, Vitest, ESLint, Prettier, React, GraphQL, Docker, HTTPD, SQL,
codedocs, Git, GitHub Actions, GitHub Packages, and VS Code. Run `confgen --help` for the
presets supported by the installed release.

A preset owns the Understory decisions for its area and accounts for the full
runtime and preset selection. For example:

- TypeScript configures every selected runtime and the tools that consume its
  output.
- Vite creates the build and development configurations required by the
  selected runtimes and capabilities.
- Vitest configures the runtime boundaries under test.
- VS Code configures the editor to use workspace TypeScript. Select `vscode`
  together with `yarn` to add `@yarnpkg/sdks@2` as a dev dependency and generate
  the editor SDKs after every install. Run `yarn install:sdks` to regenerate them
  manually.
- Docker configures images and Compose contracts for runnable and integration
  runtimes.
- GitHub Actions assembles checks, packages, containers, and release workflows
  from the capabilities already selected.

Vite configuration illustrates the model. A project may need
`vite.lib.config.ts`, `vite.server.config.ts`, `vite.test.config.ts`, or other
configs for distinct build and test concerns. These files often correspond to
runtimes, but there is no one-config-per-project or one-config-per-runtime rule.
Each is a normal Vite configuration file, not a Confgen-specific wrapper.

Confgen deliberately has few tuning options. Project facts such as package
names, workspace relationships, repositories, and publication registries come
from the standard manifests that already own those facts. Confgen does not add
a second options object for configuring the generated configuration.

## New projects and existing projects

There is one Confgen operation. It collects all contributions from the selected
runtimes and presets, resolves their interactions, and reconciles the complete
result with the repository.

That operation works for both a newly initialized project with its minimal
package manifest and a project that developers have edited since the previous
run. There is no separate bootstrap mode whose behavior can drift away from the
update path.

On a new project, Confgen may create:

- package manifests, dependencies, and project scripts;
- TypeScript, Vite, test, lint, and format configuration;
- minimal working source for selected runtimes;
- package build and publication configuration;
- container, local-development, and integration-test assets; and
- CI and release workflows.

Starter source belongs to the application after creation. Confgen does not
repeatedly replace starter modules, schemas, resolvers, operations, or tests.

## How Confgen treats your edits

Confgen aims to preserve useful project-specific changes, but it does not
promise never to overwrite a file or value that it previously generated. The
priority is:

1. Merge the application's changes with the current Understory pattern when
   the preset can do so cleanly.
2. Replace the affected value, construct, or file with the complete current
   standard when a useful merge is not practical.
3. Stop with an error only when the preset has a concrete reason to believe
   replacement would be destructive.

Confgen resolves the selected contributions before writing files. If semantic
reconciliation reports an error, it stops before writing any of them. A later
filesystem or Yarn failure can leave an ordinary working-tree diff; Confgen
leaves the previous lock intact so the environmental problem can be corrected
and the command rerun.

When adopting an existing project, review inherited Compose mounts, command
overrides, and helper scripts. Existing application configuration can survive
merging, and Confgen does not automatically delete old scripts it has never
managed. A successful run still needs a review of the resulting configuration.

Different files warrant different techniques. Confgen can merge keys in
structured JSON or YAML, make focused syntax-aware edits to executable
TypeScript configuration, or regenerate a conventional file completely. These
are implementation strategies, not hard Confgen-owned and user-owned regions.
Confgen does not create shadow configs or wrapper files merely to manufacture
an ownership boundary.

Because replacement is an accepted outcome, use version control as the safety
net: begin with a clean worktree, inspect the diff, and keep or revise the
result as normal project code.

## `confgen.lock`

`confgen.lock` is committed bookkeeping for later Confgen runs. It records the
normalized runtime and preset selection, the Confgen version, affected paths,
and enough information about previous contributions to improve updates and
removals.

The lock is evidence for reconciliation, not a universal rule that edited
content must be preserved or rejected. It is also not a second source of
project options.

Applications never read `confgen.lock` when they build or run. If a project
uses Confgen only as a starter generator, it can remove the lock and the
Confgen dependency without changing the generated application's behavior.

## Ongoing use

Projects that continue using Confgen should keep a stable package script with
their complete runtime and preset selection. Rerun it when upgrading Confgen or
changing that selection. A normal validation command can also run Confgen and
fail when it leaves a repository diff, ensuring that committed configuration
matches the pinned release.

Typical generated commands depend on the selected capabilities and may include
build, type-check, lint, format, test, development-server, container, package
inspection, and publication tasks. Short project scripts expose those tasks;
the underlying tools remain usable directly.

Publishable packages receive `yarn bump` (`bump-n-pub --bump-only`), package
inspection, and local Yalc publication scripts. Projects using GitHub Packages
supply Yarn credentials through `NODE_AUTH_TOKEN`; signing into GitHub alone
does not authenticate package installation.

When an Understory convention is too specific for a project, maintain the
relevant standard file directly or omit an optional preset. When a broadly
useful interaction is missing, add it to the responsible Confgen preset so all
projects using that combination receive the same behavior.

## Containers, HTTPS, and integration tests

Docker projects generate Compose commands in `package.json`. Supply `SSL_PATH`
as an absolute host directory, `IMAGE_TAG` for the images, and the service's
`*_URL` variables as HTTPS origins. For example, in a Package Service checkout:

```sh
export SSL_PATH="$PWD/ssl"
export IMAGE_TAG=local
export PACKAGE_SERVICE_URL=https://package-service.local.multiplayerdb.dev
yarn generate:local:ssl
yarn start:containers:local
```

`generate:local:ssl` runs `dev-cluster certs` on the host. It creates
`local.multiplayerdb.dev.crt` and `local.multiplayerdb.dev.key` in `SSL_PATH`.
Certificate generation does not install host trust or start containers. Host
browser and Git access also need hostname resolution and host trust. The
generated `Caddyfile.local` configures an optional standalone Caddy container
for routing host requests to the service.

Certificates and keys enter containers through runtime mounts. The public
certificate goes in `/usr/local/share/ca-certificates/`, and startup runs
`update-ca-certificates`. Integration hosts receive only that certificate.
HTTPS listeners also receive the private key; the Node image prepares a copy
readable by `www-data` before dropping privileges. Compose explicitly sets
Node's `SSL_PATH` to `/ssl`. Host-run Node servers can use another absolute
`SSL_PATH` with the same filenames; application TLS paths have no fallbacks.

`compose.base.yaml` defines published images, TLS mounts, network aliases,
healthchecks, dependencies, and the integration host. It is also the contract
shipped to downstream consumers. `compose.local.yaml` adds local builds,
source mounts, and dependency volumes. Caddy is optional for host access;
container clients reach service aliases directly over HTTPS.

With the integration runtime selected, `yarn test:integration:local` uses both
Compose layers. CI builds and tags the images first, then
`yarn test:integration:ci` runs the base layer, streams the test and dependency
logs, and returns the integration host's exit status. Both use the image's
default command, `yarn install --immutable && yarn test:integration:run`.

## Development

Confgen targets Node 24, Yarn 4 Plug'n'Play, TypeScript, and ES modules. Enable
Corepack and install the pinned dependencies before working on it:

```sh
corepack enable
yarn install
```

The important checks are:

```sh
yarn check:types
yarn test
yarn build
```

Focused tests cover preset and reconciliation edge cases. A small set of
synthetic-project integration tests invokes the packed CLI and real selected
tools to prove representative install, build, check, test, and start workflows.
Run those checks with `yarn test:integration`. The integration suite tests
Confgen's boundaries rather than duplicating the test suites of those tools
or of applications generated with them.

The Docker preset uses `DEV_CLUSTER_VERSION` when set, or its default version
otherwise. To prepare the integration fixtures with a locally published
`dev-cluster`, run `yalc add dev-cluster --dev` inside both
`integration-tests/fixtures/package-service` and
`integration-tests/fixtures/schema-service`. The integration test configuration
sets `DEV_CLUSTER_VERSION=file:.yalc/dev-cluster`.
