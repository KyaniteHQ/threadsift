import { GROK_BOT_FIRST, VERIFY_WAIT_MS } from "../../src/core/contract/grok-bot-contract.ts";
import type { CliProvider } from "../../src/core/contract/provider-families.ts";
import { SECOND_MS } from "../../src/core/contract/time-units.ts";
import { filled } from "./filled.ts";

export const AI_TEXT = {
  "key-needed":
    "An API key is needed on the first save or after changing Provider, Base URL or Model. Enter a key and save again.",
  "provider-busy": "The provider is busy or failing. Try Verify later.",

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
  botTimeout: `The Grok Bot didn’t answer within ${String(VERIFY_WAIT_MS / SECOND_MS)} seconds. Check that its routine in Grok is on, then press Verify again.`,
  botBusy: "The Grok Bot is busy or returned an error. Try Verify later.",
  botWrongKey:
    "The Grok Bot rejected the saved key or address. Check them in the Grok Bot section with Test, then press Verify again.",
  botUnreachable:
    "Couldn’t send the task to the Grok Bot. It didn’t answer, returned an error or has no routine at the saved address. Check the address in the Grok Bot section with Test, then press Verify again.",
  botRefused:
    "Threadsift rejected the saved Grok Bot address, so nothing was sent. Change it in the Grok Bot section to a public HTTPS address with no user name, password, query or fragment.",
  workersAiHelp:
    "Workers AI runs on this instance’s Cloudflare account. It needs no URL or API key.",
  claudeCodeKeyNotNeeded:
    "No API key is needed. Claude Code uses its own sign-in in this container.",
  claudeCodeModelHelp: "If you enter only an effort, Claude Code chooses the model.",
  recommendedModelHelp: "If you enter only an effort, Threadsift uses {model}.",
  claudeCodeSignedOut:
    "Claude Code isn’t signed in. Run {command} in this instance’s container, then reload this page.",
  claudeCodeSignInCommand: "claude auth login",
  claudeCodeRejected:
    "Claude Code rejected its sign-in. Run {command} in the container or replace the token in CLAUDE_CODE_OAUTH_TOKEN, then press Verify again.",
  codexKeyNotNeeded: "No API key is needed. Codex uses its own sign-in in this container.",
  codexModelHelp:
    "If you enter only an effort, Threadsift uses the first visible model in Codex’s bundled catalog.",
  codexCatalogHelp: "Any model you enter must be listed by codex debug models --bundled.",
  codexSignedOut:
    "Codex isn’t signed in. Run {command} in this instance’s container, then reload this page.",
  codexSignInCommand: "codex login --device-auth",
  claudeCodeNotStarted:
    "Couldn’t start Claude Code. Check that it’s installed in this instance’s container and can run, then press Verify again.",
  codexNotStarted:
    "Couldn’t start Codex. Check that it’s installed in this instance’s container and can run, then press Verify again.",
  codexRejected:
    "Codex rejected its sign-in. Run {command} in the container, then press Verify again.",
  baseUrl: "Base URL",
  cliChoice: "Model and effort",
  customMissing: "Enter a model or effort level.",
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
    "This model rejected that effort level. Accepted levels: {levels}. Enter one or clear Effort, then save again.",
  noEfforts: "This model doesn’t accept effort levels. Clear Effort and save again.",
  key: "API key",
  keySet: "An API key is saved on this instance.",
  keyMissing: "No API key is saved yet.",
  keyChanged: "Enter an API key to save changes to Provider, Base URL or Model.",
  keyUnreadable:
    "This instance can no longer open the saved API key. Enter the API key again and save to replace it, or restore the original THREADSIFT_SECRET_KEY and reload this page.",
  keyHelp:
    "Leave blank to keep the saved key while Provider, Base URL and Model stay the same. Enter a key if you change any of them.",
  connect: "Connect",
  connecting: "Connecting…",
  connectHelp:
    "Connect opens OpenRouter to create a key for this instance and saves it like a key you enter here. Saving a provider starts digests for older items that have none, which uses model calls.",
  connectUnavailable:
    "To connect with OpenRouter and create a key, set THREADSIFT_PUBLIC_ORIGIN to this instance’s public web address. You can still enter an API key by hand.",
  connectStale:
    "AI settings changed since the page loaded, so Connect didn’t start. Reload the page and press Connect again.",
  connectFailed: "Couldn’t start Connect. Try again.",
  connected: "OpenRouter key saved. Press Verify to check the model.",
  connectActivationPending:
    "The key is saved. OpenRouter hasn’t activated it yet, so digests for older items didn’t start. Wait about a minute, press Verify to check the key, then press Save to start those digests.",
  connectIncomplete:
    "Threadsift couldn’t confirm the OpenRouter connection. Press Verify to check the saved key, or press Connect again if no key is saved.",
  connectSettingsChanged:
    "AI settings changed while you were on OpenRouter, so nothing was saved. Press Connect again.",
  connectPossibleOrphan:
    "OpenRouter may have created a key that Threadsift didn’t save. You can delete unused keys in your OpenRouter account, then press Connect again.",
  connectModelNeeded: "Enter a model before pressing Connect.",
  save: "Save",
  saving: "Saving…",
  saved: "Settings saved",
  verify: "Verify",
  verifying: "Verifying…",
  verified: "Digest received",
  loadFailed: "Couldn’t load AI settings. Reload the page to try again.",
  saveFailed: "Couldn’t save provider settings. Try again.",
  verifyFailed: "Couldn’t verify the provider. Try again.",
  verifyRestoring:
    "Couldn’t verify the provider because a restore is running. Try Verify again once the restore finishes.",
  "secret-missing":
    "THREADSIFT_SECRET_KEY is missing, invalid or changed on this instance. Set it in the container environment or as a Worker secret to 32 random bytes (64 hex characters). If keys were already saved with an earlier secret key, restore that key instead. Then reload the page.",
  "wrong-key": "The provider rejected the API key. Check the key and save again.",
  "model-not-found": "The provider doesn’t recognize this model. Check it and save again.",
  "no-json":
    "The provider didn’t return a valid digest. Choose a model that supports structured JSON output and save again.",
  declined:
    "The provider’s content filter blocked the digest. Choose another model or provider and save again.",
  "cut-off":
    "The provider cut off the digest at its output limit. Choose a model that answers briefly in JSON or has a larger output limit, then save again.",
  unreachable: "Couldn’t reach the provider. Check the Base URL and the network connection.",
  timeout: "The provider took too long to answer. Try Verify again.",
  refused:
    "Threadsift rejected this Base URL. Enter an HTTP or HTTPS address that doesn’t redirect and has no user name, password, query or fragment, then save again.",
  refusedPublic:
    "Threadsift rejected this Base URL. Enter a public HTTPS address that doesn’t redirect and has no user name, password, query or fragment, then save again.",
  "not-configured": "Save a provider first.",
  "provider-unavailable":
    "This provider isn’t available on this instance. Choose another provider.",
} as const;

