import type { GithubSettingsView } from "../../src/core/github-contract.ts";
import type { GrokBotView } from "../../src/core/grok-bot-contract.ts";
import type { RedditAccountView } from "../../src/core/reddit-account-contract.ts";
import type { RedditSettings } from "../../src/core/reddit-contract.ts";
import type { XSettingsView } from "../../src/core/x-settings.ts";
import type { Token } from "../../src/http/schemas.ts";
import type { AiView } from "./ai-api.ts";

export type Loaded<View> =
  | { readonly kind: "failed" }
  | { readonly kind: "ready"; readonly view: View };

export interface SettingsLoad {
  readonly ai: Loaded<AiView>;
  readonly github: Loaded<GithubSettingsView>;
  readonly grokBot: Loaded<GrokBotView>;
  readonly reddit: Loaded<RedditSettings>;
  readonly redditAccount: Loaded<RedditAccountView>;
  readonly tokens: Loaded<readonly Token[]>;
  readonly x: Loaded<XSettingsView>;
}
