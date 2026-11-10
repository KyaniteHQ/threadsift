# Threadsift

Threadsift is a reading library. You paste a link to something you saved (a Reddit post or comment, an X post, a GitHub repo, an article), the app fetches it, an agent keeps only the useful comments and writes a topic, tags, a two-line summary and key points, and everything reads, searches and filters on one page.

## Status

The build is under way, and v1 is not released, so do not deploy it for real use; issue #1 tracks each slice. Both install targets (the container image and a Cloudflare Worker) run the same app. Built so far: owner setup, login, password change and agent tokens; Paste and the ingest pipeline, with article text, GitHub repositories and Reddit threads sent with a Paste; AI settings with OpenRouter, Anthropic, OpenAI and xAI keys, an OpenAI-compatible URL, Workers AI on Cloudflare, and Claude Code and Codex on the container, a Digest per Item with its Topic, Tags, Summary, Key points and Kept comments; search and filters; the Reader, the List and Grid Layouts, Delete, the 10 Styles and the installable app with its Share target; the Reader's comment tree; Highlights in the Reader (keep, mark, list and remove), the Note and the Highlights page; OpenRouter Connect; the Extension for Chrome and Firefox, which saves the page in the owner's tab and saves a whole Reddit thread, with the replies behind its "more" stubs, from the owner's signed-in tab, and fills a Link-only Reddit Item when the owner opens its thread with "Fill saved Reddit Items" on. Not built yet: Topic pages and the rest of the library wiki, Grok Bot, the MCP endpoint, the Extension's Connect Reddit button, Import, Export and the release.

- `docs/spec.md`: what v1 does.
- `docs/architecture.md`: what it is built with and where each part runs.
- `docs/guides/github-token.md`: how to add an optional GitHub token for a higher request limit.
- `GLOSSARY.md`: the words the project uses.
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

## Use Codex on the container

1. Install Codex into the volume:

   ```sh
   podman exec -it <container> npm install --global @openai/codex
   ```

2. Restart the Instance so it finds the tool:

   ```sh
   podman restart <container>
   ```

3. Sign in on the server:

   ```sh
   podman exec -it <container> codex login --device-auth
   ```

   Codex prints a link and a code; open the link on any device, enter the code and approve. There is no token variable for Codex. The login is saved in `/data/codex/auth.json` in the volume.

4. Open Settings, choose "Codex on this server" as the Provider, press Save, then press Verify. The model field may stay blank for Codex's default model; a model you type must be listed by `codex debug models --bundled`.

The install and login stay in the volume when you remove and recreate the container on the same volume. Installing, updating or removing Codex needs a restart, because the app reads Codex's model list once at start. At most 2 AI tasks run at once across Claude Code and Codex together. The app never reads or stores the login.

Before every task the app checks what Codex would load. If the machine has a Codex config file with extra tools or instructions (`/etc/codex`), or an administrator requirement, the task is refused and the Provider shows "This Provider is not available on this Instance". The app logs `codex-surface-refused` with the names of the extra tools; remove the extra configuration, or choose another Provider. The app keeps `AGENTS.md`, `AGENTS.override.md` and `skills` in `/data/codex` empty on purpose, so Codex loads no instructions from them, and it deletes nothing. If it finds a real `AGENTS.md`, `AGENTS.override.md` or a `skills` folder with anything in it, it does not offer Codex and logs `codex-home-refused` with the path. Run no `codex` command in that home before step 2: a Codex command that runs there before the app has made its empty `skills` file creates a `skills/.system` folder, and the app then refuses the home. If that happened, remove `/data/codex/skills` yourself and restart.

Under [OpenAI's CI guide](https://learn.chatgpt.com/docs/auth/ci-cd-auth), OpenAI allows ChatGPT-account sign-in only on trusted private infrastructure, such as your own home server. Use one `auth.json` per machine, never share it between machines, and never put it in logs, a repository or public artifacts. OpenAI recommends API keys for automation, so choose an API Provider for an Import. If Verify says the sign-in was rejected, run the login command again.

## License

Copyright (C) 2026 Kyanite Labs.

Threadsift is licensed under the GNU Affero General Public License, version 3 only (AGPL-3.0-only). See [LICENSE](LICENSE). Outside contributions need a signed contributor licence agreement, which the repo adds before the first one.
