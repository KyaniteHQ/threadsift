import { GROK_BOT_FIRST, VERIFY_WAIT_MS } from "../../src/core/contract/grok-bot-contract.ts";
import type { CliProvider } from "../../src/core/contract/provider-families.ts";
import { SECOND_MS } from "../../src/core/contract/time-units.ts";

export const AI_TEXT = {
  "key-needed":
    "An API key is required on first save or after changing Provider, URL or model. Enter the API key and save again.",
  "provider-busy": "The Provider is busy or failing. Try Verify later.",

  publicUrlHelp:
    "Use a public HTTPS address. A private address, such as Ollama on your home network, works only in a container install.",
  title: "AI",
  intro:
    "Choose a provider and save, then use Verify to run one real digest of a small sample. It doesn’t add an item.",
  provider: "Provider",
  compatible: "OpenAI-compatible URL",
  openrouter: "OpenRouter",
  anthropic: "Anthropic",
  openai: "OpenAI",
  xai: "xAI",
  workersAi: "Workers AI",
  claudeCode: "Claude Code in this container",
  codex: "Codex in this container",
  grokBot: "Grok Bot",
  grokBotHelp: "Grok Bot runs every AI task for the library. No other fields are needed.",
  grokBotFirst: GROK_BOT_FIRST,
  grokBotLink: "Go to the Grok Bot section",
  grokBotKey:
    "No API key is needed here. Threadsift uses the address and key saved in the Grok Bot section.",
  verifyingBot: "Waiting for Grok Bot…",
  botTimeout: `The Grok Bot did not answer in ${String(VERIFY_WAIT_MS / SECOND_MS)} seconds. Check that the bot's routine is on and try Verify again.`,
  botBusy: "The Grok Bot answered with an error or is busy. Try Verify later.",
  workersAiHelp:
    "Workers AI runs on this instance’s Cloudflare account. It needs no URL or API key.",
  keyNotNeeded: "No API key is needed.",
  claudeCodeKeyNotNeeded:
    "No API key is needed. Claude Code uses its own sign-in in this container.",
  claudeCodeModelHelp: "If you enter only an effort, Claude Code chooses the model.",
  recommendedModelHelp: "If you enter only an effort, Threadsift uses {model}.",
  claudeCodeSignedOut:
    "In this container, Claude Code isn’t signed in. Reload this page after signing in with",
  claudeCodeSignInCommand: "claude auth login",
  claudeCodeRejected:
    "Claude Code's sign-in was rejected. Run claude auth login on the server, or replace the token it started with, then press Verify again.",
  codexKeyNotNeeded: "No API key is needed. Codex uses its own sign-in in this container.",
  codexModelHelp:
    "If you enter only an effort, Threadsift uses the first visible model in Codex’s bundled catalog.",
  codexCatalogHelp: "Any model you enter must be listed by codex debug models --bundled.",
  codexSignedOut:
    "In this container, Codex isn’t signed in. Reload this page after signing in with",
  codexSignInCommand: "codex login --device-auth",
  codexRejected:
    "Codex's sign-in was rejected. Run codex login --device-auth on the server, then press Verify again.",
  baseUrl: "Base URL",
  cliChoice: "Model and effort",
  customMissing: "Enter a model or an effort.",
  recommendationFallback:
    "The installed CLI doesn’t support the recommended model and effort. It uses its defaults until it does.",
  cliChoices: {
    recommended: {
      label: "Recommended",
      help: "Threadsift uses {model} with {effort} effort.",
    },
    "cli-defaults": {
      label: "CLI defaults",
      help: "The CLI chooses the model and effort.",
    },
    custom: {
      label: "Custom",
      help: "Enter a model, an effort or both.",
    },
  },
  model: "Model",
  effort: "Effort",
  effortHelp: "If you enter only a model, the CLI uses that model’s default effort.",
  invalidEffort:
    "This model rejects that effort and accepts only {levels}. Save one of those levels or clear Effort.",
  noEfforts: "This model accepts no effort levels. Clear Effort and press Save.",
  key: "API key",
  keySet: "An API key is saved on this instance.",
  keyMissing: "No API key is saved yet.",
  keyChanged: "Enter an API key to save this provider, URL and model.",
  keyUnreadable:
    "This instance can no longer open the saved API key. Enter the API key again and save to replace it, or restore the original THREADSIFT_SECRET_KEY and reload this page.",
  keyHelp:
    "Leave blank to keep the saved key for the same provider, URL and model. Enter a key if you change any of them.",
  connect: "Connect",
  connecting: "Connecting…",
  connectHelp:
    "Connect opens OpenRouter to create a key for this instance and saves it like a key you enter here. Saving a provider starts digests for older items that have none, which uses model calls.",
  connectUnavailable:
    "Connect needs THREADSIFT_PUBLIC_ORIGIN set to this instance’s public web address. You can still enter an API key.",
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
    catalogHelp: undefined,
    signedOut: AI_TEXT.claudeCodeSignedOut,
    signInCommand: AI_TEXT.claudeCodeSignInCommand,
    rejected: AI_TEXT.claudeCodeRejected,
  },
  codex: {
    keyNotNeeded: AI_TEXT.codexKeyNotNeeded,
    modelHelp: AI_TEXT.codexModelHelp,
    catalogHelp: AI_TEXT.codexCatalogHelp,
    signedOut: AI_TEXT.codexSignedOut,
    signInCommand: AI_TEXT.codexSignInCommand,
    rejected: AI_TEXT.codexRejected,
  },
} as const;

export function signedOutSentence(provider: CliProvider): string {
  const { signedOut, signInCommand } = CLI_TEXT[provider];

  return `${signedOut} ${signInCommand}.`;
}
