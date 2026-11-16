# Threadsift

Threadsift is a reading library for the links you save and never get back to. Paste a link to a Reddit post or comment, a GitHub repo or an article. Threadsift fetches it, and an agent keeps only the comments that add something, then writes a Topic, Tags, a two-line Summary and Key points. Everything you saved reads, searches and filters on one page, and you run it on your own machine.

![Threadsift with six saved Items: the filters on the left, the list in the middle, and an article open in the Reader with its Topic, Tags, Summary and Key points](docs/assets/reader.png)

v1 is not released, so do not use Threadsift for real yet.

## Let the agent keep a wiki of the library

As Items arrive, the agent writes a Topic page for each Topic, the Index of every Topic, up to 5 Related Items for each new Item, and the Log of its changes. Once a week it also looks for problems in the library, such as two Tags that mean the same thing, and lists each one as a Proposal. Nothing changes until you accept it. [docs/wiki.md](docs/wiki.md) and [docs/proposals.md](docs/proposals.md) describe both.

## Save from wherever you are

- Paste a link into the box at the top of the library. Pasting a link you already saved refreshes that Item.
- Import a pasted or uploaded list of links at `/import`.
- Save a Reddit thread or a web page from your own browser tab with the Extension. For a Reddit thread, it reads the post and its comments through your signed-in tab.
- Send links from a script with the HTTP API and an agent token you create in Settings. `/api/openapi.json` on your Instance describes the REST routes.
- Let an agent search, read and add Items over MCP at `/mcp`, with its own agent token.
- Hand X links to Grok Bot, which reads the post, its replies, the posts it quotes and its photos, and saves them back. [bot/README.md](bot/README.md) says how to install the bot.

## Bring your own AI

Threadsift has no AI of its own. In Settings you pick one Provider, and the agent uses it for every Digest (its output for one Item). On the container you can choose an API key for Anthropic, OpenAI, xAI, OpenRouter or any OpenAI-compatible address. You can also choose Claude Code or Codex signed in on your server, which runs the Digests on your Claude or ChatGPT plan, or Grok Bot. [Set up a Provider](docs/guides/providers.md) covers the last three.

## Try it on your machine

You need [Podman](https://podman.io/docs/installation), `openssl`, and bash or zsh. On macOS and Windows, start a Podman machine first.

1. Create the secret key. The command stops without changing a file that already exists.

   ```sh
   (set -Ceu; umask 077; key=$(openssl rand -hex 32); printf 'THREADSIFT_SECRET_KEY=%s\n' "$key" > "$HOME/threadsift.env")
   ```

   Back up `~/threadsift.env`. The app encrypts the keys you save in Settings with it, and [Keep the secret key](docs/guides/self-hosting.md#keep-the-secret-key) says what happens when it is lost.

2. Start the Instance:

   ```sh
   podman run --detach --name threadsift --pull=newer --publish 127.0.0.1:8080:8080 --volume threadsift-data:/data --env-file "$HOME/threadsift.env" ghcr.io/kyanitehq/threadsift:main
   ```

3. Read the setup code:

   ```sh
   podman logs threadsift
   ```

   Until you choose a password, every start logs a new `Setup code: <code>` line, and only the newest code works. If the line is not there yet, run the command again after a few seconds.

4. Open http://127.0.0.1:8080, enter the code and choose a password.
5. Open Settings and choose a Provider. Have an API key from one of the vendors above ready, or install Claude Code or Codex on the container as [Set up a Provider](docs/guides/providers.md) shows. Press **Save**, then press **Verify**. Verify writes one small real Digest and adds no Item.
6. Paste your first link.

The app answers on this machine only, over plain HTTP. To reach it from other devices, read [Run Threadsift on your own server](docs/guides/self-hosting.md).

## Status

v1 is not ready for a library you want to keep. The status table at the top of [docs/architecture.md](docs/architecture.md) lists the parts that are not fully built. The container image is the install target you can run today. A Cloudflare Worker runs the same app, and its deploy button is not built yet.

## Find your way around

- [docs/spec.md](docs/spec.md): what v1 does, and the decisions behind it.
- [docs/architecture.md](docs/architecture.md): what it is built with and where each part runs.
- [GLOSSARY.md](GLOSSARY.md): the words the project uses, such as Item, Digest and Provider.
- [docs/guides/](docs/guides/): the guides for running and setting up an Instance.
- [design/](design/) and [docs/design/](docs/design/): the prototype, the design system, the design prompts and the Style list.

## License

Copyright (C) 2026 Kyanite Labs.

Threadsift is licensed under the GNU Affero General Public License, version 3 only (AGPL-3.0-only). See [LICENSE](LICENSE). Outside contributions need a signed contributor licence agreement, which the repo adds before the first one.
