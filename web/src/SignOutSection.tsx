import { useCallback, useState } from "react";

import { logOut } from "./access-api.ts";
import { SETTINGS } from "./access-text.ts";
import { Alert } from "./Alert.tsx";

export function SignOutSection({ loggedOut }: Readonly<{ loggedOut: () => void }>) {
  const [failed, setFailed] = useState(false);

  const signOut = useCallback(() => {
    setFailed(false);
    logOut().then(loggedOut, () => {
      setFailed(true);
    });
  }, [loggedOut]);

  return (
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
  );
}
