import { AI_SECTION } from "./AiSection.tsx";
import { BACKUP_SECTION } from "./BackupSection.tsx";
import { GITHUB_SECTION } from "./GithubSection.tsx";
import { GROK_BOT_SECTION } from "./GrokBotSection.tsx";
import { OBSIDIAN_TEXT } from "./obsidian-text.ts";
import { PASSWORD_LINK } from "./PasswordSection.tsx";
import { REDDIT_SECTIONS } from "./RedditSection.tsx";
import { OBSIDIAN_PATH } from "./routing.ts";
import { TOKENS_LINK } from "./TokensSection.tsx";
import { X_SECTION } from "./XSection.tsx";

export type SettingsLink =
  | Readonly<{ kind: "section"; id: string; title: string }>
  | Readonly<{ kind: "page"; path: string; title: string }>;

function sectionLink({ id, title }: Readonly<{ id: string; title: string }>): SettingsLink {
  return { kind: "section", id, title };
}

export const SETTINGS_LINKS: readonly SettingsLink[] = [
  sectionLink(PASSWORD_LINK),
  sectionLink(AI_SECTION),
  sectionLink(X_SECTION),
  sectionLink(GITHUB_SECTION),
  sectionLink(GROK_BOT_SECTION),
  ...REDDIT_SECTIONS.map((section) => sectionLink(section)),
  sectionLink(TOKENS_LINK),
  { kind: "page", path: OBSIDIAN_PATH, title: OBSIDIAN_TEXT.title },
  sectionLink(BACKUP_SECTION),
];
