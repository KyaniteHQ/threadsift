import { useCallback, useState } from "react";

import { LoginScreen } from "./LoginScreen.tsx";
import { ResetScreen } from "./ResetScreen.tsx";
import { RESET_PATH } from "./routing.ts";

export function SignedOutScreen({
  name,
  signedIn,
  navigate,
}: Readonly<{
  name: "login" | "reset";
  signedIn: () => void;
  navigate: (to: string) => void;
}>) {
  const [justReset, setJustReset] = useState(false);

  const openReset = useCallback(() => {
    navigate(RESET_PATH);
  }, [navigate]);

  const toLogin = useCallback(() => {
    navigate("/");
  }, [navigate]);

  const resetDone = useCallback(() => {
    setJustReset(true);
    toLogin();
  }, [toLogin]);

  return name === "reset" ? (
    <ResetScreen done={resetDone} back={toLogin} />
  ) : (
    <LoginScreen signedIn={signedIn} reset={justReset} openReset={openReset} />
  );
}
