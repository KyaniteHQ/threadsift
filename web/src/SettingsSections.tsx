import { SETTINGS } from "./access-text.ts";
import { AiSection } from "./AiSection.tsx";
import { Alert } from "./Alert.tsx";
import { GithubSection } from "./GithubSection.tsx";
import { PasswordSection } from "./PasswordSection.tsx";
import { TokensSection } from "./TokensSection.tsx";
import type { SettingsLoad } from "./use-settings-load.ts";

export function SettingsSections({
  loaded,
  signOut,
  signOutFailed,
}: Readonly<{ loaded: SettingsLoad; signOut: () => void; signOutFailed: boolean }>) {
  return (
    <>
      <AiSection initial={loaded.ai} />
      <GithubSection initial={loaded.github} />
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
