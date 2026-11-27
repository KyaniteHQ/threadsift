# Security model

What an Instance protects, who can reach it, where content and credentials cross a boundary, and the scope of a security review: the assets it treats as critical, the attackers it defends against and the limits the owner accepts. A security review ranks its findings against this page. The page covers one Instance on either install target. Each control is described where it is built, and this page links there.

## What an Instance protects

1. **The library and its Export.** Saved links, post text, comments, images, Highlights, Notes, Digests and the wiki show what the owner reads. An Export holds every library record and file.
2. **Credentials and the owner's authority.** The owner's password, the session cookie, the setup code and the reset code, agent tokens and task callback credentials. The secrets saved in the database: Provider keys, the OpenRouter verifier, the Grok Bot webhook key, the GitHub token, the Vault mirror's token and the Reddit session cookie. The secret key of the Instance, which seals those. On the container, the sign-in state of the Claude Code, Codex and Grok CLIs, which the operator keeps on the host.
3. **The host and its private network.** A fetch that the Instance makes for a pasted link must not reach a service on the host or on its private network.
4. **Job capacity and the Provider's spend.** Each new Item costs fetch work and one Digest call.

## Who can reach an Instance

| Caller | What the caller reaches |
|---|---|
| Anyone on the network | The session check, the first-run setup, the sign-in and the password reset. Setup needs the setup code, which the container prints when the operator sets none. A reset works only while the operator sets a reset code. `/share` answers anyone with a redirect and saves nothing. |
| The owner's session | Every owner route and every scope route: the library, Settings, tokens, Export and Restore. `/share` saves only on a same-origin `POST` with the owner's session. The session does not reach `/mcp` or the task routes. |
| An agent token | The HTTP API and `/mcp`, inside the token's scopes. `read` sees private Item data and stored files, `add` saves links, `digest` queues a Digest or sends one, `delete` deletes Items, and `reddit` replaces or removes the stored Reddit session. A token can carry a Daily budget of new Items. A refresh of a known link does not count against it. |
| A task callback credential | The three Grok Bot task routes of its own task. |
| A site, a redirect or an integration | No route under its own identity. Its content, metadata and images enter the library, and later the model's input, when an allowed caller saves or imports a link. The Grok Bot returns through the task routes with the callback credential. OpenRouter Connect returns an authorization code through the owner's browser to an owner route. |
| The operator | The start-up configuration, the secrets, the stored data and the plug-ins of the Instance. |
| The upstream release pipeline | The published image and the release that an Instance installs. |

