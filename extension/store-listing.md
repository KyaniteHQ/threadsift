# Store listing texts

The texts the owner enters in the Chrome Web Store Developer Dashboard and in the Firefox Add-ons Developer Hub when uploading the Extension. The repository's copy script wrote every text in a `text` block. Copy each block as it is. The package command fails when a store's built manifest lists a permission, an optional permission, a data collection permission, a required host permission (of `host_permissions` or a content script's `matches`) or optional host permissions, and the store's section for reasons has no `####` heading for it with a non-empty text block right under it. That section is Permission justifications for Chrome and Description for Firefox, where each text also starts with the heading's name and a colon. A required host permission needs a heading `` Required host permission `<pattern>` `` of its own.

Both stores take the name, the summary line and the version from the manifest in the zip, so this page holds none of them. The summary line is `manifestDescription` in the Extension's text module, and the manifest's `description` reads it.

## Both stores

### Detailed description

Chrome: Store listing, Detailed description. Firefox: Description.

```text
This extension saves the page in your current tab to your Threadsift instance when you press its toolbar button. It reads from your tab, so a page you are signed in to saves what you see. In a Reddit tab, it saves the post with its visible comments and, as far as Reddit’s request limit allows, the replies behind its "more" links.

The extension needs a running Threadsift instance and does nothing on its own. Threadsift is an open source reading library you run as one instance: in a container on your own server, or on your Cloudflare account.

In the extension’s settings, enter your instance address (https, or http only for localhost or 127.0.0.1) and an agent token. Create it under Agent tokens in Threadsift’s Settings with the Read and Add scopes.

Optional features:
- Fill saved Reddit items (off by default) saves the thread of a Reddit link saved without comments when you open it. While on, a script runs on every https page of reddit.com and its subdomains, background tabs included, with no toolbar press. It reads only the address. On post or comment pages it asks your instance if the link is saved without its thread, and reads and sends the thread only then. On other pages it does nothing. With it off, the extension reads no Reddit page in the background. Its only background script is on your Threadsift host and reads no page content.
- Connect Reddit (self-hosted instances only) sends your Reddit session to your instance so it can read Reddit threads for you. It also needs the Reddit scope on the agent token.

The extension saves one page per press and never crawls. It sends saved pages only to the address you entered. To read a Reddit thread, it asks reddit.com from your tab with your Reddit session. It has no account with the developer, no analytics and no ads.

Licence: AGPL-3.0
Source: https://github.com/KyaniteHQ/threadsift
```

### Data disclosure

The privacy text of the Extension. Chrome asks for a privacy policy link on the Privacy practices tab, and Firefox takes a privacy policy on the listing.

```text
The extension sends data to the Threadsift address you enter in settings: your own instance on your server or Cloudflare account. To read a Reddit thread, it makes requests to reddit.com from your Reddit tab with your browser’s Reddit session, as the page would. Those requests only read the thread and send nothing from Threadsift. The developer runs no server and receives nothing. It has no analytics, ads or third parties. Nothing is sold or used except to save to your library.

With "Fill saved Reddit items" off, the extension reads no Reddit page in the background (its only background script runs on your Threadsift host and reads no page content). While it is on, a script runs on every https page of reddit.com and its subdomains, background tabs included. It reads only the page’s address, checks post or comment pages with your instance and does nothing on other Reddit pages. What it reads and sends:
- Website content: when you press the toolbar button, it reads the page, sending its address, readable text, image, video and embedded media addresses, and title, author and publication date when named. With "Fill saved Reddit items" on, when a tab loads a Reddit post or comment your instance holds without its thread, it reads and sends the thread with your Reddit session without a press. In a Reddit tab, it sends the post and comments as Reddit returns them, with authors’ user names.
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
[text needed]
```

#### `scripting`

```text
A toolbar press runs the extension’s own script in the current tab to read its title, text and image addresses. On a Reddit post or comment tab, it instead asks reddit.com for the thread with the user’s session: one request for the thread and one per group of hidden replies, up to Reddit’s request limit, or reads the tab like any other page if that fails. Only while "Fill saved Reddit items" is on, a script loads on every https page of reddit.com and its subdomains, background tabs included. It reads only the address, asks the instance on post or comment pages if the link is saved without its thread, reads and sends the thread only then, and does nothing on other pages. With Fill on or off, another script loads on every page of every port of the Threadsift host, reads no page content and passes only a request to reconnect Reddit. The extension answers it only for the top-level page of the saved origin (scheme, host and port). It runs no code from outside the extension.
```

#### `storage`

```text
The extension keeps the Threadsift address, the agent token, and whether "Fill saved Reddit items" is on in the browser’s local extension storage. It stores nothing else, and only its background worker reads the token.
```

#### `webRequest`

```text
The browser reports requests only for hosts the extension holds: the Threadsift host and, when the user connects Reddit or turns on "Fill saved Reddit items", reddit.com and its subdomains. The extension listens only to fetch requests to the Threadsift host, on every port of it. It reads the address, method and tab of each to find its own call, and reads only the network error of that call to report why saving could not reach the instance: address not found, connection refused or timed out, or no secure connection. It does not block, change or read the content of any request.
```

#### `cookies`

```text
Only Connect Reddit and Reconnect ask for this optional permission. The permission lets the extension read the cookies of every host it holds, the Threadsift host included. The extension uses it only to read reddit.com’s reddit_session cookie, sends that cookie to the saved Threadsift origin so the person’s instance can read Reddit threads as them, and never stores it or sends it elsewhere. Disconnect asks the instance to delete the session and removes the permission only when it reports no session. If the instance can’t be reached, the request fails or the browser refuses, the permission stays and the settings page says so.
```

#### Optional host permissions

```text
All host permissions are optional and grant nothing at install: any https host for a self-hosted instance, and http only on localhost and 127.0.0.1. At Save settings, the extension requests the host of the person’s Threadsift address. One grant covers every port of that host. The browser shows its prompt, which names the host, when the extension does not hold it yet. Saving a host the extension already holds, on any port, shows no prompt. The extension requests reddit.com and its subdomains only when the person turns on "Fill saved Reddit items" or selects Connect Reddit or Reconnect. It removes every other host it holds. If the browser refuses a removal, that host stays granted and the extension logs it.
```

### Remote code

Select "No, I am not using remote code". The Extension runs only the scripts in its zip.

### Data usage

Tick Website content, Web history and Authentication information. Web history covers the addresses of the Reddit threads the owner opens while Fill is on. The Firefox manifest declares the same three in `data_collection_permissions`: Website content and Authentication information as required, and browsing activity as optional, which Firefox asks for when the owner turns Fill on. Tick the three certifications: no sale or transfer of the data to third parties outside the approved uses, no use or transfer for purposes unrelated to the single purpose, and no use or transfer to determine creditworthiness or for lending.

## Firefox Add-ons

### Description

Mozilla advises each add-on to describe why it requests its permissions in its description ([Request the right permissions](https://extensionworkshop.com/documentation/develop/request-the-right-permissions/)), and the Developer Hub has no field per permission. Enter the Detailed description, then the heading line below and the text under each permission heading, in this order, each as its own paragraph. Firefox Add-ons keeps the `description` of an add-on to 15,000 characters ([addons-server add-on model](https://github.com/mozilla/addons-server/blob/a2900ac9c4fef3c99ba06849f3754e930c2d6894/src/olympia/addons/models.py#L486)), and the Detailed description with every text below holds 7,066 characters.

```text
Reasons for each permission
```

#### `activeTab`

```text
activeTab: When you press the toolbar button, the extension gets one-time access to the current tab to save its title, text and image addresses, or the thread on a Reddit post or comment page, to your Threadsift instance. It does not hold the tabs permission, and activeTab itself gives no access to other tabs. Background reads of Reddit tabs happen under the optional host permission for reddit.com and its subdomains and the scripting permission, never under activeTab, and only while "Fill saved Reddit items" is on.
```

#### `scripting`

```text
scripting: A toolbar press runs the extension’s own script in the current tab to read its title, text and image addresses. On a Reddit post or comment tab, it instead asks reddit.com for the thread with your session: one request for it and one per group of hidden replies, up to Reddit’s limit, or reads the tab like any other page if that fails. Only while "Fill saved Reddit items" is on, a script loads on every https page of reddit.com and its subdomains, background tabs included. It reads only the address, asks your instance on post or comment pages if the link is saved without its thread, reads and sends the thread only then, and does nothing on other pages. With Fill on or off, another script loads on every page of every port of your Threadsift host, reads no page content and passes only a Reddit reconnect request. The extension answers only a top-level page of the Threadsift address you saved (scheme, host and port). It runs no code from outside the extension.
```

#### `storage`

```text
storage: Local extension storage holds your Threadsift address, your agent token and whether "Fill saved Reddit items" is on, and nothing else. Only the background worker reads the token; the popup and the page script never see it. Removing the extension deletes these values.
```

#### `webRequest`

```text
webRequest: Firefox reports requests only for hosts you granted. The extension listens only to fetch requests to your Threadsift host, on every port of it. It reads the address, method and tab of each to find its own call, and reads only the network error of that call to explain why saving could not reach your instance: address not found, connection refused or timed out, or no secure connection. It does not block, change or read the content of any request. Firefox shows no prompt for this permission.
```

#### `cookies`

```text
cookies: Only Connect Reddit and Reconnect ask for this optional permission (self-hosted). The permission lets the extension read the cookies of every host it holds, your Threadsift host included. The extension uses it only to read reddit.com’s reddit_session cookie, sends that cookie to the Threadsift address you saved so your instance can read Reddit threads as you, and never stores it or sends it elsewhere. Disconnect asks your instance to delete the session and removes the permission only when it reports no session. If your instance can’t be reached, the request fails or Firefox refuses, the permission stays and the settings page says so.
```

#### Optional host permissions

```text
Optional host permissions: They grant nothing at install and cover any https host for a self-hosted instance, and http only on localhost and 127.0.0.1. At Save settings, the extension requests your Threadsift host. One grant covers every port of that host. The browser shows its prompt, which names the host, when the extension does not hold it yet. Saving a host it already holds, on any port, shows no prompt. The extension requests reddit.com and its subdomains only when you turn on "Fill saved Reddit items" or select Connect Reddit or Reconnect. It removes every other host it holds. If the browser refuses a removal, that host stays granted and the extension logs it.
```

#### `websiteContent`

```text
websiteContent: A toolbar press sends the page’s address, readable text, image, video and embedded media addresses, and title, author and publication date when named. With "Fill saved Reddit items" on, when a tab loads a Reddit link your instance holds without its thread, the extension reads and sends it with your Reddit session without a press. In a Reddit tab, it sends the post and comments as Reddit returns them, with authors’ user names. Page content goes only to your Threadsift address.
```

#### `authenticationInfo`

```text
authenticationInfo: Each request to your Threadsift address includes the agent token you create in Threadsift’s Settings, and the extension never sends that token to reddit.com. Only when you select Connect Reddit or Reconnect does it read reddit.com’s reddit_session cookie and send it to your Threadsift instance. It does not store the cookie or send either one anywhere else.
```

#### `browsingActivity`

```text
browsingActivity: Turning on "Fill saved Reddit items" opens one Firefox prompt for this optional permission and, when not already held, for access to reddit.com and its subdomains. Deny leaves it off. While on, a script loads on every https page of reddit.com and its subdomains, background tabs included, with no toolbar press. It reads only the address. On a post or comment page, the extension sends that address to your Threadsift instance to ask if the link is saved without its thread, and reads and sends the thread only then. On other Reddit pages it does nothing. Turning it off removes the permission, and while off, the extension sends no address of pages you open.
```

### Notes to reviewer

Upload the source archive that the package command writes, with the Firefox zip. Firefox Add-ons keeps the notes to the reviewer to 3,000 characters ([addons-server version model](https://github.com/mozilla/addons-server/blob/a2900ac9c4fef3c99ba06849f3754e930c2d6894/src/olympia/versions/models.py#L311)), and the text holds 662 characters.

```text
WXT’s production build bundles and minifies the extension’s code without obfuscation. The source upload is a git archive of the repository with the readable code. SOURCE_CODE_REVIEW.md at its root gives the build environment (Node.js 26, pnpm 12.23.0), commands and how to compare the build with the upload. It explains web-ext lint warnings from two libraries: DANGEROUS_EVAL from zod and UNSAFE_VAR_ASSIGNMENT from defuddle.

To use the extension, run a Threadsift instance (the README shows how in a container). Enter its address and an agent token with Read and Add scopes in the extension’s settings, plus the Reddit scope for Connect Reddit.

[text needed]
```
