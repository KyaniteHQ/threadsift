import type { XReadNote } from "../../src/core/contract/x-read-note.ts";
import type { XReaderChoice, XBotState } from "../../src/core/contract/x-settings-contract.ts";

export const X_TEXT = {
  sectionTitle: "X posts",
  intro:
    "A pasted X link is read by the reader chosen here. The Items it makes show the post and its replies like a Reddit thread.",
  readerLabel: "Read X links with",
  botLabel: "Grok Bot",
  cliLabel: "grok CLI",
  versionLabel: "Version",
  saving: "Saving setting…",
  failed: "Couldn’t save the setting. Try again.",
  noteSignedOut: "Sign in with the command below to read X links with the grok CLI.",
  noteNotProven:
    "This version of the grok CLI, or a tool it offers, is not one Threadsift has checked, so it cannot read X links; after updating or replacing the CLI, restart the Instance so the check runs again:",
  noteUnknown:
    "Threadsift could not read the CLI’s sign-in state just now; reloading the page tries again.",
  noteNotInstalled:
    "The grok CLI is not installed on this Instance, so it cannot read X links. Install it, restart the Instance, and sign in with:",
  noteSearch:
    "A fetch can also read public web pages through xAI’s search, so use a Grok account kept only for this Instance.",
  noteWorker: "On this install a pasted X link stays Link-only unless a Grok Bot is set up.",
  loadFailed: "Couldn’t load the X posts settings. Reload the page.",
  installCommand:
    "podman exec -it -e HOME=/data/grok -e GROK_BIN_DIR=/data/grok/bin <container> bash -c 'curl -fsSL https://x.ai/cli/install.sh | bash'",
  restartCommand: "podman restart <container>",
  signInCommand: "podman exec -it -e HOME=/data/grok <container> grok login --device-auth",
} as const;

export const READER_LABELS = {
  auto: "Auto",
  "grok-bot": "Grok Bot",
  "grok-cli": "grok CLI",
} as const satisfies Readonly<Record<XReaderChoice, string>>;

export const READER_HELP = {
  auto: "When you paste an X link, Auto uses Grok Bot only when its webhook address is saved, Threadsift allows that address, and the saved key can be opened. Otherwise it tries the grok CLI when installed. Without the CLI, the link stays Link-only.",
  "grok-bot":
    "Only the Grok Bot reads X links; if it can’t be used, the link stays Link-only and the grok CLI is not tried.",
  "grok-cli":
    "Only the grok CLI reads X links; if it can’t be used, the link stays Link-only and the Grok Bot is not tried.",
} as const satisfies Readonly<Record<XReaderChoice, string>>;

export const BOT_STATES = {
  ready: "Ready",
  "not-configured": "Not set up",
  "secret-missing": "Key can’t be opened",
  refused: "Address not allowed",
} as const satisfies Readonly<Record<XBotState, string>>;

export const X_STATES = {
  "signed-in": "Signed in",
  "signed-out": "Signed out",
  "not-proven": "Not proven",
  unknown: "Unknown",
  "not-installed": "Not installed",
} as const;

export type XNoticeKey = XReadNote | "x-unreadable" | "x-kept";

export const X_NOTICES: Readonly<Record<XNoticeKey, string>> = {
  "bot-not-set-up":
    "No Grok Bot is set up, so this link was saved Link-only and the grok CLI wasn’t tried. Any saved copy was kept. Check Settings, X posts.",
  "bot-key-unopened":
    "The Grok Bot’s saved key can’t be opened, so this link was saved Link-only and the grok CLI wasn’t tried. Any saved copy was kept. Check Settings, X posts.",
  "bot-address-refused":
    "The Grok Bot’s saved address is not allowed, so this link was saved Link-only and the grok CLI wasn’t tried. Any saved copy was kept. Check Settings, X posts.",
  "bot-timed-out": "The Grok Bot didn’t answer in time while reading the X post.",
  "bot-failed": "The Grok Bot couldn’t read the X post.",
  "bot-unavailable":
    "The Grok Bot answered that it cannot read this X post, so the link was saved Link-only.",
  "cli-not-installed":
    "The grok CLI is not installed on this Instance, so this link was saved Link-only and any saved copy was kept. Check Settings, X posts.",
  "cli-signed-out":
    "The grok CLI is signed out on this Instance, so this post couldn’t be read. Any saved copy was kept. Check Settings, X posts, then paste the link again.",
  "cli-not-proven":
    "This version of the grok CLI, or a tool it offers, is not one Threadsift has checked, so this post couldn’t be read. Any saved copy was kept. Check Settings, X posts.",
  "cli-usage-limit":
    "The grok CLI reached its usage limit, so this post couldn’t be read. Any saved copy was kept. Paste the link again later.",
  "cli-unreachable":
    "The grok CLI could not reach xAI’s service, so this post couldn’t be read. Any saved copy was kept. Paste the link again later.",
  "cli-failed": "The grok CLI couldn’t give Threadsift a usable read. Any saved copy was kept.",
  "x-unconfirmed":
    "X’s embed service was unavailable or the returned post did not match what X shows. The new read saved nothing, and any earlier copy was kept.",
  "x-answer-refused":
    "The grok CLI answered with a thread that is not this post or failed Threadsift’s checks, so this post couldn’t be read. Any saved copy was kept.",
  "x-fewer-replies":
    "The thread that was read has fewer replies than the saved copy, so the saved copy was kept. A refresh with fewer replies than the saved one is never saved.",
  "x-post-absent": "X doesn’t show this post. It may have been deleted or may not exist.",
  "x-unreadable": "This post couldn’t be read.",
  "x-kept": "This post couldn’t be read, so the saved copy was kept.",
};