[Access](access-owner-login-agent-tokens-mcp.md) holds the rule of each route class, the cookie, the throttle, the codes, the Daily budget and the gate of `/mcp`. [HTTP interfaces](http-interfaces.md) holds the Web Share Target. [The spec](../spec.md#token-scopes) lists the scopes.

## Where content and credentials cross a boundary

- **Saved content reaches the owner's browser.** Post text and comments come from other people, and a Digest is model output that they drive. All of it stays untrusted after it is stored. The Reader renders Markdown without raw HTML, and the page's Content Security Policy allows scripts, images and connections from the Instance alone ([Web app](web-app.md#caching-and-headers)).
- **A link makes the Instance fetch.** A Paste, an Import, an Extension save and each redirect send the Instance to an address that someone else chose. Every built-in fetch of a pasted, linked or redirected address goes through one guard ([Fetchers](fetchers.md#private-addresses)). On the container the guard checks the addresses that the connection uses. On Cloudflare it checks literal addresses and `localhost` only, because a deployed Worker cannot reach the owner's network.
- **Some calls go to a fixed host with a credential and skip the guard.** They are the Reddit account's requests, the Provider calls, the send to the Grok Bot and the Vault mirror's GitHub calls.
- **A plug-in is the operator's code.** A container Instance loads the fetcher modules that `THREADSIFT_FETCHERS` names. A module runs with the rights of the Instance, and its own network calls skip the guard ([Fetchers](fetchers.md#plug-ins)).
- **The Extension sends what the owner's browser holds.** It keeps an agent token and sends the page captured in the owner's tab, so text that only the signed-in owner can see enters the library and the Provider's input ([Extension and Threadsift bot](extension-and-threadsift-bot.md#publishing-a-sent-page)). Connect Reddit reads the browser's Reddit session cookie and sends it to the Instance ([Extension and Threadsift bot](extension-and-threadsift-bot.md#connect-reddit)).
- **Saved content reaches the Provider.** A Digest, an overview and the other AI tasks send stored text to the Provider that the owner chose. On the container the owner may point an OpenAI-compatible Provider at a private address, and the Worker takes a public HTTPS address only ([AI tasks and Providers](ai-tasks-and-providers.md#providers-and-executors)). The container runs the Claude Code and Codex CLIs with no tools and a reduced environment, and Codex in a read-only sandbox ([AI tasks and Providers](ai-tasks-and-providers.md#cli-executors)). The send to the Grok Bot carries the saved webhook key, a task id and a callback credential, and the bot reads the rest through the task routes.
- **A pasted X link reaches xAI.** The Grok Bot or the Grok CLI reads the post. The Grok CLI is an agent with web tools, so a hostile post or reply can steer it ([Fetchers](fetchers.md#the-isolation-rule)).
- **Secrets rest sealed.** The Instance seals each secret saved in the database with its secret key, so a copy of the database alone does not open them ([Access](access-owner-login-agent-tokens-mcp.md#secrets-at-rest)).
- **An Export leaves the Instance, and a Restore enters it.** The zip holds all private library content and none of the Instance's credentials: no saved secret, no password hash, no session and no agent token hash. A Restore reads an uploaded zip from outside the Instance. Only the owner's session starts either one ([Export, backup and restore](export-backup-and-restore.md)).
- **The Vault mirror writes outside the Instance.** It copies the library as Markdown into a local folder on the container, or into a GitHub repository whose visibility the owner sets. It never imports the destination back ([Vault mirror](vault-mirror.md)).
- **The upstream pipeline publishes, and the operator deploys.** GitHub Actions build the image and the release. The operator installs an Instance and holds its secrets ([CI, releases and rollback](ci-releases-and-rollback.md)).

## The scope of a security review

A security review ranks a finding higher when it touches a critical asset and an attacker in scope reaches it.

- **Critical.** The library and its Export, the credentials and the owner's authority, and the host and its private network. The fourth asset, job capacity and the Provider's spend, is protected but not critical.
- **Attackers in scope.** An anonymous caller on the network, a caller who uses a stolen agent token or task callback credential, a caller who holds a stolen owner session or the owner's password, a hostile site, redirect or author of saved content, and a compromised integration. A compromised upstream release pipeline and a hostile or compromised operator are in scope too. The app cannot stop an operator who holds the secrets, the stored data and the host, so a review reports what such an operator or a bad release can do and names the findings that have no fix inside the app.
- **Accepted risk.** The owner accepts the limits under [Known limits](#known-limits) and no other risk.

## Known limits

Other sections record these limits, and the owner accepts each one.

- Anyone who reaches the sign-in can lock it for up to 1 hour ([Access](access-owner-login-agent-tokens-mcp.md#throttle)).
- A plug-in runs without isolation ([Fetchers](fetchers.md#deadline)).
- The Worker cannot check the address that a public name resolves to, and the local Worker has no name check ([Open items and unverified claims](open-items-and-unverified-claims.md#fetching-links)).
- The Daily budget does not bound refreshes, and two requests at the same moment can both pass, which exceeds the budget by the links of one request ([Access](access-owner-login-agent-tokens-mcp.md#daily-budget)).
- A hostile post or reply can make the Grok CLI open a public page, which sends public post text and the Grok account's saved rules to a page that the attacker chose. A Grok account kept for the Instance limits what leaves ([Fetchers](fetchers.md#the-isolation-rule)).
- The limit of 6 reply searches in the Grok CLI's prompt is a request to the model. The deadline and the 2 slots bound a run ([Fetchers](fetchers.md#grok-cli)).

## What this page does not settle

- **Exposure.** The README's container command publishes the port on `127.0.0.1` only. Whether an Instance sits behind a reverse proxy or a tunnel, and how that one is configured, is the operator's choice and outside the repository.
- **Enabled integrations.** Which Provider, which X reader and whether the Vault mirror is on differ for each Instance.
- **The hosted product.** It is not built. This page describes one owner on one Instance.
