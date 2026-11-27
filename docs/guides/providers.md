# Set up a Provider

An API Provider needs only the fields Settings shows. Fill them in, press **Save**, then press **Verify**. This guide covers the Providers that need more setup: Claude Code and Codex, which run as command-line tools inside the container, and Grok Bot. It also covers the grok CLI that fetches X posts, and the tool that compares Providers.

- [Choose a model and effort](#choose-a-model-and-effort)
- [Use Claude Code on the container](#use-claude-code-on-the-container)
- [Use Codex on the container](#use-codex-on-the-container)
- [Connect Grok Bot](#connect-grok-bot)
- [Use the grok CLI for X posts on the container](#use-the-grok-cli-for-x-posts-on-the-container)
- [Compare Providers](#compare-providers)

The container image ships no AI command-line tool. Everything you install or sign in to stays in its `/data` volume. In the commands below, replace `<container>` with the container's name, which is `threadsift` if you followed the README.

## Choose a model and effort

For Claude Code and Codex, use **Model and effort** in Settings to choose what runs. The saved choice applies to Verify and to every other AI task.

| Choice | What runs | Fields |
|---|---|---|
| Recommended | The pair named in Settings. It appears when the installed CLI supports the pair. | None |
| CLI defaults | The CLI's own model and effort, also after a CLI update. | None |
| Custom | The Model, the Effort, or both. | Model, Effort |

With Custom, a model alone uses the CLI's default effort, and an effort alone uses the recommended model. When there is no recommendation, Claude Code chooses its model and Codex uses the first visible model of its bundled catalog.

Claude Code accepts the levels that `podman exec <container> claude --help` lists. Codex lists its levels and defaults under `supported_reasoning_levels` and `default_reasoning_level` in the output of `podman exec <container> codex debug models --bundled`.

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

4. Open Settings, choose "Claude Code in this container" as the Provider, press **Save**, then press **Verify**.

Installing, updating or removing Claude Code needs a restart. [Claude Code's model configuration](https://code.claude.com/docs/en/model-config#model-aliases) gives the minimum version for Sonnet 5.5. If Claude Code rejects the token, Verify shows it.

npm 12 skips the install script unless you allow it. On npm 12, run `podman exec -it <container> npm config set "allow-scripts=@anthropic-ai/claude-code" --location=user` first. The image's npm is 11.20.0 and needs no change.

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

4. Open Settings, choose "Codex in this container" as the Provider, press **Save**, then press **Verify**. Settings shows a recommendation when the installed Codex lists the recommended model and its effort. A model you type must appear in the output of `podman exec <container> codex debug models --bundled`.

Installing, updating or removing Codex needs a restart, because the app reads Codex's model list once at start. At most 2 AI tasks run at once across Claude Code and Codex together. The app never reads or stores the login.

### When the app refuses Codex

Before every task, the app checks what Codex would load. The Provider shows "This provider isn’t available on this instance. Choose another provider.", and the log names the extra tools, when the machine has either of these:

- a Codex config file in `/etc/codex` with extra tools or instructions
- an administrator requirement

Remove the extra configuration, or choose another Provider.

The app keeps `AGENTS.md`, `AGENTS.override.md` and `skills` in `/data/codex` empty on purpose, so Codex loads no instructions from them. It deletes nothing. It does not offer Codex, and the log names the path, when it finds an `AGENTS.md` or `AGENTS.override.md` that is not an empty folder, or a `skills` that is not an empty file.

Run no `codex` command in that home before step 2. A Codex command that runs there first creates a `skills/.system` folder, and the app then refuses the home. If that happened, remove `/data/codex/skills` yourself and restart.

### Follow OpenAI's sign-in rules

[OpenAI's CI guide](https://learn.chatgpt.com/docs/auth/ci-cd-auth) allows ChatGPT-account sign-in only on trusted private infrastructure, such as your own home server. Use one `auth.json` per machine. Never share it between machines, and never put it in logs, a repository or public artifacts. OpenAI recommends API keys for automation, so choose an API Provider for an Import. If Verify says the sign-in was rejected, run the login command again.

## Connect Grok Bot

Threadsift hands X links to Grok Bot, which reads the posts and replies and saves them back. The [Grok Bot README](../../bot/README.md) says how to install and update the bot.

Open Settings, find Grok Bot, paste the routine's webhook address and key, press **Save**, then press **Test**.

The X posts section in Settings chooses the reader for X links: Auto (the default), Grok Bot or the grok CLI. Auto sends a pasted link to the saved bot when its settings can send. Otherwise the container fetches it with the grok CLI when that is set up, and the link stays a Link-only Item when it is not. [Fetchers](../architecture/fetchers.md), X, holds the rules of each choice.

## Use the grok CLI for X posts on the container

When no usable Grok Bot is saved, or when you choose the grok CLI in the X posts section, Threadsift can fetch a pasted X post and its replies on the container by running the grok command-line tool (the grok CLI) on the server. The image ships no grok CLI, and nothing in the app installs it. Everything stays in the folder `/data/grok` of the volume. The Cloudflare Worker install has no such tool, so a pasted X link stays a Link-only Item there unless a Grok Bot is saved.

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

   The tool prints a link and a code. Open the link on any device, enter the code and approve. The login is saved in `/data/grok/auth.json` in the volume.

4. Open Settings. The "X posts" section shows the grok CLI as signed in. Paste an X link. The Item shows the post and its replies like a Reddit thread.

Installing, updating or removing the CLI needs a restart. A signed-out CLI leaves a Link-only Item with no Try again button. Sign in, then paste the link again.

### Cost and risk

Every fetch is one run on the owner's Grok plan and counts against its usage. At most 2 fetches run at once.

A fetch run can reach xAI's web search and page-open tools, which grok 1.0.77 cannot turn off without losing the X tools. A hostile reply could make the run open a public web page, which sends public post text and the Grok account's saved rules to that page. Use a Grok account kept for this server, with no private rules saved in it. The run reaches no tool of the server, and the app never reads or copies the login file. [Fetchers](../architecture/fetchers.md) holds the isolation rule.

### When the app refuses the grok CLI

The app makes one test run before the first fetch after it starts, and again whenever the installed binary changes. It refuses the CLI unless it is the checked version, 1.0.77. While it refuses, X links stay Link-only Items and Settings shows "Not checked" with the version. Install the checked version, or update Threadsift to a release that checks the newer one. Restarting the Instance only repeats the test run.

When X cannot be reached or limits requests, Threadsift tries again a little later, up to two more times, and then leaves a Link-only Item. A reply that fails the check against X is left out, and the Item says that further replies were not saved.

## Compare Providers

The comparison tool runs the same Digest task through several Providers and records the results. It chooses no default model. Run it from this checkout with Node, through `direnv exec .`, as the steps below show.

Workers AI bills by use. Leave `CLOUDFLARE_WORKERS_AI_TOKEN` unset in a comparison run, so that the `workers-ai` row records `workers-ai-credentials-missing` and no call is sent. No comparison run calls Workers AI, the owner's included.

1. Choose 20 Items from the owner's library. Put their numeric Item ids, or their original or normalized URLs, in a JSON array outside every git checkout.
2. Make an output folder outside every git checkout, and keep the Item list there as `items.json`. Capture the inputs from the container's SQLite database, with read access to the data volume:

   ```sh
   mkdir -m 700 /tmp/threadsift-comparison
   direnv exec . node tools/provider-comparison.ts capture /path/to/data/threadsift.db /tmp/threadsift-comparison/items.json /tmp/threadsift-comparison
   ```

   The command prints the capture folder. Keep its `inputs.json`, which freezes the app's selected comments, catalog and linked-page text together. Use that same file in later runs, even if the library changes.

   Capture changes no library data. It reuses a current model Digest input when one exists, and otherwise prepares one from the Item and its linked page through the app's core functions. When it prepares an input for an Item with stored post text, it reads that text from the `files` folder beside the database, so copy that folder beside a copy of the database; an Item whose text file is missing gets the reason `post-text-unreadable`. An Item without usable content gets a reason in each Provider's record. If linked GitHub pages need the library's saved GitHub token, inject that Instance's `THREADSIFT_SECRET_KEY` for capture. If capture reports `Duplicate Items`, remove the repeated selector and capture again.

3. Create `providers.json` outside the checkout. `ProvidersSchema` defines the fields. Each row has a unique `id`, a `provider` and an explicit `model`. A Claude Code or Codex row may include an `effort`.
   - Use `claude-code`, `codex`, `workers-ai`, `openrouter` and `grok-bot` as the `provider` values.
   - Use different ids to compare two efforts on one model without changing the Item list.
   - OpenRouter accepts only model ids that end in `:free`, and the tool sends the app's zero-price routing limit as well. The free router and the CLI defaults are unsuitable here, because the executors do not report which model actually answered. Keep the key's own free-only guardrail enabled.
4. Sign in to the CLIs with their own commands, as this guide describes.
   - Set `CLAUDE_CONFIG_DIR` or `CLAUDE_CODE_OAUTH_TOKEN` for Claude Code, and `CODEX_HOME` for the reserved Codex home. Keep both CLI home paths outside every git checkout. The tool checks their location before it starts a CLI, and it uses the app's isolation checks without reading login files.
   - A `cli-missing` record means the executable was not found. For `cli-setup-refused`, read the adapter's category on stderr for the exact cause.
   - Inject `OPENROUTER_API_KEY` from the secret store into the environment.
   - Put no secret in either JSON file or in a command argument.
5. Start the comparison, and replace the capture path with the one printed in step 2:

   ```sh
   direnv exec . node tools/provider-comparison.ts run /tmp/threadsift-comparison/inputs-XXXXXX/inputs.json /tmp/threadsift-comparison/providers.json /tmp/threadsift-comparison
   ```

   The command prints a new run folder. Run it again with the same files to get a second set. Direct any captured terminal output to a file outside the repository too.

### Read the results

Each run folder holds `inputs.json`, `manifest.json` and `records.jsonl`. The snapshot hash, the source revision and the Provider models in the manifest identify comparable runs.

- Item references belong to the captured library. A refreshed Item keeps its id but can have a different generation, and an unrelated library can reuse the id. The captured text and the snapshot hash keep the comparison tied to its original inputs.
- Capture and run need committed Digest-contract files, and the manifest keeps both revisions. If those files changed between the two revisions, capture the Item list again. A Provider or model change can reuse a capture while they stay unchanged.
- Records hold the model's Digest and the Kept comment ids the app would publish. Each pair has an elapsed time around the executor call and its result check, which leaves out Provider startup, input capture and disk writes.
- Calls run one at a time, with the app's AI call deadline and no retry. A refusal or a missing login does not end the run. A call that throws records the reason `executor-failed` and the error's class name in `error`. A Provider that fails to start records the `availability` `provider-initialization-failed` and the class name in `availabilityError`. Neither record holds message text.
- Workers AI sends a call only when both of its variables are set. Grok Bot records `bot-callback-fixed-to-live-instance`, because its routine answers the live Instance. The comparison sends it no webhook and changes no bot settings.