export const CLI_TEXT = {
  "claude-code": {
    keyNotNeeded: AI_TEXT.claudeCodeKeyNotNeeded,
    modelHelp: AI_TEXT.claudeCodeModelHelp,
    catalogHelp: undefined,
    signedOut: AI_TEXT.claudeCodeSignedOut,
    signInCommand: AI_TEXT.claudeCodeSignInCommand,
    rejected: AI_TEXT.claudeCodeRejected,
    notStarted: AI_TEXT.claudeCodeNotStarted,
  },
  codex: {
    keyNotNeeded: AI_TEXT.codexKeyNotNeeded,
    modelHelp: AI_TEXT.codexModelHelp,
    catalogHelp: AI_TEXT.codexCatalogHelp,
    signedOut: AI_TEXT.codexSignedOut,
    signInCommand: AI_TEXT.codexSignInCommand,
    rejected: AI_TEXT.codexRejected,
    notStarted: AI_TEXT.codexNotStarted,
  },
} as const;

export function signedOutParts(provider: CliProvider) {
  const { signedOut, signInCommand } = CLI_TEXT[provider];
  const [before = "", after = ""] = signedOut.split("{command}");

  return { before, command: signInCommand, after };
}

export function rejectedSentence(provider: CliProvider): string {
  const { rejected, signInCommand } = CLI_TEXT[provider];

  return filled(rejected, { command: signInCommand });
}

export function signedOutSentence(provider: CliProvider): string {
  const { before, command, after } = signedOutParts(provider);

  return `${before}${command}${after}`;
}
