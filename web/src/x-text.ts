export const X_TEXT = {
  sectionTitle: "X posts",
  intro:
    "A pasted X link goes to a saved Grok Bot first, and otherwise a container fetches it with the grok CLI. The Items it makes show the post and its replies like a Reddit thread.",
  fetcherLabel: "Fetches X links",
  fetcherGrok: "Grok CLI on this server",
  fetcherNone: "None",
  stateLabel: "State",
  versionLabel: "Version",
  noteSignedOut:
    "The grok CLI is signed out, so pasted X links stay Link-only; paste the link again and the Item then fetches, after signing in on this server with:",
  noteNotProven:
    "This version of the grok CLI, or a tool it offers, is not one Threadsift has checked, so pasted X links stay Link-only; after updating or replacing the CLI, restart the Instance so the check runs again:",
  noteUnknown:
    "Threadsift could not read the CLI’s sign-in state just now; reloading the page tries again.",
  noteNotInstalled:
    "Without the grok CLI on this server, pasted X links stay Link-only unless a Grok Bot is saved; install, restart the Instance, and sign in with:",
  noteSearch:
    "A fetch can also read public web pages through xAI’s search, so the owner should use a Grok account kept for this server.",
  noteWorker: "On this install a pasted X link stays Link-only unless a Grok Bot is set up.",
  loadFailed: "Couldn’t load the X posts settings. Reload the page.",
  installCommand:
    "podman exec -it -e HOME=/data/grok -e GROK_BIN_DIR=/data/grok/bin <container> bash -c 'curl -fsSL https://x.ai/cli/install.sh | bash'",
  restartCommand: "podman restart <container>",
  signInCommand: "podman exec -it -e HOME=/data/grok <container> grok login --device-auth",
} as const;

export const X_STATES = {
  "signed-in": "Signed in",
  "signed-out": "Signed out",
  "not-proven": "Not proven",
  unknown: "Unknown",
  "not-installed": "Not installed",
} as const;
