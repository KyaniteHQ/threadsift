import { useCallback } from "react";

import { Library, type Look } from "./Library.tsx";
import { LoginScreen } from "./LoginScreen.tsx";
import type { ScreenState } from "./screens.ts";
import { SETTINGS_PATH } from "./session.ts";
import { SettingsPage } from "./SettingsPage.tsx";
import { SetupScreen } from "./SetupScreen.tsx";
import { Unreachable } from "./Unreachable.tsx";

export interface SessionActions {
  readonly refresh: () => void;
  readonly signedIn: () => void;
  readonly signedOut: () => void;
}

export function Screen({
  screen,
  look,
  arrived,
  session,
  navigate,
}: Readonly<{
  screen: ScreenState;
  look: Look;
  arrived: boolean;
  session: SessionActions;
  navigate: (to: string) => void;
}>) {
  const { refresh, signedIn, signedOut } = session;

  const toLibrary = useCallback(() => {
    navigate("/");
  }, [navigate]);

  const toSettings = useCallback(() => {
    navigate(SETTINGS_PATH);
  }, [navigate]);

  const leave = useCallback(() => {
    navigate("/");
    signedOut();
  }, [navigate, signedOut]);

  switch (screen.name) {
    case "setup":
      return <SetupScreen problem={screen.problem} refresh={refresh} signedIn={signedIn} />;
    case "login":
      return <LoginScreen signedIn={signedIn} />;
    case "unreachable":
      return <Unreachable retry={refresh} />;
    case "settings":
      return <SettingsPage back={toLibrary} signedOut={leave} />;
    case "library":
      return <Library look={look} arrived={arrived} openSettings={toSettings} />;
    case "loading":
      return null;
    default:
      return screen satisfies never;
  }
}
