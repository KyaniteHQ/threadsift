# Extension and Threadsift bot

The Extension and the Threadsift bot are two clients of the Instance's HTTP API. The Extension saves the page in the owner's own browser tab. The bot saves links from chat and answers AI tasks for the Grok Bot Provider. Neither has a private interface, because the OpenAPI document from `@hono/zod-openapi` is the contract of both.

Contents: [The Extension](#the-extension), [Publishing a sent page](#publishing-a-sent-page), [The Threadsift bot](#the-threadsift-bot), [Call deadlines](#call-deadlines).

## The Extension

WXT builds the Extension for desktop Chrome and Firefox (Manifest V3). The Firefox manifest sets `strict_min_version` to 140.0 for desktop and 142.0 for Android, the first versions with Firefox's built-in consent screen for the data the manifest declares ([Mozilla's guide](https://extensionworkshop.com/documentation/develop/firefox-builtin-data-consent/)), so an older Firefox refuses to install it. The Extension supports Firefox for desktop only. It posts to `POST /api/items` with an agent token, saves one page per click and never crawls. `pnpm run build:extension` builds both browsers. Defuddle is pinned in the workspace catalog to the version the server uses, so the browser and the server read a page alike.

### Load the build in Firefox

1. Run `pnpm run build:extension`.
2. In Firefox, open `about:debugging#/runtime/this-firefox` and choose **Load Temporary Add-on**.
3. Open the `manifest.json` in the `firefox-mv3` folder of WXT's output. Firefox removes the temporary Extension when it restarts ([Firefox Extension Workshop](https://extensionworkshop.com/documentation/develop/temporary-installation-in-firefox/)).

For an unattended load (the only written procedure for it), run these steps from the repository root:

1. Start `geckodriver --allow-system-access` and set `WEBDRIVER_URL` to its local HTTP address. The switch enables Firefox's privileged browser UI context ([geckodriver flags](https://firefox-source-docs.mozilla.org/testing/geckodriver/Flags.html#allow-system-access)).
2. Create a session. The preference lets a trusted click grant optional permissions during an unattended run. Leave out `args` to show a Firefox window.

   ```sh
   session_id=$(curl -fsS "$WEBDRIVER_URL/session" --json \
     '{"capabilities":{"alwaysMatch":{"browserName":"firefox","moz:firefoxOptions":{"args":["-headless"],"prefs":{"extensions.webextOptionalPermissionPrompts":false}}}}}' |
     jq -er '.value.sessionId')
   ```

3. Run `pnpm --filter threadsift-extension exec wxt zip -b firefox --mv3`, and set `extension_zip` to the absolute path of the Firefox ZIP that WXT prints.
4. Install the ZIP temporarily, and check that the returned ID equals the Gecko ID in the manifest.

   ```sh
   extension_id=$(jq -cn --arg path "$extension_zip" '{path: $path, temporary: true}' |
     curl -fsS "$WEBDRIVER_URL/session/$session_id/moz/addon/install" --json @- |
     jq -er '.value')
   test "$extension_id" = "$(unzip -p "$extension_zip" manifest.json | jq -er '.browser_specific_settings.gecko.id')"
   ```

5. End the session with `curl -fsS -X DELETE "$WEBDRIVER_URL/session/$session_id"`.

### Permissions

The manifest asks for `activeTab`, `scripting`, `storage` and `webRequest`. It lists `https` sites, and `http` on `localhost` and `127.0.0.1`, as optional host permissions, which grant nothing until the Extension asks. `cookies` is optional too. The Extension holds no `tabs` or all-sites permission. `activeTab` gives a press access to the current tab only.

- The settings page asks for the Instance's host when the owner saves it, so the browser's own prompt names the Instance. The page calls `permissions.request` from the click, with nothing awaited before it, because only that call needs a user gesture. It then sends the settings to the background worker, which outlives the page.
- `webRequest` lets the worker read why its own call to the Instance failed ([Why a call failed](#why-a-call-failed)). The browser shows its events only for hosts the Extension holds, which is the Instance's host and, with Fill or Connect Reddit, the Reddit hosts, and the worker reads only the events of requests its own call started. It sits in the fixed list, not among the optional permissions, because Chromium 156 delivered no `webRequest` event to a worker that was already running when the permission was granted, nor to the settings page, until the worker started again, so the check right after the grant had no cause (headed run on 2026-11-27, the grant clicked with `xdotool`). Neither browser prompts for it: Chrome lists no warning for it ([Chrome permissions list](https://developer.chrome.com/docs/extensions/reference/permissions-list)), and Firefox has no permission message for it ([`extensionPermissions.ftl`](https://github.com/mozilla-firefox/firefox/blob/7e1febaf8b087ea08a5099e86ab66dce697d01f3/toolkit/locales/en-US/toolkit/global/extensionPermissions.ftl)), so an update that adds it asks nothing. The reason for a store reviewer: "Reads the browser's network error for the extension's own requests to the user's Threadsift address, so the extension can say why a save could not reach it: the address was not found, the connection was refused or timed out, or no secure connection could be made. The browser shows the extension only requests to the hosts the user granted, which is the Threadsift address and, when the user connects Reddit, reddit.com, and the extension reads only the errors of its own requests to the Threadsift address."
- After it writes the settings, the worker removes every optional host except the Instance's host and, when Fill is on or `cookies` is held, the Reddit hosts. It never removes a host the manifest requires. The same reconcile runs after a failed write, after a Fill change and on `runtime.onStartup` and `runtime.onInstalled`. A Save cut short between the grant and the page's message leaves its new host granted until the next browser start or extension update.
- A worker start only settles Fill and syncs the content scripts, and `permissions.onAdded` only syncs the scripts. A reconcile there would remove a host just granted, because the grant wakes a stopped worker before the page's message arrives.
- Saves and Fill changes from several tabs run one after the other in the worker, each from the settings read at that moment. A match pattern holds no port, so a grant covers every port on the Instance's host.
- Fill requests `https://*.reddit.com/*` from the Turn on click and removes it on Turn off unless a Connect grant still needs it. Before a Reddit grant, the Extension reads Reddit only when a Save runs in a Reddit tab, under `activeTab`.

### Token and calls

The address and the agent token sit in `storage.local`. Only the background worker reads and sends the token (`credentials`). The popup and the capture script never see it, and the settings page gets only the address and whether a token exists. A save without a typed token keeps the stored one only for the same address: for another address both the page and the worker's write refuse it and ask for that address's token, so the stored token never reaches a new host. The address must be `https:`, or `http:` on `localhost` or `127.0.0.1`. Every call refuses redirects and ends after 25 s (`INSTANCE_CALL_DEADLINE_MS`), under the 30 s after which Chrome may stop a worker whose `fetch()` has no response yet. The address check follows no redirect either, and reads one as an answer that is not from an Instance.

### Check the address at Save settings

The worker answers a Save with the result of a check. After it writes the settings, it reads the address and agent token it just stored, leaves the queue that settings changes use, and sends one `GET /api/scopes` with them. Until the answer arrives, up to 26 s later (`INSTANCE_CALL_DEADLINE_MS` plus `ERROR_EVENT_WAIT_MS`), the page shows "Saving…". It then shows "Settings saved" with one result.

| Answer | Result |
|---|---|
| 200 with `scopes` that hold `read` and `add` | The address and the token work |
| 200 with fewer scopes, or 403 with the text of `lacksScope("read")` | The token lacks the Read and Add scopes |
| 401 with `UNKNOWN_TOKEN` as its `error` | The token was refused |
| 404 with `NOT_FOUND` as its `error` | An Instance older than the route answered; update it |
| A redirect, another status or body, or a body that is not JSON | The address is not a Threadsift Instance |
| 500 or above, a body read that fails, or no answer from the worker | The check did not finish |
| A body read that runs past the 25 s deadline | The address did not answer in time |
| No answer from the address | The cause from [Why a call failed](#why-a-call-failed), or "couldn't connect" without one |

- The fields keep what the owner typed unless the check found that everything works. When the owner edits a field while the check runs, the page says the result no longer matches the fields and changes neither field.
- The page reads the Reddit account state again only after a result of works or scope-refused. After any other result it hides the Reddit section, because the read would fail the same way and show a second, general text.
- When the browser could not remove the access to the previous address, the result is followed by a sentence that says so. A write that failed shows the existing not-saved texts and runs no check.
- Focus returns to the control that had it when the page lost it during the save.

### Why a call failed

`fetch` throws the same `TypeError: Failed to fetch` for every network failure, so the worker reads the cause from `webRequest` events ([Chrome `webRequest`](https://developer.chrome.com/docs/extensions/reference/api/webRequest), [MDN `webRequest.onErrorOccurred`](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/webRequest/onErrorOccurred)). During each call it listens to the Instance's host. `onBeforeRequest` records each request with the call's address and method and no tab (`tabId` -1, the worker's own requests), and `onErrorOccurred` counts only an event with one of those request ids, so an aborted request of an earlier call is not read. When two such requests start during one call, the cause is unknown. Chromium 156 sends the error event after the `fetch` rejection, a fraction of a millisecond later in a run on 2026-11-27, so the worker waits for it at most 1 s (`ERROR_EVENT_WAIT_MS`). A listener the browser refuses leaves the call without a cause.

| Browser | Error text | Cause |
|---|---|---|
| Chromium | `net::ERR_NAME_NOT_RESOLVED`, `net::ERR_NAME_RESOLUTION_FAILED` | The name was not found |
| Chromium | `net::ERR_CONNECTION_REFUSED` | The connection was refused |
| Chromium | `net::ERR_TIMED_OUT`, `net::ERR_CONNECTION_TIMED_OUT` | The call timed out |
| Chromium | `net::ERR_CERT_*`, `net::ERR_SSL_*` | No secure connection |
| Firefox | `NS_ERROR_UNKNOWN_HOST` | The name was not found |
| Firefox | `NS_ERROR_CONNECTION_REFUSED` | The connection was refused |
| Firefox | `NS_ERROR_NET_TIMEOUT` | The call timed out |
| Firefox | Any other text that does not start with `NS_` | No secure connection |
| Both | The 25 s deadline | The call timed out |

Firefox reports every failure of its security library, a refused certificate and a TLS handshake that fails alike, with that library's localized message, such as "The certificate is not trusted because it is self-signed." or "SSL received a record that exceeded the maximum permissible length.", and every other failure with an `NS_` error name ([`ChannelWrapper::GetErrorString`](https://github.com/mozilla-firefox/firefox/blob/7e1febaf8b087ea08a5099e86ab66dce697d01f3/toolkit/components/extensions/webrequest/ChannelWrapper.cpp#L1164)), so the texts for that cause name a secure connection and not only the certificate. The build picks the table of its browser (`import.meta.env.FIREFOX`). Both browsers' docs say the error text can change between releases. Any other text, an empty one, or no event gives no cause, and the general text stays. The popup names the cause after a failed save, and the settings page after a failed check.

### Save a page

One press of the toolbar action reads the active tab and posts `{url, page}`. The server never fetches such a page.

- The worker injects `capture.js`, an unlisted script, into the active tab. It runs Defuddle on the live document, so text a page script added is included. The worker posts the capture only when the address the script read names the page the Save started on: both addresses keep their own origin, path and query fields in order, and only the hash, one trailing slash of the path and the tracking parameters that `isTrackingParam` names are ignored, so a page that adds one of those itself does not matter, while a second trailing slash or an empty query field names another page. The compare does not use `parseLink`, because the `normalizedUrl` of an Item also drops `www.` and folds every address of one Reddit post into one, and those addresses can serve another document. When the tab holds another page by then, such as another thread of the same site opened during a Reddit read, nothing is sent and the popup says `failed`. It replaces `<video>`, `<audio>` and `<iframe>` with links. It sets each extracted image's `src` to the `currentSrc` the browser selected and drops `srcset`, `sizes`, `<picture>` sources and lazy-load attributes, because Defuddle's Markdown otherwise picks the largest `srcset` width. Shadow DOM and iframe content are not captured.
- A port that closes before an answer shows the failed state (`SaveState`). The worker marks the toolbar button when a save outlives its popup, unless a newer save started, and each new save clears the mark. Opening the popup saves the page again, so a stored last result would have nothing to show.
- The Extension saves with an agent token, so its saves draw on the token's daily budget ([Access](access-owner-login-agent-tokens-mcp.md), Daily budget). A 429 with `code: budget-spent` shows the `budget-spent` state, and saving works again after 00:00 UTC or when the owner raises the budget in Settings.
- A state that the same page would reach again on every try offers no Try again: `too-large`, `private-link` and `unsupported-link`. `thread-kept` and `budget-spent` offer none either, because their own text says what changes the answer. `page-blocked` keeps it, because the Extension cannot tell a page the browser protects from a capture that failed once. That state covers three causes: a tab whose address is not http or https, a browser that refuses the script, and a script that returns no usable result. A page with no readable text is not one of them, because its empty capture is sent and saved.
- Its texts live in one module, written with the repository's copy script ([Changing code](../agents/changing-code.md), Interface text). The build writes the popup's and the settings page's `<title>` from that module, and the HTML files hold none, because WXT 0.21 takes the toolbar button's title from the popup's `<title>` over the one the manifest config sets.

### Save a Reddit thread

On Save in a tab on a Reddit post or comment, the worker asks the tab for `<thread>/.json?limit=500&raw_json=1` through `scripting.executeScript` with a function that calls `fetch`, so the request carries the tab's Reddit session. It then fills the replies behind each `more` stub and posts everything in one request: `{url, content: [thread, ...permalink answers]}`.

```text
tab .json request
      |
      v
hiddenRepliesOf: ids behind each `more` stub
      |
      v
one request per id at /comments/<post>/_/<id>.json  (500 ms apart, 150 s in all)
      |
      v
POST /api/items {url, content: [thread, ...answers]}
```

- The worker requests each hidden id at `/comments/<post>/_/<id>.json?limit=500&raw_json=1`, because `/api/morechildren` answered 403 to the signed-in session.
- The pace is 500 ms between request starts and 150 s (`THREAD_READ_DEADLINE_MS`) for the permalink requests after the first `.json` request, which has 15 s of its own (`REQUEST_DEADLINE_MS`). The measured 677-comment thread needed 67 permalink requests ([Decisions and evidence](decisions-and-evidence.md), Reddit).
- Reddit allows 100 requests per window of about 600 s (inferred from the `x-ratelimit-reset` values) and refuses the 101st with HTTP 429. A `RequestWindow` counts every request of the fill, the thread's own included, and keeps the last count that Reddit's `x-ratelimit-remaining` header reported. Without a readable header, each answer takes 1 off the count, and the fixed cap `REDDIT_WINDOW_REQUESTS` applies. The fill stops before the request Reddit would refuse and at the first 429, which also covers another `.json` request that used the window, such as a second thread saved within 10 minutes. The server runs the same loop for the connected account ([Fetchers](fetchers.md#connected-account)).
- Any other failed request is not retried and leaves its stub. No request starts once the 150 s are used, and each request's 15 s timeout is cut to the time left.
- A request that fails inside the page, such as a network error or a 429, is not a rejection and leaves its stub as above.
- When the browser rejects an injection into the tab (the tab closed, or moved to a host the Extension holds no permission for) or the injection returns no usable result, the thread read stops and nothing of it is sent. The worker console then shows `tab-read-failed` with the error's class name only, because the browser's rejection text can carry the tab's address.
- After such a stop a Fill sends nothing. A Save tries the page capture: the popup says `page-blocked` when the tab rejects it or it returns no usable result, `failed` when the tab holds another page, and otherwise it saves the page, as the page fallback below says.
- The thread is saved with what the fill read. When stubs are left (including stubs with no id to request and stubs whose permalink answer was empty), the popup says `saved-incomplete` instead of "Saved", without naming a cause.
- The injected function stops reading an answer at 4 MiB (`THREAD_CONTENT_BYTES`, by `Content-Length` or by the stream) and returns no answer, so an oversize answer is never transferred to the worker or parsed. The server enforces the same limit in `paste` (413). The fill stops asking once its answers pass 8 MiB in characters, a lower bound of their bytes. Then the worker measures the UTF-8 length of the body and drops trailing answers until it is at most 8 MiB (`ITEM_REQUEST_BYTES`). It runs whenever the tab's own `.json` request succeeds, signed in or not. The stubs of dropped answers stay stubs, which the Reader shows as Context stubs that say they were not saved. A first answer that does not fit alone sends the page fallback.
- When the thread's own `.json` request fails, its answer is not a thread of the post in the link, or the answers read cannot be assembled into one thread (Reddit changed the thread between two reads, so a comment id repeats or a reply fits no stub), the worker injects `capture.js` and posts `{url, page}`. The popup says `saved-page`. For a Reddit link the script takes the title from Defuddle's Reddit extractor, because the page's `<title>` ends in the community name (unverified, see [Open items and unverified claims](open-items-and-unverified-claims.md)).
- `readInTab` reads the response body with a stream reader and not a `TransformStream`, because Firefox throws `Permission denied to access property "flush"` at `new TransformStream` in the isolated script world.

### Connect Reddit

Self-hosted builds only. The popup (after a save that left the account expired), the Extension's settings page and the Instance's Settings page offer one click that connects the owner's Reddit account ([Connect a Reddit account](../guides/reddit-account.md)).

- The `reddit-account` module is the only code that touches the cookie. The worker reads `reddit_session` with `cookies.getAll` and sends it as `{session}` in `PUT /api/reddit-account` with the agent token, which needs the `reddit` scope. The value lives in one local variable of the worker: it is not stored, logged, returned to a page or sent to a content script. The worker sends only to the saved Instance origin.
- `cookies` is optional. The settings page requests `cookies` and the Reddit hosts in one `permissions.request` from the click, and the worker does the rest. The worker answers `no-access` and sends nothing when the browser holds no `cookies` permission or no permission for the Instance's host.
- The network calls run outside the queue that settings changes use, so a slow Instance never delays a Save or a Fill change. Connect and Disconnect run one at a time in a queue of their own, whichever surface asks, so a Disconnect from one page cannot overlap a Reconnect from another and leave the Instance and the `cookies` permission disagreeing.
- The settings page offers Disconnect in every state while the browser holds `cookies`, and hides the Reddit section only when the Instance answers `unavailable` and the browser holds no `cookies`. Disconnect removes the `cookies` permission when the Instance answers `none` or `missing`, or when no Instance is saved. Any other answer keeps the permission and shows the state. When the read that opens the settings page answers `failed`, the page shows it as a failed read, apart from a failed Connect or Disconnect, because a read changes nothing while a write without a usable answer may have landed.
- A cookie found in no store is `signed-out`, and more than one cookie of that name is `failed`, because the worker cannot know which one is the session. A cookie in a container tab or a private window has its own store and counts as `signed-out`. Both browsers return the `HttpOnly` cookie to `cookies.getAll`. Chrome throws on the `firstPartyDomain` property, so the Chrome build omits it. Firefox needs it only with `privacy.firstparty.isolate` on, so the Firefox build passes `null`.
- The Reddit section and the Fill view show the answer of the newest request they made and ignore an older answer that arrives first. A refresh asked while a button's request runs waits for it.
- The popup reads the account state only after a save that leaves it unknown. It sends no read after `not-configured`, `access-missing`, `token-refused` or a save that reached no Instance (`unreachable` and the causes of [Why a call failed](#why-a-call-failed)), because the read would end the same way: the Extension has no address or no access, or the Instance did not answer or refused the token. A `scope-refused` save still reads, because the token may hold the `read` scope. The Try again button does the same after each save it starts, and it first hides the account block and drops the answer of any read still running, unless a Reconnect is running. The popup shows only the answer of its newest read: Reconnect for `expired`, and nothing for any other state. The settings page reads the state again when the browser grants or removes a permission, so a grant made in another tab shows in every open settings page.
- A Reddit grant that Connect makes does not turn Fill on. The worker stores `false` the first time the Extension runs without a flag, and when a stored `true` has lost its grant, so a later Connect cannot resume a Fill that the settings page showed as off. It settles Fill at every start, because withholding the Reddit host on the browser's extension page while the Extension is disabled sends no `permissions.onRemoved`, and enabling the Extension starts the worker.

#### The Instance's Settings relay

The relay lets the Instance's Settings page ask the Extension to reconnect.

```text
Settings page                relay content script            worker
     |  {threadsift:"reconnect-reddit", id}  |                    |
     |-------------------------------------->|  port: reddit      |
     |  {threadsift:"reddit-working", id}    |------------------->|
     |<--------------------------------------|   accepted         |
     |  {threadsift:"reddit-state", id, state}                    |
     |<--------------------------------------| result             |
```

- The page posts the first message with `window.postMessage`, where `id` is a new UUID. The content script accepts only a message from its own window, with the page's own origin and exactly those two fields. It posts `reddit-working` once the worker has accepted, and `reddit-state` at the end. The worker accepts the relay port only from the top frame of a page whose origin is the saved Instance origin.
- The page waits 3 s (`RELAY_PRESENCE_MS`) for the first answer, then up to 35 s (`RELAY_RESULT_MS`), ignores a message with another `id`, and reads the account state again whatever the answer. The constants sit 5 s apart in order: `INSTANCE_CALL_DEADLINE_MS` (25 s, one Extension call), `REDDIT_DEADLINE_MS` (30 s, when the relay script disconnects the port and answers `failed`) and `RELAY_RESULT_MS`.
- The worker drops a port whose `sender.id` is not the Extension's, and accepts the `save`, `config`, `settings` and `reddit` ports only from the Extension's own pages, because the Fill and relay content scripts pass the `sender.id` check too.
- The worker registers the relay script with `scripting.registerContentScripts` for the Instance's host, like `fill.js`. The relay script carries no zod, because a bundled zod adds a `DANGEROUS_EVAL` warning to `web-ext lint`, so it checks messages with the relay contract module, which imports only constants.

### Fill when opened

Fill saves the thread of a Link-only Reddit Item when the owner opens it in a tab. It does nothing in the background. The owner opts in once on the settings page (Fill saved Reddit items), where Turn on asks the browser for `https://*.reddit.com/*`, one of the optional host permissions the manifest lists.

- The opt-in is the grant plus the `fill` flag that the worker stores on Turn on and Turn off. The page reads both through the worker, so a revoke in the browser's own settings turns filling off.
- The worker registers `fill.js` for every page of `reddit.com` and its subdomains when the Reddit host permission is held and the `fill` flag is on, and removes it when either is missing (at every worker start and on `permissions.onAdded` and `onRemoved`, because registered scripts are cleared when the extension updates). `fill.js` is an unlisted script and not a WXT `registration: "runtime"` content script, because WXT 0.21.5 adds the `matches` of such a script to the manifest's `host_permissions`, which would grant Reddit at install. The match covers the whole site, because a feed does not match a thread pattern and no script would be there to see the navigation.
- The script opens one `fill` port when the page's address is a Reddit post or comment, at load and on each `currententrychange` of the Navigation API, which fires for History API navigations, so a thread opened from a feed fills too.
- The worker takes the tab's address from the port's `sender.tab.url` and not `sender.url`, which keeps the address the document loaded with. It checks the Instance and Reddit permissions again, asks `GET /api/items?url=<thread link>` and goes on only when an Item has `fillable: true`. It then reads the thread and sends `{url, content, fill: true}` with the same `send` as Save, with the body already fitted to 8 MiB. There is no page fallback, because a page leaves no thread header and the Item would fill again at every visit. One fill per link runs at a time in the worker, and the server decides the rest.
- Turn off aborts every running fill. Each checks its signal after the Item lookup, before each permalink read and before it sends, so an answer read before the revoke is not sent. The abort reaches the injected `fetch` in the tab through a window event named by a per-request token. The cancel can queue behind its read when the page's thread is busy, the document has not reached `document_idle`, or the read injection is still on its way. Then the read starts its `fetch` and the cancel aborts it right after, so at most one request per running fill can still leave after Turn off, and the worker drops its answer.
- A fill puts its controller in `filling` before it reads the `fill` flag, and a settings change stores the flag before it cancels fills, so a fill that starts during Turn off either sees the flag off or is cancelled.

#### `fillable`

Every Item view carries `fillable` (`FILLABLE_COLUMNS`). It is true for a Reddit post or comment that has no `threads` row for any generation, and false for a thread whose Digest never published. The Reader shows `FILL_NOTE` above the empty text of a `fillable` Item that is not `processing`.

#### `fill: true`

`POST /api/items` takes `fill` with `content` only (400 otherwise). It saves the thread only while an Item with this normalized URL exists and has no thread header (`awaitsThread`). The check is part of the guard of the batch that writes the thread (`commit`), so two fills sent together save once, and an Item that was filled or deleted meanwhile is not written. The answer is 409 `fill: no Item with this link is waiting for its thread` and nothing changes. A guard that fails for this reason is not rebuilt and retried, which would never end.

## Publishing a sent page

`POST /api/items` takes `page` as an alternative to `content`. Both together answer 400.

- An X or GitHub link, a short link (`isShortLink`), a Reddit share link (`isRedditShareLink`), a Reddit link that is not a post or comment, and a link `isRefusedLink` refuses never take a page (400), because the Item's identity is the address such a link leads to and a page save resolves nothing. The caller sends the page at that address, or sends the short link alone, which a Paste resolves and records as a Short-link alias ([Short-link aliases](data-model-outline.md#short-link-aliases)). An X link takes its post and replies as `content` instead ([Fetchers](fetchers.md#supplied-x-thread)).
- A Reddit post or comment link takes a page as the Extension's fallback unless the Item holds a saved thread, and stays a Reddit Item ([Fetchers](fetchers.md#supplied-page)).
- A `page` whose JSON is over 1,000,000 bytes answers 413 and changes nothing, under the same D1 row limit as Large text.
- The server stores the page on the Item's fetch job (`jobs.page`), and the job runs the article publication path with the page in place of a network read. So the Article or Other rule, the 100-word minimum, the images, the Highlight anchoring and the Digest are the ones a fetched page gets. A save of a link the Item already has refreshes it through the same path.
- The save closes the Item's open `fetch` and `x_verify` jobs and deletes its `x_verifications` row in the same batch, so a fetch that was running loses its claim and cannot overwrite the page.

## The Threadsift bot

The bot's files live in the bot folder and call the same HTTP API and the AI task callbacks.

### Files

A template carries skills as text and no other file, so the bot folder holds one skill (`SKILL.md`) and plain files that the skill's bootstrap line installs into the `threadsift` folder of the bot's home directory.

- The bot loads the skill on every webhook wake, and on another chat turn only when its description matches, so it stays short.
- A template has one profile field, which the host uses for the marketplace card, the share page and the imported bot's profile. The profile file is one description of one or two sentences that names the boundary, and the skill holds the full rules.
- A template can carry a routine: on 2026-11-26 the template details of a shared Bot listed its webhook routine with the routine's instruction. Whether it keeps a scheduled routine's schedule is not verified. The Threadsift bot's template carries none, so setup creates the two routines from the routine files in the bot folder.
- The skill pins the hash of `SHA256SUMS` and the release tag (`TAG=` and `SUMS_SHA256=` in its bootstrap line) and is not listed in `SHA256SUMS`, because each would then depend on the other. An update trusts the new `SKILL.md` through HTTPS and the tag only.

### Webhook tasks

The webhook body comes from outside, so no value of it becomes a shell word. The bot has no tool that writes a file without the shell, so the agent runs `mark` (it prints a fresh `TS_` and 32 random hex characters) and writes the body with `write event-<hex1>.json <<'TS_<hex1>'`, a heredoc whose delimiter is that word in single quotes.

- `task-open` parses the file it made with `python3 -I` and checks `taskId`, `callbackToken` and `kind` against fixed patterns: a task id is 1 to 16 digits with no leading zero, and a callback token is 1 to 64 letters, digits, `_` or `-` (the Instance issues `tst_` and 43 characters). It answers `already-done` for a task done with that credential and `already-open` for a task whose `task.json` is under an hour old and has no `done`. It then asks `GET /api/ai-tasks/{id}` with the event's credential, and only when the Instance answers ok makes the task's folder (named by its id), so a refused credential leaves an open task's files as they were.
- An `x_intake` task is answered with the thread and a Digest through `task-answer`, which posts to the intake route. The other kinds are answered with a JSON value that fits `schema`, posted to the result route. The server refuses an answer that does not fit with 400 and the reasons, which go to `errors.txt`.

### The script

The bot's script reads the Instance address from `THREADSIFT_URL` and the agent token from `THREADSIFT_AGENT_TOKEN`, builds every address from them and sends with `curl --disable` (no `.curlrc`) and `--max-redirs 0`.

- A link, a query and an answer come from a file that `write` made, and every file argument has to resolve inside the `tmp` folder. The script deletes each file argument when it ends. `write` takes a name that matches `^[a-z][a-z0-9-]{0,31}-[0-9a-f]{32}\.(json|txt)$`, so `search.json` and `topics.json` can never be written, and at most 8 MiB in total, which protects the disk.
- `save` prints `ok <id> <path>` with no host, because Grok hides any tool output that holds the value of a stored secret, and `THREADSIFT_URL` is one. Each call prints one line that starts with a status word, and `word_of` is the one table that maps a status to a word. An `ok` answer to a `GET` or to `bookmarks-send` whose body is not the JSON the command expects prints `failed`. A 5xx answer prints `failed`.
- `THREADSIFT_URL` stays a secret card, because a card is how the bot's shell receives a value. It is a public address, because the bot runs in Grok's cloud and reaches the Instance only there. The skill joins the path to the Instance URL that setup keeps as a memory, which is not secret. Setup asks the owner to type the address in chat, because a card's value is for the script only. The owner enters the address twice, so the skill runs `same-address` on the memory before each link, links only after `ok`, asks for the right address on `differs`, and asks for it when the memory is missing or holds a note. The update instructions ask for a missing memory too.
- The task credential comes from the `token` file of the task's folder, goes to curl through a file descriptor and is in no command line and no output. After `ok` or `closed` the script writes `done` in the task folder, holding the sha256 of the task's credential, and deletes `token`. A repeated webhook for the same send stops there, and a new send of the same task id, which has a new credential, does not.
- The Grok Bot's shell tool hands a command to `bash -c` on a file descriptor, so no heredoc body shows in a process command line there. A harness that passes the command in argv would expose the event body for the length of the call. On 2026-11-25 single shell calls of 1,000, 3,000, 10,000, 20,000 and 40,000 characters each stored the whole text in a test bot ([the bot README](../../bot/README.md)), and an earlier test saw a call of about 20,000 characters arrive with no command, twice. The skill limits a `write` or `append` call to 20,000 characters, half of the largest size that worked, and starts a file again when a call prints nothing. The bot reads at most the first 100 replies of an X post, where the intake route takes up to 500.
- A heredoc whose delimiter is unquoted or not fresh runs the text as shell before the script starts, so the quoting and the fresh word are the only guard. The script checks everything after it, and a check that fails ends `bad-input`.
- The script needs `python3` and `curl` on the bot's computer. The setup instructions check for both.

### Release

The bot release script, run as `tools/bot-release.sh [refresh|release|check]`, has three modes:

- `refresh` (the default) refreshes `SHA256SUMS` and the hash pinned in `SKILL.md` after an edit of a hashed file.
- `release` bumps `VERSION`, sets the tag `bot-v<VERSION>`, refreshes, and turns the `## Unreleased` heading of the changelog into `## bot-v<VERSION>` under a new empty one.
- `check` verifies both.

Once the tag in `SKILL.md` exists in the repository (`check` and `refresh` fetch it from `origin` when it is not there), `refresh` refuses to run after a change to a hashed file, and `check` fails when the pinned hash differs from `SHA256SUMS` at that tag, because the bootstrap line fetches `SHA256SUMS` at the tag and could never match. A tag that `git ls-remote --exit-code` reports as missing on `origin` (exit status 2) counts as not released yet. A lookup that fails for another reason, such as no network or no `origin`, makes `check` and `refresh` print the reason and exit with status 1, because neither can tell whether the release exists. A change to a hashed file after a release goes through `release`. The update instructions find the newest release from the tags that start with `bot-v` (`GET /repos/KyaniteHQ/threadsift/git/matching-refs/tags/bot-v`), so no GitHub Release object is needed.

### Keeping the files true

The format has no typed link between the bot and the API. The bot tests are the link, because they compare the script, the skill and the bot files with the OpenAPI document and the server's schemas, and run the script against a real Instance. The devenv shell provides the `python3` and `curl` they need, and [Testing](../testing.md) allows the listener on `127.0.0.1`. The release test runs `check` on the repository, so the gate fails when a change leaves `SHA256SUMS` or the pin out of date.

## Call deadlines

The bot's script sends every call to the Instance with `curl --max-time 60`. The Extension gives every call `INSTANCE_CALL_DEADLINE_MS` (25 s), and `send` uses it for `POST /api/items`. Neither takes the deadline of the web app's Paste (`PASTE_DEADLINE_MS`), which covers a short link that the Instance resolves inside the request.

- An `add` of a slow short link can end as failed while the Paste still lands on the Instance. A repeat of the `add` only refreshes the Item, because pasting a known link again refreshes it ([Spec](../spec.md), Duplicates).
- The Extension sends the text of a page or a thread, so its request resolves no short link.
