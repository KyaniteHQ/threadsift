import type { XReadNote, XReaderChoice } from "../../src/core/kinds.ts";
import type { XBotState } from "../../src/core/x-reader.ts";

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
  noteSignedOut:
    "The grok CLI is signed out, so it cannot read X links; sign in on this server with:",
  noteNotProven:
    "This version of the grok CLI, or a tool it offers, is not one Threadsift has checked, so it cannot read X links; after updating or replacing the CLI, restart the Instance so the check runs again:",
  noteUnknown:
    "Threadsift could not read the CLI’s sign-in state just now; reloading the page tries again.",
  noteNotInstalled:
    "The grok CLI is not installed on this server, so it cannot read X links; install it, restart the Instance, and sign in with:",
  noteSearch:
    "A fetch can also read public web pages through xAI’s search, so the owner should use a Grok account kept for this server.",
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
  auto: "The Grok Bot reads X links when it is set up and its key opens, otherwise the grok CLI reads them when installed, otherwise the link stays Link-only.",
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

export const X_NOTICES: Readonly<
  Record<XNoticeKey, { readonly text: string; readonly kind: "save-note" }>
> = {
  "bot-not-set-up": {
    text: "No Grok Bot is set up, so this link was saved Link-only and the grok CLI wasn’t tried. Any saved copy was kept; check Settings, X posts.",
    kind: "save-note",
  },
  "bot-key-unopened": {
    text: "The Grok Bot’s saved key can’t be opened, so this link was saved Link-only and the grok CLI wasn’t tried. Any saved copy was kept; check Settings, X posts.",
    kind: "save-note",
  },
  "bot-address-refused": {
    text: "The Grok Bot’s saved address is not allowed, so this link was saved Link-only and the grok CLI wasn’t tried. Any saved copy was kept; check Settings, X posts.",
    kind: "save-note",
  },
  "bot-timed-out": {
    text: "The Grok Bot didn’t answer in time while reading the X post.",
    kind: "save-note",
  },
  "bot-failed": { text: "The Grok Bot couldn’t read the X post.", kind: "save-note" },
  "bot-unavailable": {
    text: "The Grok Bot answered that it cannot read this X post, so the link was saved Link-only.",
    kind: "save-note",
  },
  "cli-not-installed": {
    text: "The grok CLI is not installed on this server, so this link was saved Link-only and any saved copy was kept. Check Settings, X posts.",
    kind: "save-note",
  },
  "cli-signed-out": {
    text: "The grok CLI is signed out on this server, so this post couldn’t be read. Any saved copy was kept; check Settings, X posts, then paste the link again.",
    kind: "save-note",
  },
  "cli-not-proven": {
    text: "This version of the grok CLI is not one Threadsift has checked, so this post couldn’t be read. Any saved copy was kept; check Settings, X posts.",
    kind: "save-note",
  },
  "cli-usage-limit": {
    text: "The grok CLI reached its usage limit, so this post couldn’t be read. Any saved copy was kept; paste the link again later.",
    kind: "save-note",
  },
  "cli-unreachable": {
    text: "The grok CLI could not reach xAI’s service, so this post couldn’t be read. Any saved copy was kept; paste the link again later.",
    kind: "save-note",
  },
  "cli-failed": {
    text: "The grok CLI ran but gave no answer Threadsift could use, so this post couldn’t be read. Any saved copy was kept; paste the link again later.",
    kind: "save-note",
  },
  "x-unconfirmed": {
    text: "X’s own page couldn’t confirm the post: X’s embed service couldn’t be reached or the post didn’t match what X shows. Nothing was changed; paste the link again later.",
    kind: "save-note",
  },
  "x-answer-refused": {
    text: "The grok CLI answered with a thread that is not this post or failed Threadsift’s checks, so this post couldn’t be read. Any saved copy was kept.",
    kind: "save-note",
  },
  "x-fewer-replies": {
    text: "The thread that was read has fewer replies than the saved copy, so the saved copy was kept. A refresh with fewer replies than the saved one is never saved.",
    kind: "save-note",
  },
  "x-unreadable": { text: "This post couldn’t be read.", kind: "save-note" },
  "x-kept": { text: "This post couldn’t be read, so the saved copy was kept.", kind: "save-note" },
};
