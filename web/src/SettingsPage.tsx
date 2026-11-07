import { useCallback, useRef, useState } from "react";

import { logOut } from "./access-api.ts";
import { SETTINGS } from "./access-text.ts";
import { AiSection } from "./AiSection.tsx";
import { Alert } from "./Alert.tsx";
import { GithubSection } from "./GithubSection.tsx";
import { PasswordSection } from "./PasswordSection.tsx";
import { useInternalLink } from "./routing.ts";
import { TokensSection } from "./TokensSection.tsx";
import { useFocusOnMount } from "./use-form.ts";

export function SettingsPage({
  back,
  signedOut,
}: Readonly<{ back: () => void; signedOut: () => void }>) {
  const titleField = useRef<HTMLHeadingElement>(null);

  useFocusOnMount(titleField);

  const follow = useInternalLink(back);

  const [failed, setFailed] = useState(false);

  const signOut = useCallback(() => {
    setFailed(false);
    logOut().then(signedOut, () => {
      setFailed(true);
    });
  }, [signedOut]);

  return (
    <div className="pg">
      <header className="pg-bar">
        <div className="pg-bar-in">
          <a className="btn" href="/" onClick={follow}>
            {SETTINGS.back}
          </a>
          <h1 ref={titleField} className="pg-title" tabIndex={-1}>
            {SETTINGS.title}
          </h1>
        </div>
      </header>
      <main className="pg-col">
        <AiSection />
        <GithubSection />
        <TokensSection />
        <PasswordSection />
        <section className="sec" aria-labelledby="sign-out-title">
          <h2 id="sign-out-title" className="rd-h">
            {SETTINGS.signOutTitle}
          </h2>
          <p>{SETTINGS.signOutNote}</p>
          <button type="button" className="btn btn-block" onClick={signOut}>
            {SETTINGS.signOut}
          </button>
          <Alert text={failed ? SETTINGS.signOutFailed : null} />
        </section>
      </main>
    </div>
  );
}
