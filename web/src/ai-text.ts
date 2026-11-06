export const AI_TEXT = {
  title: "AI",
  intro:
    "Choose a Provider and save, then run Verify for a small real Digest. It does not add an Item.",
  provider: "Provider",
  compatible: "OpenAI-compatible URL",
  openrouter: "OpenRouter",
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
  secretMissing:
    "This Instance has a missing, malformed or changed THREADSIFT_SECRET_KEY. Set it in the container environment or as a Worker secret to 32 random bytes encoded as 64 hex characters, or restore the original key if already saved. Then reload this page.",
  "wrong-key": "Wrong API key. Check the API key and save again.",
  "model-not-found": "Model not found. Check the model and save again.",
  "no-json":
    "The Provider did not return a valid Digest. Choose a model that supports structured JSON.",
  unreachable: "Couldn’t reach the Provider. Check the URL and connection.",
  timeout: "The Provider timed out. Try Verify again.",
  refused:
    "Base URL refused. On Cloudflare use a public HTTPS URL; redirects are refused on both targets.",
  "not-configured": "Save Provider settings first.",
} as const;
