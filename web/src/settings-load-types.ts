import type { Token } from "../../src/core/contract/access-wire.ts";
import type { BotUpdateView } from "../../src/core/contract/bot-install-contract.ts";
import type { ExportStatus } from "../../src/core/contract/export-contract.ts";
import type { GithubSettingsView } from "../../src/core/contract/github-contract.ts";
import type { GrokBotView } from "../../src/core/contract/grok-bot-contract.ts";
import type { RedditAccountView } from "../../src/core/contract/reddit-account-contract.ts";
import type { RedditSettings } from "../../src/core/contract/reddit-contract.ts";
import type { XSettingsView } from "../../src/core/contract/x-settings-contract.ts";
import type { AiView } from "./ai-api.ts";

export type Loaded<View> =
  | { readonly kind: "failed" }
  | { readonly kind: "ready"; readonly view: View };

export interface SettingsLoad {
  readonly ai: Loaded<AiView>;
  readonly backup: Loaded<ExportStatus>;
  readonly botUpdate: Loaded<BotUpdateView>;
  readonly github: Loaded<GithubSettingsView>;
  readonly grokBot: Loaded<GrokBotView>;
  readonly reddit: Loaded<RedditSettings>;
  readonly redditAccount: Loaded<RedditAccountView>;
  readonly tokens: Loaded<readonly Token[]>;
  readonly x: Loaded<XSettingsView>;
}
