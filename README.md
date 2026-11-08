# Threadsift

Threadsift is a reading library. You paste a link to something you saved (a Reddit post or comment, an X post, a GitHub repo, an article), the app fetches it, an agent keeps only the useful comments and writes a topic, tags, a two-line summary and key points, and everything reads, searches and filters on one page.

## Status

The build has started: the paste box saves and lists pasted links on both install targets (container image and local Cloudflare Worker). A pasted link gets its title (Reddit through oEmbed, other pages from their `<title>`), but there is no agent, reader, login or release, so do not deploy it; issue #1 tracks progress.

- `docs/spec.md`: what v1 does.
- `docs/architecture.md`: what it is built with and where each part runs.
- `CONTEXT.md`: the words the project uses.
- `design/prototype/`: the clickable prototype from Claude Design.
- `design/system/`: the design system's tokens, component styles and settings table.
- `docs/design/`: the Claude Design prompts, the final design reviews and the Style list.
- `docs/research/prior-art.md`: the existing tools that were compared before deciding to build.

## Open the prototype

The prototype loads its data with `fetch`, so it needs a local web server:

```sh
cd design/prototype
python3 -m http.server 8000
```

Then open http://127.0.0.1:8000/Main.dc.html. Press T for the Tweaks panel, which has Compare for two settings side by side.

The prototype's sample data is not in the repo, because it is the owner's real saves: other people's posts, comments and images. Without it the app shows "Couldn’t load the library data." To fill it, put a `data.json` in the shape `library.js` reads, and its images in `img/`, inside `design/prototype/`; both paths are gitignored.

## Use Claude Code on the container

The container image ships no AI command-line tool and keeps everything you install or sign in to in its `/data` volume.

1. Install Claude Code into the volume:

   ```sh
   podman exec -it <container> npm install --global @anthropic-ai/claude-code
   ```

2. Restart the Instance so it finds the tool:

   ```sh
   podman restart <container>
   ```

3. Sign in, in one of two ways. Log in and follow the prompts:

   ```sh
   podman exec -it <container> claude auth login
   ```

   Or get a token on any machine where Claude Code is signed in:

   ```sh
   claude setup-token
   ```

   Start the container with the token it prints in the `CLAUDE_CODE_OAUTH_TOKEN` environment variable (for example `--env CLAUDE_CODE_OAUTH_TOKEN`). Set it at container start; an export in a later `podman exec` shell does not reach the running app.

4. Open Settings, choose "Claude Code on this server" as the Provider, press Save, then press Verify.

The install and login stay in the volume when you remove and recreate the container on the same volume. Installing or removing Claude Code needs a restart. npm 12 skips the install script unless allowed, so run `npm config set "allow-scripts=@anthropic-ai/claude-code" --location=user` first (the image's npm is 11.20.0 and needs no change). A token Claude Code rejects shows up when Verify runs.

## License

Copyright (C) 2026 Kyanite Labs.

Threadsift is licensed under the GNU Affero General Public License, version 3 only (AGPL-3.0-only). See [LICENSE](LICENSE). Outside contributions need a signed contributor licence agreement, which the repo adds before the first one.
