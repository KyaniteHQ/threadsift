# Store listing texts

The texts the owner enters in the Chrome Web Store Developer Dashboard and in the Firefox Add-ons Developer Hub when uploading the Extension. The repository's copy script wrote every text in a `text` block. Copy each block as it is.

Both stores take the name, the summary line and the version from the manifest in the zip, so this page holds none of them. The summary line is `manifestDescription` in the Extension's text module, and the manifest's `description` reads it.

## Both stores

### Detailed description

Chrome: Store listing, Detailed description. Firefox: Description.

```text
This extension saves the page in your current tab to your Threadsift instance when you press its toolbar button. It reads from your tab, so a page you are signed in to saves what you see. In a Reddit tab, it saves the post with its visible comments and, as far as Reddit’s request limit allows, the replies behind its "more" links.

The extension needs a running Threadsift instance and does nothing on its own. Threadsift is an open source reading library you run as one instance: in a container on your own server, or on your Cloudflare account.

In the extension’s settings, enter your instance address (https, or http only for localhost or 127.0.0.1) and an agent token. Create it under Agent tokens in Threadsift’s Settings with the Read and Add scopes.

Optional features:
- Fill saved Reddit items (off by default) saves the thread of a Reddit link already saved without comments when you open it in a tab. It never reads Reddit in the background.
- Connect Reddit (self-hosted instances only) sends your Reddit session to your instance so it can read Reddit threads for you. It also needs the Reddit scope on the agent token.

The extension saves one page per press and never crawls. It sends saved pages only to the address you entered. To read a Reddit thread, it asks reddit.com from your tab with your Reddit session. It has no account with the developer, no analytics and no ads.

Licence: AGPL-3.0
Source: https://github.com/KyaniteHQ/threadsift
```

### Data disclosure

The privacy text of the Extension. Chrome asks for a privacy policy link on the Privacy practices tab, and Firefox takes a privacy policy on the listing.

```text
The extension sends data to the Threadsift address you enter in settings: your own instance on your server or Cloudflare account. To read a Reddit thread, it makes requests to reddit.com from your Reddit tab with your browser’s Reddit session, as the page would. Those requests only read the thread and send nothing from Threadsift. The developer runs no server and receives nothing. It has no analytics, ads or third parties. Nothing is sold or used except to save to your library.

The extension reads nothing in the background:
- Website content: it reads a page only when you press the toolbar button, sending its address, readable text, image, video and embedded media addresses, and title, author and publication date when named. In a Reddit tab, it sends the post and comments as Reddit returns them, with authors’ user names.
- Web browsing activity: opening a Reddit post or comment page sends its address only while Fill saved Reddit items is on (Firefox asks consent when you turn it on). It asks your instance if that link is saved without its thread, and reads and sends the thread only then. With the setting off, it sends no address of unsaved pages.
- Authentication information: your agent token goes with each request to your instance, never to reddit.com. It reads reddit.com’s reddit_session cookie only when you select Connect Reddit or Reconnect, sends it to your instance and does not store it.

Settings pages ask your instance for the Reddit account’s state when they open. Local extension storage holds your Threadsift address, agent token and Fill saved Reddit items setting. Removing the extension removes them. You control what your instance does with saved data. The instance is open source at https://github.com/KyaniteHQ/threadsift.
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
The extension asks for this optional permission only when the person selects Connect Reddit, then reads only reddit.com’s reddit_session cookie and sends it to their Threadsift address so their instance can read Reddit threads as them. It does not store the cookie or send it anywhere else. Disconnect asks the instance to delete the stored session; once it reports no session, the extension removes the permission, or keeps it and says so on the settings page if the instance can’t be reached.
```

#### Host permissions

```text
All host permissions are optional and grant nothing at install: any https host, since the person runs Threadsift on their own host, and http only on localhost and 127.0.0.1. When they save settings, the extension asks only for the one host of their Threadsift address, named in the browser’s prompt, and for reddit.com only when they turn on Fill or connect Reddit. It asks the browser to remove every other host it holds; if the browser refuses, that host stays granted and the extension logs it.
```

### Remote code

Select "No, I am not using remote code". The Extension runs only the scripts in its zip.

### Data usage

Tick Website content, Web history and Authentication information. Web history covers the addresses of the Reddit threads the owner opens while Fill is on. The Firefox manifest declares the same three in `data_collection_permissions`: Website content and Authentication information as required, and browsing activity as optional, which Firefox asks for when the owner turns Fill on. Tick the three certifications: no sale or transfer of the data to third parties outside the approved uses, no use or transfer for purposes unrelated to the single purpose, and no use or transfer to determine creditworthiness or for lending.

## Firefox Add-ons

### Notes to reviewer

Upload the source archive that the package command writes, with the Firefox zip.

```text
WXT’s production build bundles and minifies the extension’s code without obfuscation. The source upload is a git archive of the repository with the readable code. SOURCE_CODE_REVIEW.md at its root gives the build environment (Node.js 26, pnpm 12.23.0), commands and how to compare the build with the upload. It explains web-ext lint warnings from two libraries: DANGEROUS_EVAL from zod and UNSAFE_VAR_ASSIGNMENT from defuddle.

To use the extension, run a Threadsift instance (the README shows how in a container). Enter its address and an agent token with Read and Add scopes in the extension’s settings, plus the Reddit scope for Connect Reddit.

The webRequest permission reads only network errors of the extension’s own requests to the Threadsift address. It blocks and changes nothing. Only Connect Reddit asks for the optional cookies permission, which reads only reddit.com’s reddit_session cookie. In Firefox, turning on "Fill saved Reddit items" asks for reddit.com access and the optional browsing activity data permission in one prompt. Deny leaves Fill off. All host permissions are optional. The extension asks for the one Threadsift host at Save settings.
```
