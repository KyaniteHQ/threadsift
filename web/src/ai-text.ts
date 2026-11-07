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
  workersAiHelp:
    "Workers AI runs on this Instance's Cloudflare account. No URL or API key is needed.",
  keyNotNeeded: "No API key needed for Workers AI.",
  baseUrl: "Base URL",
  model: "Model",
  key: "API key",
  keySet: "API key saved on this Instance.",
  keyMissing: "No API key saved yet.",
  keyHelp:
    "Leave blank to keep the saved key for the same Provider, URL and model; enter a key when changing them.",
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
  "not-configured": "Save Provider settings first.",
  "provider-unavailable":
    "Workers AI works only on a Cloudflare Instance. Choose another Provider.",
} as const;
