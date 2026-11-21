import { useCallback, useState } from "react";

import { LoginScreen } from "./LoginScreen.tsx";
import { useNavigate } from "./navigate-context.ts";
import { ResetScreen } from "./ResetScreen.tsx";

export function SignedOutScreen({
  name,
  signedIn,
}: Readonly<{ name: "login" | "reset"; signedIn: () => void }>) {
  const navigate = useNavigate();
  const [justReset, setJustReset] = useState(false);

  const forgetReset = useCallback(() => {
    setJustReset(false);
  }, []);

  const resetDone = useCallback(() => {
    setJustReset(true);
    navigate("/");
  }, [navigate]);

  return name === "reset" ? (
    <ResetScreen done={resetDone} />
  ) : (
    <LoginScreen signedIn={signedIn} reset={justReset} forgetReset={forgetReset} />
  );
}
