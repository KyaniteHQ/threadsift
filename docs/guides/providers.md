# Set up a Provider

An API Provider needs only the fields Settings shows. Fill them in, press **Save**, then press **Verify**. This guide covers the Providers that need more setup: Claude Code and Codex, which run as command-line tools inside the container, and Grok Bot.

The container image ships no AI command-line tool. Everything you install or sign in to stays in its `/data` volume. In the commands below, replace `<container>` with the container's name, which is `threadsift` if you followed the README.

## Use Claude Code on the container

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

   Start the container with the token it prints in the `CLAUDE_CODE_OAUTH_TOKEN` environment variable. Keep `--env-file "$HOME/threadsift.env"` on the run command, because a container started without it has no secret key, and add `--env CLAUDE_CODE_OAUTH_TOKEN` beside it. Set the variable when the container starts. An export in a later `podman exec` shell does not reach the running app.

4. Open Settings, choose "Claude Code on this server" as the Provider, press **Save**, then press **Verify**.

Installing or removing Claude Code needs a restart. npm 12 skips the install script unless you allow it, so on npm 12 run `podman exec -it <container> npm config set "allow-scripts=@anthropic-ai/claude-code" --location=user` first. The image's npm is 11.20.0 and needs no change. If Claude Code rejects the token, Verify shows it.

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

   Codex prints a link and a code. Open the link on any device, enter the code and approve. Codex has no token variable. The login is saved in `/data/codex/auth.json` in the volume.

4. Open Settings, choose "Codex on this server" as the Provider, press **Save**, then press **Verify**. You can leave the model field blank to use Codex's default model. A model you type must be listed by `codex debug models --bundled`.

Installing, updating or removing Codex needs a restart, because the app reads Codex's model list once at start. At most 2 AI tasks run at once across Claude Code and Codex together. The app never reads or stores the login.

### When the app refuses Codex

Before every task the app checks what Codex would load. The task is refused, and the Provider shows "This Provider is not available on this Instance", when the machine has either of these:

- a Codex config file in `/etc/codex` with extra tools or instructions
- an administrator requirement

The app then logs `codex-surface-refused` with the names of the extra tools. Remove the extra configuration, or choose another Provider.

The app keeps `AGENTS.md`, `AGENTS.override.md` and `skills` in `/data/codex` empty on purpose, so Codex loads no instructions from them. The app deletes nothing. If it finds a real `AGENTS.md`, a real `AGENTS.override.md`, or a `skills` folder with anything in it, it does not offer Codex and logs `codex-home-refused` with the path.

Run no `codex` command in that home before step 2. A Codex command that runs there before the app has made its empty `skills` file creates a `skills/.system` folder, and the app then refuses the home. If that happened, remove `/data/codex/skills` yourself and restart.

### Follow OpenAI's sign-in rules

Under [OpenAI's CI guide](https://learn.chatgpt.com/docs/auth/ci-cd-auth), OpenAI allows ChatGPT-account sign-in only on trusted private infrastructure, such as your own home server. Use one `auth.json` per machine. Never share it between machines, and never put it in logs, a repository or public artifacts. OpenAI recommends API keys for automation, so choose an API Provider for an Import. If Verify says the sign-in was rejected, run the login command again.

## Connect Grok Bot

Threadsift hands X links to Grok Bot, which reads the posts and replies and saves them back. [bot/README.md](../../bot/README.md) says how to install and update the bot.

Open Settings, find Grok Bot, paste the routine's webhook address and key, press **Save**, then press **Test**. In Settings, the X posts section chooses which reader fetches X links. With the default, Auto, every pasted X link goes to the saved bot first; without a saved bot, a container fetches the link with the grok CLI when it is set up (the section "Use the grok CLI for X posts on the container" below), and otherwise the link stays a Link-only Item. A saved bot is never skipped under Auto, and a bot that does not answer is not retried through the CLI. Choose Grok Bot or grok CLI to use that reader alone: when it cannot be used, the link stays a Link-only Item and its note names the cause, and the other reader is not tried.

## Use the grok CLI for X posts on the container

When no Grok Bot is saved, or when you choose the grok CLI in the X posts section, Threadsift can fetch a pasted X post and its replies on the container by running the grok command-line tool (the grok CLI) on the server. The image ships no grok CLI, and nothing in the app installs it. Everything is kept in the folder `/data/grok` of the volume. On the Cloudflare Worker install there is no such tool, and a pasted X link stays a Link-only Item there unless a Grok Bot is saved.

1. Install the grok CLI into the volume (the image has `curl` for the installer):

   ```sh
   podman exec -it -e HOME=/data/grok -e GROK_BIN_DIR=/data/grok/bin <container> bash -c 'curl -fsSL https://x.ai/cli/install.sh | bash'
   ```

2. Restart the Instance so it finds the tool:

   ```sh
   podman restart <container>
   ```

3. Sign in on the server:

   ```sh
   podman exec -it -e HOME=/data/grok <container> grok login --device-auth
   ```

   The tool prints a link and a code; open the link on any device, enter the code and approve. The login is saved in `/data/grok/auth.json` in the volume.

4. Open Settings. The "X posts" section shows the grok CLI as signed in. Paste an X link; the Item shows the post and its replies like a Reddit thread.

Installing, updating or removing the CLI needs a restart.

Every fetch is one run on the owner's Grok plan, and it counts against that plan's usage. At most 2 fetches run at once.

A fetch run can reach xAI's web search and page-open tools, which grok 1.0.77 cannot turn off without losing the X tools. A hostile reply could make the run search or open a public web page, which sends public post text and the Grok account's saved rules to that page. For this reason use a Grok account kept for this server, with no private rules saved in it. The run reaches no tool of the server. [Fetchers](../architecture/fetchers.md) holds the isolation rule.

Threadsift shows a thread only after it checks each post against X's public embed answer, as Fetchers describes. A reply that fails is left out, and the Item ends with a note that further replies were not saved. If the post itself fails, the Item stays a Link-only Item. When X cannot be reached or limits requests, Threadsift tries again a little later, up to two more times; after that, the link stays a Link-only Item.

The app makes one test run before the first fetch after it starts, and again whenever the installed binary changes. It refuses the fetch unless the tool is the checked version, 1.0.77. A newer version stays refused. Restarting the Instance with `podman restart <container>` only repeats the test run, so you need either the checked version or an app release that checks the newer one. The Item stays Link-only, the log shows `x-fetch-refused` with the category `surface-unproven`, and Settings shows "Not proven" with the version. The app never reads or copies the login file.

The run asks the model to make at most 6 reply searches, besides the reads of the post's thread and quoted posts. That is a request, not a limit the app enforces; the 3-minute run deadline (`X_RUN_DEADLINE_MS` in `src/core/request-waits.ts`) is the limit. A post with very many replies stores only the replies the first lookups return, the Reader then shows that further replies were not saved, and a later fetch never replaces a stored thread with one that has fewer replies.

A signed-out CLI leaves a Link-only Item with no Try again button. Sign in, then paste the link again.
