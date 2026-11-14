import { AI_SECTION } from "./AiSection.tsx";
import { GITHUB_SECTION } from "./GithubSection.tsx";
import { LoadedSection } from "./LoadedSection.tsx";
import { PasswordSection } from "./PasswordSection.tsx";
import { RedditSections } from "./RedditSection.tsx";
import type { SettingsLoad } from "./settings-load-types.ts";
import { SignOutSection } from "./SignOutSection.tsx";
import { TokensSection } from "./TokensSection.tsx";
import { useXRefreshedByGrokBot } from "./use-x-refresh.ts";
import { X_SECTION } from "./XSection.tsx";

export function SettingsSections({
  loaded,
  signOut,
  signOutFailed,
}: Readonly<{ loaded: SettingsLoad; signOut: () => void; signOutFailed: boolean }>) {
  const { x, version, grokBot } = useXRefreshedByGrokBot(loaded.x);

  return (
    <>
      <SignOutSection signOut={signOut} failed={signOutFailed} />
      <PasswordSection />
      <LoadedSection {...AI_SECTION} initial={loaded.ai} />
      <LoadedSection key={version} {...X_SECTION} initial={x} />
      <LoadedSection {...GITHUB_SECTION} initial={loaded.github} />
      <LoadedSection {...grokBot} initial={loaded.grokBot} />
      <RedditSections loaded={loaded} />
      <TokensSection initial={loaded.tokens} />
    </>
  );
}
