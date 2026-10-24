# Understory

Confgen applies shared conventions; applications keep their own behavior.
The aim is to make ordinary configuration sufficient, with fewer paths and
startup decisions for each project to maintain.

## SSL

Require verified HTTPS between Package Service containers, including the hop
from httpd to the Node API. The gateway is both a server presenting its
identity and a client verifying its upstream. Optional Caddy provides host
access; container clients reach the gateway directly. Node creates its HTTPS
listener around the Express application, leaving `initServer` concerned with
the application itself.

Public trust and private identity have different requirements. Clients need
the shared local certificate to verify servers; only HTTPS listeners need its
private key. Mount the public certificate in
`/usr/local/share/ca-certificates/` and run `update-ca-certificates` at startup.
Node uses the resulting system bundle through `NODE_EXTRA_CA_CERTS`.
Integration hosts need trust alone.

`SSL_PATH` is an explicit, absolute directory containing
`local.multiplayerdb.dev.crt` and `local.multiplayerdb.dev.key`. Compose sets it
to `/ssl` inside Node containers; the image exposes the public certificate
there through a fixed symlink. A host process can supply a different directory.
There are no application path fallbacks.

Keys arrive at runtime, so permissions are established at startup. The host key
stays `0600` and is mounted read-only. Node startup copies it into the
root-owned runtime directory as `root:www-data`, mode `0440`, then drops to
`www-data`. Node can read the copy without modifying it or the host key.
Httpd's privileged startup can read its mounted key directly. Neither
certificate nor key belongs in a built image.

## Docker

Keep startup specific to each image's role. Node servers prepare identity and
trust; integration hosts prepare trust; httpd prepares trust before its normal
startup. These short sequences belong inline in Dockerfiles and forward the
supplied command. Separate targets avoid branches that infer a container's
role from whichever files happen to be mounted.

Compose owns orchestration, and package scripts invoke it directly.
`dev-cluster` owns the isolated job of generating certificates. It needs no
knowledge of Docker topology or application startup.

## CI

The base Compose file is a reusable runtime contract for published images,
including downstream consumers of Package Service. Local development adds
builds and source mounts. CI supplies fresh certificates, image tags, and
service URLs, builds the images, then runs the same integration service from
the base definition.

The test image has one default command: install dependencies immutably, then
run integration tests. Repeating the install keeps mounted local state usable
and is inexpensive when dependencies are already present. Compose streams
logs and returns the test host's exit status. A disposable GitHub-hosted runner
needs no separate shell script to collect failure logs or tear down containers.
