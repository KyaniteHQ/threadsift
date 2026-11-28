# Container image

The container image runs the app on the Node target. You run it with Podman or Docker. CI publishes it ([CI, releases and rollback](ci-releases-and-rollback.md), Image and Releases).

## Base image

The `Containerfile` builds on the official `node:26-slim` image, pinned by digest. The image is Debian-based and not built by Nix, because the owner's AI CLIs come with their vendors' installers, which expect an ordinary Linux root. The image adds two packages:

- `ca-certificates`, which `node:slim` lacks. Codex reached no TLS host without it.
- `curl`, which the grok installer needs.

Operators install the CLIs into the data volume, so no derived image is needed.

## Version label

The image's `org.opencontainers.image.version` label carries the release version, so `podman image inspect` shows which release an image holds. The release command writes it with every other version, and the gate fails when it differs from the app's ([CI, releases and rollback](ci-releases-and-rollback.md#versions-and-the-release-pull-request)).

## pnpm

The `packageManager` field carries the version and the SHA-512 hash of the pnpm tarball, in the form Corepack defines: `pnpm@<version>+sha512.<hex>`. The hash is the hex form of the `dist.integrity` that the npm registry lists for that version, so `sha512sum` of the downloaded `pnpm-<version>.tgz` equals it. Corepack in the devenv shell checks the same hash when it downloads pnpm, and does not check a copy that is already in its cache.

`node:26-slim` ships no Corepack, because Node 25 and later do not bundle it ([Corepack](https://github.com/nodejs/corepack#readme)). The `base` stage therefore checks the tarball with what the image has, and installs no package and no helper to do it. A field in any other form, or a tarball that does not match the hash, stops the build.

The hash covers the pnpm wrapper tarball only. The pnpm 12 tarball holds a launcher, and the native binary comes from the `@pnpm/exe.<platform>` package that npm installs next to it. npm checks that package against the integrity in the registry's metadata, and the hash in `packageManager` does not pin it.

Renovate keeps the hash current ([Dependency updates](dependency-updates.md)).

## The data volume

One volume at `/data` holds the database, the files, and the install folder and login of each CLI. The `node` user owns it, so the owner installs a CLI without root. The image sets `DATA_DIR=/data`. The default data folder of the container target, `/app/.data`, is a link to `/data`, so an empty `DATA_DIR=` or a start without the variable also lands in the volume.

Anthropic's native installer would need its own folders in the volume, so the image uses the npm package, which installs the same native binary ([setup](https://code.claude.com/docs/en/setup)).

## AI CLIs

The image ships no AI CLI, for two reasons. Claude Code has no open licence (npm lists "SEE LICENSE IN README.md"), and the CLIs update faster than the image. The [Providers guide](../guides/providers.md) installs each CLI into the data volume through `podman exec`, followed by a restart.

## Public HTTPS and the origin

The app listens on plain HTTP inside the container. Public HTTPS comes from the owner's reverse proxy or tunnel. The operator names that external origin in `THREADSIFT_PUBLIC_ORIGIN`, the same name a Worker reads as a variable ([Reach it from other devices](../guides/self-hosting.md#reach-it-from-other-devices) sets it).

## Keep-alive timeout

`serveContainer`, the container's HTTP server, sets `keepAliveTimeout`, so the server advertises `Keep-Alive: timeout=65`. Node adds a 1-second buffer and closes an idle socket after 66 seconds. Node 26 defaults to 5 seconds plus that buffer.

The 5-second default reset a save batch: in two CI traces the reset came 5.984 to 5.991 seconds after the document requests, and a local save that reached Node directly failed the same way. Playwright's request agent does not retire a socket from the advertised timeout, so the smoke run stays clear of this race while its sockets idle for less than 66 seconds.

A reverse proxy's upstream idle timeout must stay below the advertised 65 seconds, so the proxy closes its connection first. Sources: [Node's keep-alive default change](https://github.com/nodejs/node/commit/9f7526984084b7f6d694653eee047cd5b8836ae9) and [Playwright's request agent](https://github.com/microsoft/playwright/issues/42698).

## Fetcher plug-ins

Fetcher plug-ins need no change to the image. The operator mounts the module and everything it imports read-only and sets `THREADSIFT_FETCHERS` ([Fetchers](fetchers.md), Plug-ins), for example:

```text
-v <host folder>:/fetchers:ro   THREADSIFT_FETCHERS=/fetchers/<name>.mjs
```

- The `node` user (uid 1000) must be able to read the files and traverse the folders.
- Node resolves bare imports from the importing module's own folder, not from `/app/node_modules`. The module is therefore one bundled file, or it carries its own `node_modules` beside it. Threadsift installs no package at runtime.
- The variable is a container variable only. The Worker does not read it.

## Unread request bodies

When the app answers a request without reading its body, for example a 401 or a 413, the Node entry reads and discards the body first. The keep-alive connection then stays usable, and the client is not reset mid-upload. Two bounds apply:

- The discard stops at 64 MiB, the same limit as `MAX_DRAIN_BYTES` in the `@hono/node-server` version that the repository pins. Past it, the response carries `Connection: close`.
- A client that sends the body too slowly gets Node's own `408` when `server.requestTimeout` runs out. It is 300000 ms by default on Node 26 (`node -p "http.createServer().requestTimeout"`).

`@hono/node-server`'s own cleanup of an unread body stops after 500 ms and closes the socket, which resets a client whose next request is already on it. A core test sends exactly 64 MiB to `answerAfterBody` on loopback and the connection stays usable for the next request. It sends 64 MiB plus one byte, and the 413 then carries `Connection: close` after the client has sent every byte. Larger bodies, and a client that is still sending when the connection closes, are unverified ([Open items and unverified claims](open-items-and-unverified-claims.md)).
