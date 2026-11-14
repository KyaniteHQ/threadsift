import type { CliProvider } from "../../src/core/ai-contract.ts";
import { GROK_BOT_FIRST } from "../../src/core/grok-bot-contract.ts";

export const AI_TEXT = {
  "key-needed":
    "An API key is required on first save or after changing Provider, URL or model. Enter the API key and save again.",
  "provider-busy": "The Provider is busy or failing. Try Verify later.",

  publicUrlHelp:
    "Use a public HTTPS address. A private address such as Ollama on your home network works only in the container.",
  title: "AI",
  intro:
    "Choose a Provider and save, then run Verify for a small real Digest. It does not add an Item.",
  provider: "Provider",
  compatible: "OpenAI-compatible URL",
  openrouter: "OpenRouter",
  anthropic: "Anthropic",
  openai: "OpenAI",
  xai: "xAI",
  workersAi: "Workers AI",
  claudeCode: "Claude Code on this server",
  codex: "Codex on this server",
  grokBot: "Grok Bot",
  grokBotHelp:
    "Grok Bot runs every AI task for the library. Nothing else on this form needs filling in.",
  grokBotFirst: GROK_BOT_FIRST,
  grokBotLink: "Grok Bot section",
  grokBotKey:
    "No API key is needed. Grok Bot uses the address and key saved in the Grok Bot section.",
  verifyingBot: "Waiting for bot…",
  botTimeout:
    "The Grok Bot did not answer in 60 seconds. Check that the bot's routine is on and try Verify again.",
  botBusy: "The Grok Bot answered with an error or is busy. Try Verify later.",
  workersAiHelp:
    "Workers AI runs on this Instance's Cloudflare account. No URL or API key is needed.",
  keyNotNeeded: "No API key needed for Workers AI.",
  claudeCodeKeyNotNeeded: "No API key is needed. Claude Code uses its own sign-in on this server.",
  claudeCodeModelHelp: "Leave blank to use Claude Code's default model.",
  claudeCodeSignedOut:
    "Claude Code is not signed in on this server. Reload this page after signing in with",
  claudeCodeSignInCommand: "claude auth login",
  claudeCodeRejected:
    "Claude Code's sign-in was rejected. Run claude auth login on the server, or replace the token it started with, then press Verify again.",
  codexKeyNotNeeded: "No API key is needed. Codex uses its own sign-in on this server.",
  codexModelHelp:
    "Leave blank to use Codex's default model. Any model you enter must be listed by codex debug models --bundled.",
  codexSignedOut: "Codex is not signed in on this server. Reload this page after signing in with",
  codexSignInCommand: "codex login --device-auth",
  codexRejected:
    "Codex's sign-in was rejected. Run codex login --device-auth on the server, then press Verify again.",
  baseUrl: "Base URL",
  model: "Model",
  key: "API key",
  keySet: "API key saved on this Instance.",
  keyMissing: "No API key saved yet.",
  keyChanged: "Enter an API key to save this Provider, URL and model.",
  keyUnreadable:
    "This Instance can no longer open the saved API key. Enter the Provider's API key again and save to replace it, or restore the original THREADSIFT_SECRET_KEY and reload the page.",
  keyHelp:
    "Leave blank to keep the saved key for the same Provider, URL and model; enter a key when changing them.",
  connect: "Connect",
  connecting: "Connecting…",
  connectHelp:
    "Connect opens OpenRouter to make a key for this Instance and saves it like a typed key. Saving a Provider starts Digests for older Items, which spend model calls.",
  connectUnavailable:
    "Connect is unavailable until THREADSIFT_PUBLIC_ORIGIN sets this Instance's public web address; a typed key still works.",
  connectStale:
    "Settings changed since this page loaded, so Connect did not start. Reload the page and try again.",
  connectFailed: "Connect could not start. Try again.",
  connected: "OpenRouter key saved. Press Verify to check the model.",
  connectActivationPending:
    "The key is saved. OpenRouter has not activated the new key yet, so Digests for older Items did not start. Wait a minute, press Verify to check the key, and then press Save to start those Digests.",
  connectIncomplete:
    "Threadsift could not confirm this Connect. Press Verify to check the key, or press Connect again if no key is saved.",
  connectSettingsChanged:
    "AI settings changed while you were away, so nothing was saved. Press Connect again.",
  connectPossibleOrphan:
    "OpenRouter may have made a key that Threadsift did not save. You can delete unused keys in your OpenRouter account, then press Connect again.",
  connectModelNeeded: "Fill in the Model field before pressing Connect.",
  save: "Save",
  saving: "Saving…",
  saved: "Settings saved.",
  verify: "Verify",
  verifying: "Verifying…",
  verified: "Digest received.",
  loadFailed: "Couldn’t load AI settings. Reload this page to try again.",
  failed: "Couldn’t save or verify. Try again.",
  "secret-missing":
    "This Instance has a missing, malformed or changed THREADSIFT_SECRET_KEY. Set it in the container environment or as a Worker secret to 32 random bytes encoded as 64 hex characters, or restore the original key if already saved. Then reload this page.",
  "wrong-key": "Wrong API key. Check the API key and save again.",
  "model-not-found": "Model not found. Check the model and save again.",
  "no-json":
    "The Provider did not return a valid Digest. Choose a model that supports structured JSON.",
  declined:
    "The Provider refused to return a Digest. Choose another model or Provider and save again.",
  "cut-off":
    "The Provider cut off the Digest at the output limit. Choose a model that answers briefly in JSON or has a larger limit and save again.",
  unreachable: "Couldn’t reach the Provider. Check the URL and connection.",
  timeout: "The Provider timed out. Try Verify again.",
  refused:
    "Base URL refused. On Cloudflare use a public HTTPS URL; redirects are refused on both targets.",
  "not-configured":
    "Save Provider settings first, or sign in to Claude Code or Codex on this server.",
  "provider-unavailable":
    "This Provider is not available on this Instance. Choose another Provider.",
} as const;

export const CLI_TEXT = {
  "claude-code": {
    keyNotNeeded: AI_TEXT.claudeCodeKeyNotNeeded,
    modelHelp: AI_TEXT.claudeCodeModelHelp,
    signedOut: AI_TEXT.claudeCodeSignedOut,
    signInCommand: AI_TEXT.claudeCodeSignInCommand,
    rejected: AI_TEXT.claudeCodeRejected,
  },
  codex: {
    keyNotNeeded: AI_TEXT.codexKeyNotNeeded,
    modelHelp: AI_TEXT.codexModelHelp,
    signedOut: AI_TEXT.codexSignedOut,
    signInCommand: AI_TEXT.codexSignInCommand,
    rejected: AI_TEXT.codexRejected,
  },
} as const;

export function signedOutSentence(provider: CliProvider): string {
  const { signedOut, signInCommand } = CLI_TEXT[provider];

  return `${signedOut} ${signInCommand}.`;
}
