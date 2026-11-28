import type { XReadNote } from "../../src/core/contract/x-read-note.ts";
import type {
  XBotState,
  XCliBar,
  XReaderChoice,
} from "../../src/core/contract/x-settings-contract.ts";

export const X_TEXT = {
  sectionTitle: "X posts",
  intro:
    "The chosen reader fetches each pasted link to an X post. The item it makes shows the post and its replies like a Reddit thread. Links to X profiles and other X pages are saved as link-only items.",
  readerLabel: "Read X links with",
  botLabel: "Grok Bot",
  cliLabel: "grok CLI",
  versionLabel: "Version",
  saving: "Saving…",
  failed: "Couldn’t save the setting. Try again.",
  noteSignedOut: "Run this command to sign in so the grok CLI can read X links.",
  noteNotProven:
    "Threadsift doesn’t use this grok CLI to read X posts. It has local tools Threadsift doesn’t allow, or it wrote or read a file during the check. Replace the grok CLI to run the check again, or restart the instance:",
  refusedLabel: "Skipped version",
  noteUnknown: "Couldn’t read the grok CLI’s sign-in state. Reload the page to check again.",
  noteNotInstalled:
    "To read X links with the grok CLI, install it, restart the instance, then sign in:",
  noteSearch:
    "The grok CLI can also read public web pages through xAI’s search. Sign in with a Grok account used only for this instance.",
  noteWorker: "On Cloudflare, pasted X links stay link-only unless a Grok Bot is set up.",
  noteWorkerCli:
    "On Cloudflare, pasted X links stay link-only because there is no grok CLI. Choose another reader.",
  noteWorkerApi:
    "On Cloudflare, only the X API reads pasted X links, using the saved token. The Grok Bot is never tried.",
  noteWorkerWithApi:
    "On Cloudflare, pasted X links are read by the Grok Bot when one is set up, otherwise by the X API with the saved token.",
  autoWithApi:
    "Auto uses the Grok Bot only when its address is saved, Threadsift allows that address, and its saved key can be opened. Otherwise it uses the grok CLI if it’s installed. When neither can be used, Auto uses the X API with the saved token, which can spend X API credit. With none available, the link stays link-only.",
  loadFailed: "Couldn’t load these settings. Reload the page.",
  installCommand:
    "podman exec -it -e HOME=/data/grok -e GROK_BIN_DIR=/data/grok/bin <container> bash -c 'curl -fsSL https://x.ai/cli/install.sh | bash'",
  restartCommand: "podman restart <container>",
  signInCommand: "podman exec -it -e HOME=/data/grok <container> grok login --device-auth",
} as const;

export const READER_LABELS = {
  auto: "Auto",
  "grok-bot": "Grok Bot",
  "grok-cli": "grok CLI",
  "x-api": "X API",
} as const satisfies Readonly<Record<XReaderChoice, string>>;

export const READER_HELP = {
  auto: "Auto uses the Grok Bot only when its address is saved, Threadsift allows that address, and its saved key can be opened. Otherwise it uses the grok CLI if it’s installed. With neither, the link stays link-only.",
  "grok-bot":
    "Only the Grok Bot reads X links. If it can’t be used, the link stays link-only and the grok CLI is never tried.",
  "grok-cli":
    "Only the grok CLI reads X links. If it can’t be used, the link stays link-only and the Grok Bot is never tried.",
  "x-api":
    "Only the X API reads X links. A read can spend X API credit. If the X API can’t be used, the link stays link-only and the other readers are never tried.",
} as const satisfies Readonly<Record<XReaderChoice, string>>;

export const BOT_STATES = {
  ready: "ready",
  "not-configured": "not set up",
  "secret-missing": "key can’t be read",
  refused: "address not allowed",
} as const satisfies Readonly<Record<XBotState, string>>;

export const X_STATES = {
  "signed-in": "signed in",
  "signed-out": "signed out",
  "not-proven": "not supported",
  unknown: "sign-in state unknown",
  "not-installed": "not installed",
} as const;

export const REFUSED_REASONS = {
  "extra-tools":
    "It has local tools Threadsift doesn’t allow, so the version in use stays. Threadsift tries again when a newer version comes out.",
  "probe-acted":
    "It wrote or read a file during the check, so the version in use stays. Threadsift tries again when a newer version comes out.",
} as const satisfies Readonly<Record<XCliBar, string>>;

export type XNoticeKey = XReadNote | "x-unreadable" | "x-kept";

