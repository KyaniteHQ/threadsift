import { fetchTokens } from "./access-api.ts";
import { fetchAiSettings } from "./ai-api.ts";
import { fetchGithubSettings } from "./github-api.ts";
import { fetchGrokBotSettings } from "./grok-bot-api.ts";
import { fetchRedditAccount } from "./reddit-account-api.ts";
import { fetchRedditSettings } from "./reddit-api.ts";
import type { Loaded, SettingsLoad } from "./settings-load-types.ts";
import { fetchXSettings } from "./x-api.ts";

async function settled<View>(
  load: (signal: AbortSignal) => Promise<View>,
  signal: AbortSignal,
): Promise<Loaded<View>> {
  try {
    return { kind: "ready", view: await load(signal) };
  } catch {
    return { kind: "failed" };
  }
}

export async function readSettings(signal: AbortSignal): Promise<SettingsLoad> {
  const [ai, github, grokBot, reddit, redditAccount, tokens, x] = await Promise.all([
    settled(fetchAiSettings, signal),
    settled(fetchGithubSettings, signal),
    settled(fetchGrokBotSettings, signal),
    settled(fetchRedditSettings, signal),
    settled(fetchRedditAccount, signal),
    settled(fetchTokens, signal),
    settled(fetchXSettings, signal),
  ]);

  return { ai, github, grokBot, reddit, redditAccount, tokens, x };
}
