# Build the Threadsift extension from this source

This archive is a `git archive` of the Threadsift repository at the commit the extension was built from. The extension's own code is in `extension/`. It also imports modules from `src/core/contract/`, and its dependency versions come from the workspace catalog in `pnpm-workspace.yaml`, so you build it from the archive root.

The build bundles the code with WXT and does not minify or obfuscate it. `pnpm-lock.yaml` pins every package the build installs, including the two libraries the bundle holds: `defuddle`, which extracts a page's readable text, and `zod`, which checks messages and answers.

## Build environment

The build environment differs from the default reviewer environment in two points:

- **Node.js 26.** The extension's `engines` field requires Node.js 26 or later. The build was made with Node.js 26.13.1 on Linux x86_64. It was not tried on ARM64.
- **pnpm 12.23.0** in place of npm. The `packageManager` field of `package.json` pins this version.

The install step downloads packages from the npm registry.

## Steps

Run these commands from the archive root:

```sh
npm install --global pnpm@12.23.0
pnpm install --frozen-lockfile
pnpm --filter threadsift-extension run zip:firefox
```

The last command writes the Firefox build to `extension/.output/firefox-mv3/` and zips it as `extension/.output/threadsift-extension-<version>-firefox.zip`. Compare the folder with the uploaded add-on:

```sh
mkdir uploaded
cd uploaded && unzip ../<uploaded add-on>.zip && cd ..
diff -r extension/.output/firefox-mv3 uploaded
```

`pnpm --filter threadsift-extension run zip` makes the Chrome build the same way, in `extension/.output/chrome-mv3/`.

## Lint warnings

`web-ext lint` reports warnings, and no errors, for two libraries:

- `DANGEROUS_EVAL` in `background.js` and in a chunk that the popup and the options page load. It comes from `zod`, which calls `Function("")` inside a `try` to learn whether it may generate code, and generates code only when that call succeeds. The manifest sets no content security policy, so the Manifest V3 default applies, and it allows no `unsafe-eval` ([MDN, `content_security_policy`](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/content_security_policy)).
- `UNSAFE_VAR_ASSIGNMENT` in `capture.js`. It comes from `defuddle`, which assigns a string to `innerHTML` of a `template`, `div` or `textarea` element it creates, to parse an HTML string or to decode HTML entities.
