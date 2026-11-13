import { SETTINGS } from "./access-text.ts";
import { AI_SECTION } from "./AiSection.tsx";
import { Alert } from "./Alert.tsx";
import { GITHUB_SECTION } from "./GithubSection.tsx";
import { GROK_BOT_SECTION } from "./GrokBotSection.tsx";
import { LoadedSection } from "./LoadedSection.tsx";
import { PasswordSection } from "./PasswordSection.tsx";
import { RedditSections } from "./RedditSection.tsx";
import type { SettingsLoad } from "./settings-load-types.ts";
import { TokensSection } from "./TokensSection.tsx";

export function SettingsSections({
  loaded,
  signOut,
  signOutFailed,
}: Readonly<{ loaded: SettingsLoad; signOut: () => void; signOutFailed: boolean }>) {
  return (
    <>
      <LoadedSection {...AI_SECTION} initial={loaded.ai} />
      <LoadedSection {...GITHUB_SECTION} initial={loaded.github} />
      <LoadedSection {...GROK_BOT_SECTION} initial={loaded.grokBot} />
      <RedditSections loaded={loaded} />
      <TokensSection initial={loaded.tokens} />
      <PasswordSection />
      <section className="sec" aria-labelledby="sign-out-title">
        <h2 id="sign-out-title" className="rd-h">
          {SETTINGS.signOutTitle}
        </h2>
        <p>{SETTINGS.signOutNote}</p>
        <button type="button" className="btn btn-block" onClick={signOut}>
          {SETTINGS.signOut}
        </button>
        <Alert text={signOutFailed ? SETTINGS.signOutFailed : null} />
      </section>
    </>
  );
}
