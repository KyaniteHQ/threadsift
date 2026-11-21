import { AI_SECTION } from "./AiSection.tsx";
import { BACKUP_SECTION } from "./BackupSection.tsx";
import { GITHUB_SECTION } from "./GithubSection.tsx";
import { GROK_BOT_SECTION } from "./GrokBotSection.tsx";
import { LoadedSection } from "./LoadedSection.tsx";
import { PasswordSection } from "./PasswordSection.tsx";
import { RedditSections } from "./RedditSection.tsx";
import type { SettingsLoad } from "./settings-load-types.ts";
import { SignOutSection } from "./SignOutSection.tsx";
import { TokensSection } from "./TokensSection.tsx";
import { X_SECTION, useXRefresh } from "./XSection.tsx";

export function SettingsSections({
  loaded,
  loggedOut,
}: Readonly<{ loaded: SettingsLoad; loggedOut: () => void }>) {
  const { x, version, refresh } = useXRefresh(loaded.x);

  return (
    <>
      <SignOutSection loggedOut={loggedOut} />
      <PasswordSection />
      <LoadedSection {...AI_SECTION} initial={loaded.ai} />
      <LoadedSection key={version} {...X_SECTION} initial={x} />
      <LoadedSection {...GITHUB_SECTION} initial={loaded.github} />
      <LoadedSection {...GROK_BOT_SECTION} initial={loaded.grokBot} after={refresh} />
      <RedditSections loaded={loaded} />
      <TokensSection initial={loaded.tokens} />
      <LoadedSection {...BACKUP_SECTION} initial={loaded.backup} />
    </>
  );
}
