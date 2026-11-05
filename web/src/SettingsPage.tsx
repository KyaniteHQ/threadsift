import { useCallback, useEffect, useRef } from "react";

import { logOut } from "./access-api.ts";
import { SETTINGS } from "./access-text.ts";
import { TokensSection } from "./TokensSection.tsx";

export function SettingsPage({
  back,
  signedOut,
}: Readonly<{ back: () => void; signedOut: () => void }>) {
  const titleField = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    titleField.current?.focus();
  }, []);

  const signOut = useCallback(() => {
    void logOut().then(signedOut);
  }, [signedOut]);

  return (
    <div className="pg">
      <header className="pg-bar">
        <button type="button" className="btn" onClick={back}>
          {SETTINGS.back}
        </button>
        <h1 ref={titleField} className="pg-title" tabIndex={-1}>
          {SETTINGS.title}
        </h1>
      </header>
      <main className="pg-col">
        <TokensSection />
        <section className="sec" aria-labelledby="sign-out-title">
          <h2 id="sign-out-title" className="rd-h">
            {SETTINGS.signOutTitle}
          </h2>
          <p>{SETTINGS.signOutNote}</p>
          <div>
            <button type="button" className="btn" onClick={signOut}>
              {SETTINGS.signOut}
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}
