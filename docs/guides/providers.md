# Set up a Provider

The Provider is where the agent's AI comes from. You pick one in Settings, and the agent uses it for every Digest and its other AI tasks, such as Topic overviews.

An API Provider needs only the fields Settings shows: choose Anthropic, OpenAI, xAI, OpenRouter or an OpenAI-compatible URL, then fill in the model and the API key, and for an OpenAI-compatible URL also the base URL. Press **Save**, then press **Verify**. The rest of this guide covers the Providers that need more setup: Claude Code and Codex, which run as command-line tools inside the container, and Grok Bot.

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

The install and the login stay in the volume when you remove and recreate the container on the same volume. Installing or removing Claude Code needs a restart. npm 12 skips the install script unless you allow it, so on npm 12 run `podman exec -it <container> npm config set "allow-scripts=@anthropic-ai/claude-code" --location=user` first. The image's npm is 11.20.0 and needs no change. If Claude Code rejects the token, Verify shows it.

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

The install and the login stay in the volume when you remove and recreate the container on the same volume. Installing, updating or removing Codex needs a restart, because the app reads Codex's model list once at start. At most 2 AI tasks run at once across Claude Code and Codex together. The app never reads or stores the login.

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

Open Settings, find Grok Bot, paste the routine's webhook address and key, press **Save**, then press **Test**. Every pasted X link goes to the bot first. Without a bot, an X link stays a Link-only Item.

The Provider list always shows Grok Bot, and you can choose it once the Grok Bot settings are saved and usable.