export const X_NOTICES: Readonly<Record<XNoticeKey, string>> = {
  "bot-not-set-up":
    "No Grok Bot is set up, so this post couldn’t be read. The grok CLI wasn’t tried. Any earlier copy was kept. Set up the Grok Bot or change the reader in Settings, X posts, then paste the link again.",
  "bot-key-unopened":
    "The Grok Bot’s saved key can’t be opened, so this post couldn’t be read. The grok CLI wasn’t tried. Any earlier copy was kept. Replace the key or change the reader in Settings, X posts, then paste the link again.",
  "bot-address-refused":
    "The Grok Bot’s saved address isn’t a public https address, so this post couldn’t be read. The grok CLI wasn’t tried. Any earlier copy was kept. Change the address or the reader in Settings, X posts, then paste the link again.",
  "bot-timed-out": "The Grok Bot didn’t answer in time while reading this X post.",
  "bot-failed": "The Grok Bot couldn’t read this X post.",
  "bot-unavailable": "The Grok Bot said it can’t read this post. Any earlier copy was kept.",
  "cli-not-installed":
    "The grok CLI isn’t installed on this instance, so this post couldn’t be read. Any earlier copy was kept. Check Settings, X posts for how to install it, then paste the link again.",
  "cli-signed-out":
    "The grok CLI is signed out, so this post couldn’t be read. Any earlier copy was kept. Check Settings, X posts, then paste the link again.",
  "cli-not-proven":
    "The grok CLI has local tools Threadsift doesn’t allow, or wrote or read a file during the check, so this post couldn’t be read. Any earlier copy was kept. Check Settings, X posts, then paste the link again.",
  "cli-unconfirmed":
    "Threadsift couldn’t confirm which local tools the grok CLI had, or that the same program file was checked and run, so this post couldn’t be read. Any earlier copy was kept. Paste the link again.",
  "cli-usage-limit":
    "The grok CLI reached its usage limit, so this post couldn’t be read. Any earlier copy was kept. Paste the link again later.",
  "cli-unreachable":
    "The grok CLI couldn’t reach xAI’s service to read this post. Any earlier copy was kept. Paste the link again later.",
  "cli-failed":
    "Threadsift didn’t get a usable answer from the grok CLI, so this post couldn’t be read. Any earlier copy was kept. Try pasting the link again.",
  "api-not-set-up":
    "Couldn’t read this post because X API is the chosen reader and no Bearer token is saved. The other readers weren’t tried. Any earlier copy was kept. Save a token with PUT /api/settings/x-api or change the reader in Settings, X posts. Then paste the link again.",
  "api-key-unopened":
    "Couldn’t open the saved X API Bearer token because the instance’s secret key changed or is missing. This post wasn’t read. Any earlier copy was kept. Save the token again with PUT /api/settings/x-api or change the reader in Settings, X posts. Then paste the link again.",
  "api-key-rejected":
    "X rejected the saved Bearer token, so this post couldn’t be read. Any earlier copy was kept. Save a working token with PUT /api/settings/x-api, then paste the link again.",
  "api-not-enrolled":
    "X says your developer app isn’t in the pay-per-use package, so this post couldn’t be read. Any earlier copy was kept. Move the app to pay-per-use in X’s developer console, then paste the link again.",
  "api-ip-blocked":
    "X refused the request to read this post because this instance’s address isn’t on the IP allowlist for your X developer account. Any earlier copy was kept. Add the address in X’s developer console, then paste the link again.",
  "api-out-of-credits":
    "Your X developer account has no credit left or has reached its spending limit, so this post couldn’t be read. Any earlier copy was kept. Add credit or raise the limit in X’s developer console, then paste the link again.",
  "api-refused":
    "X refused the request to read this post. Any earlier copy was kept. Paste the link again later.",
  "api-unreachable":
    "Threadsift couldn’t reach the X API to read this post. Any earlier copy was kept. Paste the link again later.",
  "api-answer-unreadable":
    "Threadsift didn’t get a usable answer from the X API, so this post couldn’t be read. Any earlier copy was kept. Paste the link again later.",
  "x-unconfirmed":
    "Threadsift couldn’t check this post on X, or the fetched post didn’t match what X shows. Nothing new was saved, and any earlier copy was kept.",
  "x-answer-refused":
    "This post couldn’t be read. The grok CLI gave the wrong post, or a thread that failed Threadsift’s checks. Any earlier copy was kept.",
  "x-fewer-replies":
    "The saved copy was kept because this refresh had fewer replies. Threadsift never saves a refresh with fewer replies.",
  "x-post-absent": "X doesn’t show this post. It may have been deleted or may not exist.",
  "x-unreadable": "This post couldn’t be read.",
  "x-kept": "This post couldn’t be read, so the saved copy was kept.",
};
