import type { ReactNode } from "react";

import { AI_SECTION } from "./AiSection.tsx";
import { BACKUP_SECTION } from "./BackupSection.tsx";
import { GITHUB_SECTION } from "./GithubSection.tsx";
import { GROK_BOT_SECTION } from "./GrokBotSection.tsx";
import { LoadedSection } from "./LoadedSection.tsx";
import { PASSWORD_LINK, PasswordSection } from "./PasswordSection.tsx";
import { REDDIT_SECTIONS, RedditSections } from "./RedditSection.tsx";
import { OBSIDIAN_LINK, type SettingsLink, sectionLink } from "./settings-links.ts";
import type { SettingsLoad } from "./settings-load-types.ts";
import { TOKENS_LINK, TokensSection } from "./TokensSection.tsx";
import { X_SECTION, useXRefresh } from "./XSection.tsx";

type Drawn = ReturnType<typeof useXRefresh> & { readonly loaded: SettingsLoad };

interface Part {
  readonly links: readonly SettingsLink[];
  readonly draw: (drawn: Readonly<Drawn>) => ReactNode;
}

const SETTINGS_PARTS: readonly Part[] = [
  { links: [sectionLink(PASSWORD_LINK)], draw: () => <PasswordSection /> },
  {
    links: [sectionLink(AI_SECTION)],
    draw: ({ loaded }) => <LoadedSection {...AI_SECTION} initial={loaded.ai} />,
  },
  {
    links: [sectionLink(X_SECTION)],
    draw: ({ x }) => <LoadedSection {...X_SECTION} initial={x} />,
  },
  {
    links: [sectionLink(GITHUB_SECTION)],
    draw: ({ loaded }) => <LoadedSection {...GITHUB_SECTION} initial={loaded.github} />,
  },
  {
    links: [sectionLink(GROK_BOT_SECTION)],
    draw: ({ loaded, refresh }) => (
      <LoadedSection {...GROK_BOT_SECTION} initial={loaded.grokBot} after={refresh} />
    ),
  },
  {
    links: REDDIT_SECTIONS.map((section) => sectionLink(section)),
    draw: ({ loaded }) => <RedditSections loaded={loaded} />,
  },
  {
    links: [sectionLink(TOKENS_LINK)],
    draw: ({ loaded }) => <TokensSection initial={loaded.tokens} />,
  },
  { links: [OBSIDIAN_LINK], draw: () => null },
  {
    links: [sectionLink(BACKUP_SECTION)],
    draw: ({ loaded }) => <LoadedSection {...BACKUP_SECTION} initial={loaded.backup} />,
  },
];

export const SETTINGS_LINKS: readonly SettingsLink[] = SETTINGS_PARTS.flatMap(({ links }) => links);

export function SettingsSections({ loaded }: Readonly<{ loaded: SettingsLoad }>) {
  const { x, refresh } = useXRefresh(loaded.x);

  return SETTINGS_PARTS.map((part) => (
    <SettingsPart
      key={part.links.map(({ title }) => title).join(" ")}
      part={part}
      loaded={loaded}
      x={x}
      refresh={refresh}
    />
  ));
}

function SettingsPart({ part, ...drawn }: Readonly<Drawn & { part: Part }>) {
  return part.draw(drawn);
}
