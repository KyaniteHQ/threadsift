import { AI_SECTION } from "./AiSection.tsx";
import { GITHUB_SECTION } from "./GithubSection.tsx";
import { GROK_BOT_SECTION } from "./GrokBotSection.tsx";
import { LoadedSection } from "./LoadedSection.tsx";
import { PasswordSection } from "./PasswordSection.tsx";
import { RedditSections } from "./RedditSection.tsx";
import type { SettingsLoad } from "./settings-load-types.ts";
import { SignOutSection } from "./SignOutSection.tsx";
import { TokensSection } from "./TokensSection.tsx";
import { X_SECTION } from "./XSection.tsx";

export function SettingsSections({
  loaded,
  signOut,
  signOutFailed,
}: Readonly<{ loaded: SettingsLoad; signOut: () => void; signOutFailed: boolean }>) {
  return (
    <>
      <LoadedSection {...AI_SECTION} initial={loaded.ai} />
      <LoadedSection {...X_SECTION} initial={loaded.x} />
      <LoadedSection {...GITHUB_SECTION} initial={loaded.github} />
      <LoadedSection {...GROK_BOT_SECTION} initial={loaded.grokBot} />
      <RedditSections loaded={loaded} />
      <TokensSection initial={loaded.tokens} />
      <PasswordSection />
      <SignOutSection signOut={signOut} failed={signOutFailed} />
    </>
  );
}
