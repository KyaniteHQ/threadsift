# AI tasks and Providers

Every model call is an AI task with a kind, inputs, an input revision and a Zod result schema. The core creates the task row, an executor (the adapter that runs AI tasks for one kind of Provider) runs it, and the core checks the result against the schema and the rules before it applies it. A result whose input revision is no longer current is not applied. The core queues the same step again over the current inputs instead, so no Item's Digest is left out of a Topic overview. A number on this page with no source named is our choice, not a measurement.

- [Providers and executors](#providers-and-executors)
- [The task row](#the-task-row)
- [Settings and secrets](#settings-and-secrets)
- [OpenRouter Connect](#openrouter-connect)
- [The HTTP executor](#the-http-executor)
- [Refusal mapping](#refusal-mapping)
- [Workers AI binding](#workers-ai-binding)
- [CLI executors](#cli-executors)
- [Grok Bot](#grok-bot)
- [The task kinds](#the-task-kinds)

```text
job claim, then one read of the AI settings and their revision
   |
   v
start task row (kind, inputs, input revision, deadline)
   |   (no row while the settings revision moved and the claim is held:
   |    the job is due again at once, no attempt counted)
   v
executor: HTTP, Workers AI binding, Claude Code, Codex, or Grok Bot
   |
   v
core checks the result against the schema and the rules
   |
   v
one guarded batch: kind's writes, task completion, job close
   (nothing is written when the input revision moved; the task fails `stale`)
```

## Providers and executors

`PROVIDERS` holds one row for each Provider family: its id, its kind, its label, its fixed base URL and its form fields.

| Provider | Kind | Runs on |
|---|---|---|
| `openai-compatible` | `http` | Both targets. The Worker needs a public HTTPS address. The container also allows a private HTTP address, such as Ollama. |
| `openrouter`, `anthropic`, `openai`, `xai` | `http` | Both targets. |
| `workers-ai` | `binding` | The Worker only. |
| `claude-code`, `codex` | `cli` | The container only. |
| `grok-bot` | `bot` | Both targets. |

Everything that lists or validates Providers reads `PROVIDERS`: the settings contract, the `settings` table's provider column and its CHECK lists, the list each install target offers, and the web app's base URL rule and form fields. A family that reuses an implemented adapter is therefore one new row. A new HTTP id also needs a branch in `languageModel`, and the web help text of a family is keyed by that family. What a saved row becomes (its connection, whether it is ready, the view the settings page gets) is written once for each kind.

The Worker lists no CLI row, refuses a CLI save with 400, and imports no subprocess code. A container that reads a stored Workers AI row records the task and refuses it as `provider-unavailable`. A save that names a Provider the target does not list answers 400 before it writes settings or queues a Digest.

Without Grok Bot as the Provider, every model task runs on the Provider the owner picked, on that target's executor; who reads a fresh X link is the X reader choice ([X links](#x-links)). With Grok Bot as the Provider, it runs every AI task (Grok Bot). There is no silent fallback to another Provider, because the owner picks one.

The Grok CLI is not an executor (CLI executors).

## The task row

- **Origin.** Each task row stores the Provider, model and executor (`http`, `binding`, `cli`, `grok-bot` or `caller`) of the connection it loaded, a failed Verify included. An empty CLI model is stored as null. A caller-sent Digest task stores the executor `caller` with a null Provider and model.
- **Owner.** `ai_tasks.item_id` names the Item a task works for. A Digest task carries its Item. The Verify task is the only one that carries null.
- **Delete.** The key is `ON DELETE CASCADE`, like every other child of `items`. `inputs` holds up to 14,000 bytes of the Item's text, so `SET NULL` would leave that text behind after the Item is gone. `NO ACTION` would make every delete of an Item list its tasks first. SQLite checks a `NO ACTION` key at the end of a statement, so one `DELETE FROM items` removes the Digest and the task it names together, while a delete of that task alone is refused.
- **Start.** A job's model task starts only while the job still holds its claim and the AI settings revision is the one the attempt loaded, in one `INSERT ... SELECT ... WHERE`. When the insert writes no row, the attempt makes no Provider call: with the claim still held the settings moved, and the job is due again at once without an attempt; without the claim the attempt reports the lost claim. A refusal the attempt decides before the insert, such as a refused base URL, is checked against the revision the same way before it closes the job. A task whose insert committed before the owner changed the settings runs to its end on the Provider it loaded and publishes with that Provider's provenance, because the call is already made and paid. Verify runs without a job and has no such guard.
- **Verify.** Verify sends no comments, stores `keptComments: []` whatever the model answers, and writes no Item, Topic or Tag.
- **Deadline.** Every model task has the AI call deadline ([Jobs, leases and the schedule](jobs-leases-and-the-schedule.md), Deadlines, attempts and retries). Grok Bot tasks get one hour (Grok Bot).

## Settings and secrets

- **Sealed settings.** The sealer uses Web Crypto AES-GCM with a fresh 96-bit IV. `THREADSIFT_SECRET_KEY` is 32 random bytes written as 64 hex characters, supplied as an environment variable in the container or as a Worker secret.
  - A missing or malformed key blocks Save and Verify of an HTTP Provider.
  - A stored key that cannot be decrypted loads as `secret-missing`. It blocks Verify and a Save that carries no new key. A Save that carries a new API key seals it under the current key and replaces the row. The GitHub token and the Grok Bot key replace the same way.
  - Workers AI seals nothing, so its Save and Verify work without the key.
  - Responses reveal only whether a key is set. The executors return selected refusal categories and an HTTP status, never an SDK error object, because those objects can contain credentials.
- **Settings revision.** The `ai_settings_revision` table has one row and counts changes to `settings`. Triggers add 1 after every insert, update and delete, so every writer moves it. A typed Save and OpenRouter Connect compare the revision with the one the page was loaded at. When it moved, the Save is refused without a write and answers 409 (`settings-changed`), so a Save that keeps the stored key cannot write back a key that a Connect or another Save replaced in between.
- **CLI model and effort.** `SlottedCli.resolve` resolves the saved choice (Recommended, CLI defaults or Custom) for Verify and every AI task.
  - CLI defaults omits both overrides, so the task and its Digest record no model.
  - Settings offers Recommended only when the runner has a supported pair. A saved recommendation falls back to CLI defaults while its pair is unavailable, and the settings route refuses a new recommendation when the runner has none.
  - Custom requires a model, an effort or both. [Default model in the spec](../spec.md#ai-providers) describes partial fields.
  - If a catalog update removes a saved effort level, the runner refuses with `invalid-effort` and the accepted levels. An unknown model gives `model-not-found`.

## OpenRouter Connect

Connect is OpenRouter's PKCE flow ([OpenRouter docs](https://openrouter.ai/docs/use-cases/oauth-pkce), [RFC 7636](https://www.rfc-editor.org/rfc/rfc7636)). The returned key is sealed and saved like a typed key.

```text
browser          Threadsift                         OpenRouter
   | Start           |                                  |
   |---------------->| store attempt row                |
   |<----------------| authorization address            |
   | approve ------------------------------------------>|
   |<------------------------------ redirect with code   |
   | callback ------>| claim attempt row (one DELETE)   |
   |                 | exchange code ------------------>|
   |                 | save key, wait until it works    |
   |<----------------| 303 /settings?openrouter=<notice>|
```

- **Public origin.** Connect needs `THREADSIFT_PUBLIC_ORIGIN`. Without it, the settings view reports `connect: false` and Start answers 503. A malformed value is an error: the container exits 1 at start, and the Worker rejects every request that needs its ports. The callback address is that origin plus a fixed path.
- **Start.** Start checks `Origin`, `Sec-Fetch-Site: same-origin` and the request host, because Hono's `csrf` middleware skips JSON bodies. It stores one `openrouter_connect_transactions` row (digests of a random `state` and of the session, the sealed PKCE verifier, the model, the settings revision, the origin and a 10-minute expiry, the lifetime OpenRouter gives a code) in one guarded batch that commits only while the session is live and the revision is current. Every time comes from the database clock.
- **Callback.** The callback is the one `/api/*` route that a browser reaches by redirect. It answers `Cache-Control: no-store` and `Referrer-Policy: no-referrer`, so the code in the query is not cached or sent on. A signed-out browser navigation gets a 303 to `/settings` instead of a 401, and every method but `GET` gets 405, because a `HEAD` must not complete an attempt. One `DELETE ... RETURNING` claims the attempt row on the state digest, the session digest, the expiry, the origin, the revision and a live session, so a code is used once, only by the session that started it.
- **Exchange.** The exchange has an 8-second deadline and a body read capped at 16 KiB. A 400 or 403 means OpenRouter refused the code (`incomplete`). Any other status, a thrown error, a timeout or a malformed body is `uncertain`, and OpenRouter may then have made a key, so the notice is `possible-orphan`.
- **Activation wait.** A key from the OAuth exchange can answer 401 for several seconds (up to 17.2 s in 16 runs, see AI providers in [Decisions and evidence](decisions-and-evidence.md)), and a 401 is final in `retriesAi`, so a Digest job that met the delay would fail with `wrong-key` for good. The callback therefore polls `GET https://openrouter.ai/api/v1/key` (the current-key endpoint, which spends no credits) every second for at most 45 seconds. A 401 means wait, and a 200 means active.
- **Final save.** The key is stored before the wait, in one guarded batch that commits only while the session is live, the revision is still the one Start saw and the attempt has not expired. After the wait, the callback commits only while the stored row is still the prepared one and Grok Bot is not the Provider. The notice is `settings-changed` for a replaced row or a switch to Grok Bot, `activation-pending` for an inactive key (a typed Save then opens the Digests), and `connected` for an active key, which reopens Items whose last Digest task was refused with `wrong-key`.
- **Back button.** Start leaves the page, so the form waits in the `leaving` phase (`useAiPhase`). A page that the browser restores from its back/forward cache stays mounted, so a persisted `pageshow` returns the form to idle and the form works again after Back.
- **Price limit.** `THREADSIFT_OPENROUTER_MAX_PRICE_ZERO=true` makes the OpenRouter adapter send a $0 `provider.max_price` on every inference. OpenRouter documents no `max_price` limits for cache or reasoning prices, so a key-level guardrail is a separate control ([provider selection](https://openrouter.ai/docs/guides/routing/provider-selection#max-price)).

## The HTTP executor

The HTTP executor uses the `ai` package with `@ai-sdk/openai-compatible`, `@ai-sdk/anthropic`, `@ai-sdk/openai` and `@ai-sdk/xai`. It calls `generateText` with `Output.object`, retries off, telemetry off and the attempt's abort signal. Anthropic runs on the Messages API, OpenAI and xAI on the Responses API (the xAI package has no Chat factory), and OpenRouter and `openai-compatible` on the OpenAI-compatible adapter with structured outputs. See the [AI SDK provider pages](https://ai-sdk.dev/providers/ai-sdk-providers/openai) for each factory.

- Every factory gets the same `aiTransport` fetch and the row's fixed base URL.
- The Worker imports the HTTP executor inside the call, so an isolate that serves other routes does not initialize either SDK package. Lazy loading keeps named-import tree shaking, and `pnpm build:worker` checks the upload size.
- `aiTransport` refuses redirects on both targets. On the Worker, `allowedAiUrl` applies the fetch guard's public-address rules and requires HTTPS on Save and Verify, and `workerFetch` turns Cloudflare's 530 error page into a network failure. The local Worker's name-check gap in [Open items and unverified claims](open-items-and-unverified-claims.md) still applies. The container permits a private HTTP endpoint for Ollama.

## Refusal mapping

`executionRefusal` turns every SDK error into one category. The executor reads the finish reason before the output, so `content-filter` is `declined` and `length` is `cut-off`, even when the text parsed.

| Cause | Category |
|---|---|
| HTTP 401 or 403 | `wrong-key` |
| xAI HTTP 400 whose message holds `Incorrect API key provided` | `wrong-key` |
| HTTP 400 or 422, or text that is not valid JSON or fails the schema | `no-json` |
| HTTP 404 | `model-not-found` |
| HTTP 429 or 5xx | `provider-busy` |
| Any other status, or no status | `unreachable` |
| Redirect or refused address | `refused` |
| The attempt's signal aborted | `timeout` |

- Anthropic (`authentication_error`) and OpenAI (`invalid_api_key`) answer a wrong key with 401. xAI answers it with 400, which is why the message check exists.
- `declined` and `cut-off` are deterministic for the same model and input, so `retriesAi` does not retry them. `wrong-key`, `model-not-found`, `invalid-effort`, `refused`, `provider-unavailable`, `key-needed`, `not-configured`, `cli-not-started` and `secret-missing` are final too. The Digest job marks the Item failed with Try again, and Verify shows the recovery text.
- `unreachable`, `timeout` and `provider-busy` are retried. `no-json` is retried only when it has no HTTP status or a 2xx status, because a model can return valid JSON on the next call.
- Before the last attempt, a model job retries a retriable refusal only if its inputs are current. If the inputs are stale when checked, the job requeues without spending an attempt, even if they become current before the outcome is written (`refusalOutcome`).
- A refusal part that the SDK cannot decode is `no-json` with status 200. The `declined` and `cut-off` classifications and each vendor's request shape are unverified ([Open items and unverified claims](open-items-and-unverified-claims.md)).

## Workers AI binding

The Worker adds `workers-ai` to the list `providersOf` returns when its environment has an `AI` binding. The container never has one.

- **Answer.** `response` is an object in JSON Mode and a string otherwise. The executor takes an object as it is and parses a string, then validates the result with the task's Zod schema, because the JSON Schema leaves out the Summary's two-line rule.
- **Errors.** The binding throws `InferenceUpstreamError` (its `name` reads `AiError`) whose message starts with the internal code, as in `5007: No such model ...`. `bindingRunner` maps the codes below and logs one `ai-binding-unmapped` line for any other, with the code (or `none`) and the error class, never the message, the prompt or the input. An unmapped code stays `unreachable`.

| Code | Category |
|---|---|
| `5007`, `3042` | `model-not-found` |
| `3007`, `3008` | `timeout` |
| `3040`, `3036` | `provider-busy` |

- **Daily allocation.** Code `3036` means the daily allocation is used up. The recovery is to wait for the next day or choose another Provider. The closed task keeps only the refusal kind, not the code.
- **`unreachable` is not always the binding.** Several places close an AI task as `unreachable`: `bindingRunner` for an unmapped binding error, `applySettled` when the job's database write throws after the model answered (it logs `job-write-failed` with `databaseCode`), `verifyAi` and `execute` when recording a completion or a refusal throws (they log `verify-completion-failed` and `ai-task-run-failed` with the task id and the error class), and `runAi` when a target has no binding runner. Read the cause from the log line that is present, and never from the absence of another.
- **Where a real call runs.** Only a deployed Worker calls the binding. Wrangler's remote session needs a token with a Workers Scripts permission, which would let a pull request's job write the account's Workers, so no local or CI run uses the binding. The smoke spec, the live check and `devenv up` start `wrangler dev --local`, where `env.AI.run` throws `Binding AI needs to be run remotely` and Verify ends as `unreachable`, with the task row recording `binding`, `workers-ai` and the model.

## CLI executors

Claude Code and Codex share one run skeleton (`SlottedCli`). `startNode` registers a row only when it finds an executable on the app's `PATH` at start, so installing or removing a CLI needs a restart.

- **Concurrency.** At most 2 CLI tasks run at once on an Instance, Verify and Digests together, across both CLIs (`CAPACITY.cliTasks`, because a plan is one person's quota). A task that waits for a slot spends its deadline.
- **Process.** Each argument is its own argument with `shell: false`, and the prompt goes on stdin. The run starts in a new empty folder. Output stops at 1 MiB on stdout and 64 KiB on stderr, and a run over a cap is killed and refused as `no-json`. The task deadline is the AI call deadline.
- **Sign-in state.** Every AI settings load and every save of a CLI row runs a probe, which answers signed in, signed out or unknown: `claude auth status --json` (field `loggedIn`; output that does not parse is unknown) or `codex login status` (exit code 0 is signed in, exit code 1 with the line `Not logged in` on stderr is signed out, and any other result is unknown, including the exit code 1 of an unreadable `config.toml`). A probe that does not finish, or that a signal ends, is unknown for every CLI, also at its 15-second deadline when the child ignores `SIGTERM` (`answerWithin`). The settings count a CLI as signed in only when the probe answers signed in. The result is a local hint. A rejected token or an invented `auth.json` still reads as signed in, and only Verify proves that a model request works.
- **Refusals.** A spawn failure is `cli-not-started`, an abort is `timeout`, and output over the cap is `no-json`, with no probe. A task probes sign-in once when its executor's parser leaves the run unclassified; each executor below lists those runs. Signed out is `not-configured`. Signed in and unknown are `unreachable`, so a job retries it, and Verify returns it after one attempt. A probe that gives no answer within its 15-second limit is unknown. The probe stops when the task's signal aborts, and the task then ends as `timeout`. A refusal of a run that held a slot logs one `cli-refused` line with the Provider, the category and the exit code, never stdout, stderr or the prompt. A task that aborts while it waits for a slot ends as `timeout` and logs no line.
- **Stopping.** A task aborts when its signal does and when the Instance shuts down. `runProcess` sends `SIGTERM` to the process group, then `SIGKILL` after `KILL_GRACE_MS` (5 seconds), and frees the slot even when a descendant that left the group keeps a pipe open. On `SIGTERM` or `SIGINT`, the HTTP drain (`HTTP_DRAIN_TIMEOUT_MS`) and the job loop's wait (`STOP_WAIT_MS`) are 9 seconds each, which fits the 10-second default of `podman stop`. A job still running after that starts again at the next start, as after a crash (see Container restart in [Jobs, leases and the schedule](jobs-leases-and-the-schedule.md)).

### CLI executor (Claude Code)

- **Arguments.** The task runs `claude -p` with JSON output, `--json-schema`, `--safe-mode`, `--tools ""`, `--strict-mcp-config`, empty `--setting-sources` and no session persistence, then `--effort` and `--model` when the choice sets them.
- **Flags it avoids.** `--bare` reads no OAuth login ([CLI reference](https://code.claude.com/docs/en/cli-reference)). The run uses no permission-bypass, plugin, agent, `--add-dir` or `--mcp-config` flag, so `--strict-mcp-config` leaves no MCP server. `--disallowed-tools "*"` is absent on purpose: `--tools ""` already removes every built-in tool, and the deny rule also denies Claude Code's own `StructuredOutput` tool, through which `--json-schema` returns its answer.
- **Schema dialect.** `--json-schema` validates with draft-07, and Zod's default draft 2020-12 output fails. The executor calls `z.toJSONSchema(schema, { target: "draft-7" })`, then checks `structured_output` against the task's Zod schema, as the HTTP executor does.
- **Environment.** The child gets `HOME`, `CLAUDE_CODE_DISABLE_ATTACHMENTS=1`, `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1`, the `PATH` above, and `CLAUDE_CONFIG_DIR` and `CLAUDE_CODE_OAUTH_TOKEN` when the Instance has them. No `THREADSIFT_*` variable, proxy or endpoint override reaches the run. This limits what the model-facing run sees. It does not sandbox the binary from files the `node` user can read. Threadsift never parses CLI credential files or returns a login through its UI, API, database or logs, and in token mode it forwards the owner's token unchanged.
- **Refusals.** A run that exits 0 with no JSON envelope is `no-json`, with no probe, and an error envelope with an API status goes through `apiRefusal`. A non-zero exit with no JSON envelope, and an error envelope without an API status on any exit code, exit 0 included, probe sign-in once (CLI executors, Refusals, above).
- **Recommendation.** Recommended is `claude-sonnet-5-5` at `medium`, offered when `claude --version` is 2.1.284 or later. The effort levels are `low`, `medium`, `high`, `xhigh` and `max`.

### CLI executor (Codex)

`startNode` registers the Codex row only when all of these hold:

- It finds an executable `codex` on the app's `PATH`.
- The Codex home passes the reservation check below.
- The bundled model catalog loads (`codex debug models --bundled`, read once at start with a 30-second limit and an 8 MiB cap). A failure leaves the row out and logs `codex-catalog-refused`.

Recommended is `gpt-6.2-sol` at `medium`, offered when the bundled catalog lists that pair. The Worker runs no Codex code. The child gets `PATH`, `HOME` (a new empty folder for each run) and `CODEX_HOME`, and the Instance never reads or forwards `auth.json`.

- **Arguments.** The task runs `codex exec --json --ephemeral --ignore-user-config --ignore-rules --sandbox read-only --output-schema <file>`, the model and effort, and flags that disable apps, plugins, hooks, web search, agents and bundled skills.
- **Tools off.** Codex has no switch that turns every tool off, so the executor removes them from the model's catalog. Each run writes a private copy of the catalog with `tool_mode` null, `apply_patch_tool_type` null, `shell_type` `"disabled"` and `experimental_supported_tools` empty for every model, and points `-c model_catalog_json=<file>` at it. Leaving one of the four fields at its stock value brings tools back. `functions.request_user_input` stays, because no catalog field removes it, and `codex exec` has no user to answer it. The executor refuses a `--model` that the edited catalog does not list as `model-not-found` before it starts any process, because an unlisted model would get the default shell.
- **Runtime check of the tool surface.** Codex still loads `/etc/codex/config.toml`, `/etc/codex/requirements.toml`, the legacy `/etc/codex/managed_config.toml`, `/etc/codex/skills` and cloud-managed requirements, and a managed `model_catalog_json` replaces ours. Before each task, in the same slot, the executor therefore runs `codex debug prompt-input` with the task's `--disable` and `-c` arguments, environment and catalog file.
  - It refuses the task as `provider-unavailable` when the output lists any tool other than `functions.request_user_input`, or any text that is neither a Codex base text (`surfaceOf`) nor the check's own prompt. It logs `codex-surface-refused` with the extra tool names and the count of foreign texts, never their content.
  - A check that cannot start is `cli-not-started`, and one that fails or cannot be parsed is `unreachable`. The check has its own 60-second limit.
  - `prompt-input` also reads `$CODEX_HOME/config.toml`, which `exec` skips (it accepts neither `--ignore-user-config` nor `--ignore-rules`), so a `config.toml` that adds an MCP server refuses the task although `exec` would ignore it. The check is stricter than `exec`. The check and `exec` are two processes, so a file that changes between them is not seen.
- **Codex home.** Codex reads `AGENTS.md` and `skills/` in its home even with `--ignore-user-config` and `--ignore-rules`. At start, the app checks `AGENTS.md`, `AGENTS.override.md` and `skills` in the Codex home and deletes nothing. When one of them holds anything, it leaves the row out and logs `codex-home-refused` with the path. Only when all three are missing or empty does it create the missing ones (`AGENTS.md` and `AGENTS.override.md` as empty folders, `skills` as an empty file). A stock `codex debug prompt-input` on a fresh home creates `skills/.system`, so a home that Codex touched first is refused. The setup order in the [Provider guide](../guides/providers.md) (install, restart, sign in) makes the app reserve the names first.
- **Refusals.** The executor reads the `--json` event stream and maps a `turn.failed` message to a refusal: `unexpected status NNN` through `apiRefusal`, and the texts for sign-in, model, usage-limit and `content_filter` failures. An exit 0 with no failure message and no final answer is `no-json`, with no probe. A failed exit with no failure message, and a failure message that matches none of those texts on any exit code, probe sign-in once (CLI executors, Refusals, above).
- **Login policy.** OpenAI's [CI guide](https://learn.chatgpt.com/docs/auth/ci-cd-auth) allows a ChatGPT-managed `auth.json` only on trusted private infrastructure, with one file per runner, and recommends an API key for automation. The Codex row is therefore for the owner's own home server with one login per Instance, and an API Provider is the better choice for an Import.

### CLI executor, Grok CLI

The Grok CLI is not a Provider. The container uses it as an X fetcher under the isolation rule in [Fetchers](fetchers.md), and the Provider table in the [spec](../spec.md) names Claude Code and Codex only. It has no Provider row, because no supported command (grok 1.0.77) proves that a run has no tools before the run contacts xAI. The run writes its tool list under `GROK_HOME` after it processed the prompt, no command prints the tools without starting a session, and the version has no documented sign-in check. The fetcher's preflight proves zero local tools but reads no backend setting. A Provider row would need a documented sign-in check, a signed-in proof on the owner's machine with a dedicated Grok login, a new `GROK_HOME` for each task, and the signed-out cases (row absent, signed out, a Worker refusal with 400).

## Grok Bot

When Grok Bot is the Provider, it runs every AI task. It serves the six kinds in `BOT_TASK_KINDS`: `digest`, `topic_overview`, `related_pick`, `proposals`, `topic_proposals` and `disagreement_proposals`. The X link read is built next to them (X links), and the repository's bot folder holds the Threadsift bot. One bot answers one Instance. The unverified parts are in [Open items and unverified claims](open-items-and-unverified-claims.md), under Grok Bot task runs.

The answer is asynchronous. The Instance sends a webhook, the bot reads the task over HTTP, and the bot posts the result back. [HTTP interfaces](http-interfaces.md) describes the three routes and their status codes.

### The Provider choice

- **Where it lives.** `grok-bot` is a row of `PROVIDERS` with no field, not a stored `settings.provider`. The flag `use_as_provider` on the `grok_bot_settings` row says Grok Bot is the Provider, and the `settings` row keeps the last real Provider the owner saved. `loadAiConfig` reads the flag, the settings row and the revision in one batch, and the routing and `runAiTask` use that one answer; the insert of a job's model task checks that the revision has not moved since (Start). When the flag is set and the Grok Bot settings are unusable, the kind's own path refuses before any task row, and the stored Provider does not run.
- **Choosing.** One guarded batch sets the flag and adds 1 to `ai_settings_revision`, because no trigger fires for `grok_bot_settings`. A job that read a model Provider before the choice and inserts its model task after it starts none, because the choice moves the revision that the insert checks (Start). The job then runs again at once without spending an attempt and takes the Grok Bot path. Saving any other Provider writes its `settings` row and clears the flag in one guarded batch. Deleting the Grok Bot settings is refused while the flag is set.
- **Switching away.** The batch that clears the flag fails every open Grok Bot task of the Provider with the refusal `abandoned` (an `x_intake` task is not one) and makes each job that waits on the bot due now, so the next sweep runs it on the new Provider. A late callback on an abandoned task gets 409, so an answer is never applied after a switch back. A job that read the flag before the switch and inserts its task after it starts none, because `botFace` adds the flag to the `holds` of every task a kind starts. The insert fails like a lost lease, and the job waits `FULL_CAP_DEFER_MS` and then runs on the new Provider.
- **Verify.** `verifyProvider` starts a `digest` task with the context `{ "verify": true }`, sends it, and waits for the answer for at most `VERIFY_WAIT_MS` (60 seconds). The Worker holds the request as wall time, which has no limit for an HTTP request while the client stays connected ([Workers limits, Duration](https://developers.cloudflare.com/workers/platform/limits/)). The task's own deadline is the window plus one send (`VERIFY_DEADLINE_MS`). A task that is still open when the window passes, or when the caller's request ends (which also ends the webhook send and the pause between two reads), fails `timeout` in a guarded write that loses to an answer stored first. The callback guard knows the task's credential, state and deadline, not the window, so an answer gets 409 once that write has committed or the deadline has passed.

### One declaration per kind

A result kind is one `defineAiKind` call, or `defineBasedAiKind` when the model path passes `prepare`'s `basis` to `publish`. `AiKindDeclaration` lists its fields. The framework runs one declaration on the model executor and on Grok Bot, so both apply the same `publish` and `current`.

- `prepare` returns the Context as a value of its schema. Grok Bot stores `JSON.stringify` of it in `ai_tasks.context` and parses it back through the schema when the answer arrives, so `publish` cannot read anything that Grok Bot lacks.
- `publish` receives which executor answered. `basis` exists only when `executor` is `model`: the Digest's catalog version and stale requeues, which Grok Bot never has because its answer arrives in a later attempt than the one that asked.
- `storedOutcome` builds the guard "current, and the task is running, and `also`", and puts it, the kind's writes and then the task completion in one batch, so no kind writes `ai_tasks`. A publisher that appends writes after them, such as `anchoredOutcome` for Highlight anchors, and the job close come after the completion.
- The X link read is a `defineBotOnlyKind` with no `publish`, because its own route answers it.
- `BOT_TASK_KINDS` is typed with `satisfies`, so a kind that is not declared is a compile error. `botKindOf` reads it for the result route, and `describerOf` adds the X link read for the task read.

### The send and the states

- **The send.** The webhook body is `{ taskId, kind, callbackToken }` for every kind (`WebhookBody`). No library text and no instructions travel in it, and it carries no address to call back, so a fetched page cannot send the credential elsewhere. The bot reads the task with `GET /api/ai-tasks/{id}`, which answers only to the task's callback credential and writes nothing. A failed send fails the task and throws. Delivery is at-least-once, so a retried send after a lost answer can wake the routine twice, and the first run's callback then finds a failed task (409).
- **Webhook answer.** 200 is `ok`, 401 and 403 are `wrong-key`, 404 is `not-found`, and any other status is `bot-error` (`resultOfStatus`).
- **One task per call.** Each webhook call carries one AI task (`sendBotTask`). Sending several in one call is not built, because it would change the task lifecycle that every kind shares. The bot of the live Worker used about 0.77 M tokens per task (estimate: 94 M tokens over 122 tasks, chat turns included).
- **Steps.** `stepOf` decides what each claim of a bot-owned job does, from the latest task of the job.

| Latest task | Step |
|---|---|
| None, or applied | `start`: build the task and send it. |
| Unsent, deadline not passed | `resend` with a new credential. |
| Sent, deadline not passed | `wait` until the deadline. |
| Unsent or sent, deadline passed | `expire`: fail the task `timeout`. |
| Answered | `apply`. |
| Failed with `provider-busy` and `answered_at` set | `charge`: count one attempt. |
| Failed otherwise | `start` again. |

- **Attempts.** `jobs.attempts` counts only the throws. A send the bot accepts defers the job with `countsAttempt: false`, so waiting and applying cost nothing. The worst case is three sends of one hour each, plus the stale resends that `MAX_STALE_REQUEUES` allows.
- **Apply.** The kind's `parse` rebuilds its Zod schema from the task's persisted `context` and checks the stored `result` once more. A task whose answer no longer fits fails `no-json` and throws. A guard that moved (a candidate deleted or given a new Digest between the send and the answer, say) writes nothing, fails the task `stale`, and requeues the job without an attempt. `failedAiTask` lets only `stale` and `no-json` fail a task that holds an answer, so a runner that lost its claim leaves an accepted answer alone. Only closing the job, saving another Provider and the sweep one day after the deadline fail an answered task, because nothing can apply the answer any more.
- **The result route.** `POST /api/ai-tasks/{id}/result` serves a task with the executor `grok-bot` and a kind in `BOT_TASK_KINDS`.
  - A result that fails the kind's schema or rules answers 400 with the reasons, and the task stays open for a second answer. The stored `result` is the schema's reading of the body, so keys the schema does not name are not stored.
  - The first accepted answer wins, and every repeat gets 409. The batch guard (`acceptsAnswer`) reads the state, the deadline against the database clock and the credential digest in SQL, so two simultaneous callbacks store one answer, and a request that authenticated before a resend cannot commit after it.
  - `{ error }` fails the task `provider-busy`, marks it with `answered_at`, logs only the task and job ids as `grok-bot-error`, and makes the job due. The next claim charges one attempt.
- **Guards per kind.** Each kind applies the guards of its model executors, except the Digest's catalog check, which only model executors run (`CatalogRule`). The Digest recomputes `pinnedCatalog` at apply and publishes whatever the catalog holds then. A Digest that names a new spelling of a name adds a near-duplicate, because a refusal would send the task again and cost another bot run, and the weekly check can suggest merging such a pair. A changed Item generation still fails the Digest `stale`, because the Digest then describes old text. The kind's `current` runs at apply and on every claim before the job resends, waits or expires. Every batch that moves the input of a waiting job makes that job due, and so does the deferral to the deadline when the input moved before it ([Jobs, leases and the schedule](jobs-leases-and-the-schedule.md#waiting-for-a-vendor)), so a job whose input moved does not wait out the hour for an answer to an old input.
- **Schema dialect.** The `schema` in the payload is JSON Schema 2020-12, which Zod 4 writes natively (`z.toJSONSchema` with `io: "output"`). Which dialect the bot accepts is unverified.
- **Deadline and caps.** A Grok Bot task gets one hour, because the bot wakes in seconds to tens of seconds by its own estimate. At most 10 tasks occupy the bot (`GROK_BOT_IN_FLIGHT`). A task occupies the bot while it is running, unanswered and before its deadline. xAI also limits webhook runs to 200 per hour for one routine and 300 per hour across the owner's routines ([Skills and routines](https://docs.x.ai/grok-bot/skills-routines-and-automations), read 2026-11-18). The cap is shared by every kind, so weekly runs wait for a place during an Import backlog.
- **Expiry.** `expireAiTasks` fails an unanswered task with no `job_id` at its deadline. It leaves an answered task and a task with a `job_id` alone until one day after the deadline, so an accepted answer is not erased while its job waits for a runner. After that day, the sweep fails any running task `timeout`. After three failed attempts, the Item or Topic shows the failure with Try again. A failed bot task writes no Log entry, because the Log lists committed changes.

### One overview task per Topic

`overviewAtBot` is true while another running `topic_overview` task for the Topic is answered or still before its deadline. The overview kind declares it twice.

- `defer` reads the Topic of the claimed Item before `prepare`. Grok Bot defers `topic-busy` for 15 seconds (`BUSY_RETRY_MS`) without an attempt while `overviewAtBot` is true.
- `holds` takes the Topic from the prepared Context and also states that the overview's inputs hold. The framework adds it and the Grok Bot flag to the `holds` of the task insert, so the insert names the Topic of the Context it stores, even when the Item moved to another Topic between the two reads.
- The model executor ignores both; its insert holds on the job's claim and the loaded settings revision instead (Start). The guard counts an unsent task too, because its job resends after a crash.
- When the task is applied, a deferred job reads fresh inputs and sends only if a coverage gap remains.

When the job gives up, `overviewGaveUp` writes `gave-up` for the Topic named in the context of the job's latest task, because its owner Item can move to another Topic before then. The marker is skipped when the Topic is gone or its page revision is newer than the one the task was sent with.

When supplied content or an X link answer closes the Item's jobs, `supersededTasks` fails every running task `stale`, because the input was replaced. The `answering` option of `closeItemJobs` names the task an X link answer completes, so the close leaves it running.

### X links

The X reader choice decides who reads a fresh X link. `grok-cli` uses the Grok CLI even when the webhook works. `auto` sends an `x_intake` task to the bot when its webhook is ready, while the Provider the owner picked writes the Digests. [Fetchers](fetchers.md) owns the X side: the reader choice, Replies kept and the check against X.

- **Kind.** `xIntakeKind` is not in `BOT_TASK_KINDS`, so the result route answers 400 `unsupported-task`. The bot answers at `POST /api/ai-tasks/{id}/intake`, and `describerOf` still lets the task read find the task. Its `inputs` hold the link and the status id only, no library text. `POST /api/items` takes no task id, so no callback can be an ordinary save.
- **Binding of an answer.** The route accepts an answer only while the task is running, unanswered and before its deadline, its fetch job is still open, and the Item's content generation still equals the task's `input_revision`, all in the guard of one batch. A save with content closes every open fetch job and the `x_verify` job and advances the generation, so an old answer cannot overwrite newer content. An answer that finds the guard moved stores nothing, fails the task `stale`, answers 409 and makes the bound job due. A repeat or a second run of the bot finds a completed task and gets 409. A deleted Item takes its task with it, so a late answer gets 401.
- **Outcome.** With `content`, one batch stores the selected thread, the Digest and an `x_verifications` row, queues the `x_verify` job, completes the task and closes the fetch job. With `unavailable`, the Item becomes a Link-only Item.
- **Refused answers.** A 400 of the intake route for a task that still takes an answer adds 1 to `ai_tasks.answer_refusals` and writes one `grok-bot-answer-refused` line. The line holds the task id, the Item id, the count and the Zod `code` and path of each issue, with keys the schema does not name shown as `*` and array indexes as `#`. It holds no Zod message, no key name the bot chose, no value and no credential. At `REFUSALS_BEFORE_RESEND` (2), the task's deadline moves to now and the owning job becomes due in the same batch, so the next claim fails the task `timeout`, counts the attempt, and sends a new task. A resend of the same task with a new credential sets the count back to 0.
- **Sends.** A full cap defers the fetch job 60 seconds without an attempt, so an Import of many X links does not fire every webhook at once. A failed send throws, so the runner retries after 30 seconds and 2 minutes, and the third failed send sets the Item `failed` with `gave-up`. A wrong key therefore burns three attempts in about 2.5 minutes, and the Settings Test finds it early. There is no fallback to the grok CLI after a failure. The Item note names the cause: `bot-timed-out` when the last task never answered before its deadline, and `bot-failed` otherwise.

## The task kinds

| Kind | Opened by | Input | Output allowance |
|---|---|---|---|
| `digest` | Paste, refresh, Try again | The Item, its candidate comments, the catalog | 2,048 plus the submitted id array, at most 8,192 |
| `topic_overview` | A Digest publication, a continuation, a Topic merge, Try again | The current overview and up to 40 uncovered Items | 8,192 |
| `related_pick` | A Digest publication | The source Item and up to 20 candidates | 4,096 |
| `proposals` | The weekly check | Pairs of Tags | 4,096 |
| `topic_proposals` | The weekly check | Pairs of Topics | 4,096 |
| `disagreement_proposals` | The weekly check | Pairs of Items of one Topic | 4,096 |

Every model prompt is capped at 14,000 UTF-8 bytes (`AI_INPUT_BYTES`), counted over the whole serialized text. The output allowances are `BASE_OUTPUT_TOKENS`, `MAX_OUTPUT_TOKENS` (8,192) and `AI_LIST_OUTPUT_TOKENS` (4,096). Claude Code takes no output allowance, and the app records no token usage from it.

### Measured Digest input budget

`digestPrompt` builds the whole user input, and the cap counts all of it, field names, brackets and escapes included.

- **Catalog.** The catalog gets up to 4,500 bytes, split equally between Topics and Tags, each list keeping its names with the most Items first. `CATALOG_NAME_LIMIT` bounds each `readCatalog` query from the per-list byte budget and the shortest valid encoded name, so the row limit never excludes a name that could fit.
- **Fill order.** The builder reserves the selected catalog and the Item with an empty post text and no comments. When that alone passes the cap, the Digest ends failed with no Provider call and one `digest-input-refused` log line. Linked text from a hop then takes up to one third of the room left (rounded down), and the rest splits between the post text and the comments as whole records in ascending `position`, a record that does not fit being skipped. Room that stays unused goes back to the linked text. An X Item with joined follow-ups (`threads.follow_ups` above 0) sends its joined post text whole when it fits. Sizes come from the serialised JSON, so an escape counts at its full length (a control character costs 6 bytes), and only a text value is ever shortened.
- **Candidates.** A Reddit or X Item sends its eligible comments (an X Item's replies) of the generation the attempt read (`commentCandidates`), never a `more` stub, and the linked page when the hop gave text (see One hop in [Fetchers](fetchers.md)). A parent can be missing from the list, and the instructions say its text must not be invented. Any other Source, and Verify, send none.
- **Result.** `digestStored` keeps only unique ids this attempt submitted (`submittedAmong`) and uses that one list for the stored Digest, the task result, the Kept flags and the search parts, all in the batch that publishes the Digest. A refresh leaves the last published selection until a replacement publishes. A Grok Bot Digest keeps the submitted ids in `ai_tasks.context`. Each attempt logs one `digest-comments-submitted` line with counts and no comment text.
- **Output allowance.** `maxOutputTokens` is 2,048 (`BASE_OUTPUT_TOKENS`) plus the bytes of the submitted id array as JSON, at most 8,192 (`MAX_OUTPUT_TOKENS`), because a full selection of long ids can need more than a fixed 2,048. Verify keeps 2,048.
- **Why 14,000 and 8,192.** The limits fit `@cf/meta/llama-3.3-70b-instruct-fp8-fast`, whose documented context is 24,000 tokens, under the upper bound of one token per byte. The whole prompt is at most 15,749 bytes (14,000 input, 1,044 instructions, 705 schema), and 15,749 + 8,192 = 23,941. Without the output cap, the densest input (201 ids of 32 characters with one-character bodies and an empty catalog) would reach 24,787. The cap costs no real selection, because the densest measured case used about 22 output tokens for each id, so 200 ids need about 4,400. Other models need their own measurement, and a Provider whose completion limit is under 8,192 would refuse a large allowance with its own error (unverified). Measure again when the prompt, the schema or the budget changes.
- **Disagreement inputs.** Five inputs of the weekly disagreement check (plain English, escape-heavy, CJK, emoji and Turkish), filled to within 14,000 bytes (12,806 to 13,838 bytes of input, 1,098 of instructions, 559 of schema), came to at most 19,591 tokens with the allowance at one token per byte. Claude Code (`claude-sonnet-5-5`, run on 2026-11-12) counted 6,490 to 12,121 input tokens for them and 55 output tokens each, because the inputs repeat one text and the model found no pair. That holds for Claude Code only and includes its own system prompt. The output side of a full answer of 10 pairs is not measured.

### The `topic_overview` task

The batch that publishes a Digest opens one `topic_overview` job for the Item's Topic (`openingOverview`), but only when a Provider is saved (`providerSet`: a `settings` row, or Grok Bot chosen). A caller-sent Digest therefore starts it on the configured Provider, and a library with no Provider starts none. The job waits for the Item's own `digest` job (`blockedBy`).

- **Input.** `preparedOverview` reads the current overview, up to 40 Items whose current Digest is not in `built_from` (`ADDED_READ_LIMIT`; the newest first, as many as fit `AI_INPUT_BYTES`, with up to 3 Key points each), and the removed Items (Items in `built_from` that left the Topic). When the first Item alone is over the budget, `fitted` drops its Key points from the last until it fits, so one valid Digest is never left out of every run.
- **Prune.** `overviewWithout` takes the removed ids out of the current overview first, with no model, so the model never sees a removed id. A run with no added Item that fits is that prune alone (`keptOutcome`), so a removal ends in a written overview even when the model would refuse. When the prune leaves no line, the write stores an empty `built_from`, so the remaining Items count as uncovered and the continuation opens a run that writes an overview from them.
- **Result.** The model returns `lines` (at most `OVERVIEW_LINES_MAX`, each a `text` of at most 300 characters with 1 to 5 `items` ids from the input) and `unchanged`. `overviewText` writes the stored text with the `[id]` marks. The schema refuses a line with brackets, braces, quotation marks, a line break, a control character or a lone surrogate, because a model once returned one free-text string with its own `JSON_OUTPUT{` fragment inside it.
- **Writing.** One guarded batch (`currentInputs`) commits only while the Topic still exists, the revision, the sent Items with their Digests and the removed ids are as read (a removed Item that the 200-id read did not return changes the count), and the AI task is still running. When any of that is out of date, nothing is written, the task fails `stale` and the job requeues over fresh inputs. A refusal is first checked against the same inputs, and when they are out of date the attempt is not spent. Any other refusal, and the last retry, stores the refusal as the failure marker and ends the job without an error. Both keep the earlier overview text.

#### Continuation

One run is one model call over one bounded batch. When the publication leaves Items uncovered or removed Items unhandled (`coverageGaps`) and a Provider is saved, the same batch that closes the job opens the next one (`continuingOverview`), owned by the Topic's lowest Item id. A backlog therefore ends without another Digest arriving, and the chain ends because every publication covers or drops at least one Item.

- A merge of two Topics makes the same attempt once for the kept Topic, and inserts a job only when the kept Topic has a coverage gap.
- Accept of an overview-gap Proposal starts one such run through `startOverview`, the same start as Try again (see Try again in the [library wiki](../wiki.md)).
- **Cost.** Covering N moved Items with valid Digests takes at least ceil(N / 40) successful model calls. A failed run writes the failure marker and does not continue, and a Provider removed mid-chain stops it, so the calls attempted, the calls that succeeded and whether coverage completed are three different numbers.

### The `related_pick` task

`digestWrites` opens one `related_pick` job for the Item after the Digest upsert, only when a Provider is saved, and the job waits for the Item's `digest` job. The same batch makes every job that waits on the Grok Bot for a Related Items pick, a Topic overview or a weekly check due, because a stored Digest can move their input. The [library wiki](../wiki.md) (Related Items) owns the candidates, the input and the writes.

- `relatedKind` sets `inputRevision` to the source's Digest task id. Its one guarded batch commits only while the Digest task ids of the source and of every sent candidate are current and the AI task is still running. Otherwise the task fails `stale` and the runner reruns the job with its stale backoff.
- The schema allows at most 5 reasons of 160 characters, so `AI_LIST_OUTPUT_TOKENS` is far above any valid answer.
- A pick sees only the Items that have a Digest when its Item's Digest lands, and there is no backfill. In a library seeded in one burst, the first Items to publish see fewer candidates, and an Item's set is not complete until its own next pick.

### The `proposals` task

`proposalsKind` is a `WeeklyRun` for `weeklyKind`. It reads the Tags that have at least one Item in pages of 1,000 by id (`usedSubjects`, because D1 caps one result at 50 MB) and every row of `tag_merge_proposals` in one query (`knownPairs`). [Proposals](../proposals.md) owns the claim, the store and the other weekly checks.

- **Candidate pairs.** `candidatePairs` finds pairs by two rules that the spec leaves open, so they are chosen here: the same loose key (letters and numbers only, one final `s` dropped when at least 3 characters remain, English only, so `machine-learning` meets `machine learning` and `llm` meets `llms`), and an initialism (`machine learning` and `ml`). Accents stay, because `catalogKey` keeps `café` and `cafe` apart on purpose. Both rules produce pairs for the model to judge, not merges: `c`, `c++` and `c#` meet under the first rule and are different things. No embeddings exist, so a semantic duplicate beyond the two rules is not found. A pair that has a row in any state is skipped.
- **Selection.** Pairs are ordered by the two Tags' combined Item count, most used first. `disjointPairs` takes a pair only when neither Tag is in a pair already taken, up to 20 (`MERGE_PAIRS_PER_RUN`). Disjoint pairs let the model return every pair it judges a match, so a sent pair it does not return is a real "no" and is stored as `declined`. A pair that is not sent keeps no row and stays eligible. With three spellings of one concept, one week sends one pair, and a later week sends the survivor and the third.
- **Input and storing.** No Item title, Summary, post text or comment is sent. A pair that does not fit `AI_INPUT_BYTES` is skipped and stays eligible. One guarded batch (`WeeklyRun.stored`, inside `storedOutcome`) inserts an `open` row for each merge and a `declined` row for every other sent pair, and skips a pair that gained a row meanwhile. A failed guard fails the task `stale` and requeues the job without an attempt. One run opens no continuation job, so a large first backlog clears over several weeks.
- **Budget.** A valid answer of 20 merges with 6-digit ids and 160-character reasons is about 4,050 bytes of JSON, under `AI_LIST_OUTPUT_TOKENS` at one token per byte. An answer padded with characters that JSON escapes can pass it, and a cut-off answer is a refusal that is not retried. Input, instructions, schema and allowance stay under the 24,000-token context of the model in Measured Digest input budget (19,519 at most, for five inputs filled to within 14,000 bytes).

### The `topic_proposals` task

`topicProposalsKind` is the same `weeklyKind` for the kind `topic-merge`. Its pairs are two Topics with up to 3 Tag names each, and it shares the input cap and the output allowance of the Tag run. A full answer of 20 merges with 160 CJK characters in each reason is 10,452 bytes, so it can pass the allowance (the token count of CJK text is not measured).

The `disagreement_proposals` task is the run of the kind `items-disagree` (`disagreementKind`, the same `weeklyKind`). [Proposals](../proposals.md) (The weekly disagreement check) owns its claim, input, result, store, cost and budget.
