# Store listing texts

The texts the owner enters in the Chrome Web Store Developer Dashboard and in the Firefox Add-ons Developer Hub when uploading the Extension. The repository's copy script wrote every text in a `text` block. Copy each block as it is.

Both stores take the name, the summary line and the version from the manifest in the zip, so this page holds none of them. The summary line is `manifestDescription` in the Extension's text module, and the manifest's `description` reads it.

## Both stores

### Detailed description

Chrome: Store listing, Detailed description. Firefox: Description.

```text
This extension saves the page in the current tab to your own Threadsift instance when you press its toolbar button. Because it reads the page in your tab, a page you are signed in to saves what you see. Each press saves one page, and the extension never crawls.

In a Reddit tab, it saves the post with its visible comments and, as far as Reddit’s request limit allows, the replies behind its "more" links.

Optional settings for Reddit:
- Fill saved Reddit items (off by default) saves the thread of a Reddit link already saved without its comments, when you open that thread in a tab. It never reads Reddit in the background.
- Connect Reddit (self-hosted instances only) sends your Reddit session to your own instance, so the instance can read Reddit threads for you.

The extension needs a running Threadsift instance and does nothing on its own. In the extension’s settings, enter the instance address (https, or http only for localhost or 127.0.0.1) and an agent token. Create the token under Agent tokens in Threadsift’s Settings with the Read and Add scopes.

Saved pages go only to the address you entered. The extension has no account with the developer, no analytics and no ads.

Threadsift is an open source reading library under the AGPL-3.0 licence. You run one instance yourself, in a container on your own server or on your own Cloudflare account.
Source: https://github.com/KyaniteHQ/threadsift
```

### Data disclosure

The privacy text of the Extension. Chrome asks for a privacy policy link on the Privacy practices tab, and Firefox takes a privacy policy on the listing.

```text
The extension sends data only to the Threadsift address you enter in its settings: your own Threadsift instance, on your own server or Cloudflare account. The developer runs no server for the extension and receives nothing. There are no analytics, ads or third parties. Nothing is sold or used for anything except saving to your library.

What the extension sends:
- Website content: When you press the toolbar button, the extension sends the page’s address, readable text and image addresses. In a Reddit tab, it sends the thread: the post and its comments as Reddit returns them, including the authors’ user names.
- Web browsing activity: While Fill saved Reddit items is on, each time you open a Reddit post or comment page, the extension sends its address to ask whether it is a saved link whose thread is missing. It reads and sends the thread only for such a link. With that setting off, it sends no address of a page you did not save.
- Authentication information: Each request includes the agent token you entered. With Connect Reddit, the extension sends the reddit_session cookie of reddit.com each time you connect or reconnect Reddit, and does not store it.

The extension reads nothing in the background. Outside a toolbar button press, it reads only a saved Reddit thread you open with Fill saved Reddit items on.

The extension stores the Threadsift address, agent token and Fill saved Reddit items setting in local extension storage in your browser. Removing the extension removes them.

What your instance does with saved data is under your own control. The instance is open source (https://github.com/KyaniteHQ/threadsift).
```

## Chrome Web Store, Privacy practices

### Single purpose description

```text
This extension saves the page in the current tab to your own Threadsift instance when you press its toolbar button. In a Reddit tab, it saves the post with its visible comments and, as far as Reddit’s request limit allows, the replies behind its "more" links.
```

### Permission justifications

The tab lists each permission of the manifest. `cookies` and the host permissions are optional permissions.

#### `activeTab`

```text
When the user activates the toolbar button, the extension reads the current tab once to save that page. It gets no access to other tabs, and no access to the current tab before that action.
```

#### `scripting`

```text
When activated, the extension runs its own script in the current tab to read its title, text, and image addresses for saving; in a Reddit tab, it requests thread data from reddit.com in the user’s session. Only on granted hosts, it registers a script on the Threadsift address (so its Settings can ask to reconnect Reddit) and, only if "Fill saved Reddit items" is on, on reddit.com (to save a thread when opening an item saved without comments). It runs no code from outside the extension.
```

#### `storage`

```text
The extension keeps the Threadsift address, the agent token, and whether "Fill saved Reddit items" is on in the browser’s local extension storage. It stores nothing else, and only its background worker reads the token.
```

#### `webRequest`

```text
The extension reads the browser’s network error for its own requests to the Threadsift address to report why saving could not reach it: address not found, connection refused or timed out, or no secure connection. The browser shows only requests to granted hosts (the Threadsift address and, when the user connects Reddit or turns on "Fill saved Reddit items", reddit.com), and the extension reads only errors from its own requests to that address. It does not block or change any request.
```

#### `cookies`

```text
The extension requests this optional permission only when the user selects Connect Reddit. Once granted, it reads only the reddit_session cookie on reddit.com and sends it to the user’s Threadsift address so their instance can read Reddit threads as them. It does not store the cookie or send it anywhere else, and selecting Disconnect removes the permission.
```

#### Host permissions

```text
All host permissions (https hosts, and http only on localhost and 127.0.0.1) are optional and grant no access at install. Because the user runs Threadsift on their own host, the Threadsift address can be any https host; when the user saves settings, the extension requests only that one host, and the browser’s prompt names it. It requests reddit.com only when the user connects Reddit or turns on "Fill saved Reddit items", and it removes every other host it holds.
```

### Remote code

Select "No, I am not using remote code". The Extension runs only the scripts in its zip.

### Data usage

Tick Website content, Web history and Authentication information. Web history covers the addresses of the Reddit threads the owner opens while Fill is on; the Firefox manifest declares only the first and the last in `data_collection_permissions`. Tick the three certifications: no sale or transfer of the data to third parties outside the approved uses, no use or transfer for purposes unrelated to the single purpose, and no use or transfer to determine creditworthiness or for lending.

## Firefox Add-ons

### Notes to reviewer

Upload the source archive that the package command writes, with the Firefox zip.

```text
WXT bundles the extension’s code without minifying or obfuscating it. The source upload is a git archive of the repository. SOURCE_CODE_REVIEW.md at its root gives the build environment (Node.js 26, pnpm 12.23.0), the commands and how to compare the build with the upload. It also explains the web-ext lint warnings from two libraries: DANGEROUS_EVAL from zod and UNSAFE_VAR_ASSIGNMENT from defuddle.

The extension needs a running Threadsift instance. The repository’s README shows how to run one in a container. Enter the instance’s address and an agent token with the Read and Add scopes in the extension’s settings.

The webRequest permission reads only network errors of the extension’s own requests to the Threadsift address. It blocks and changes nothing. The cookies permission is optional; only Connect Reddit asks for it. With it, the extension reads only reddit.com’s reddit_session cookie. All host permissions are optional. At Save settings, the extension asks for the one Threadsift host.
```
