import { useCallback } from "react";

import { Library, type Look } from "./Library.tsx";
import { LoginScreen } from "./LoginScreen.tsx";
import { SettingsPage } from "./SettingsPage.tsx";
import { SetupScreen } from "./SetupScreen.tsx";
import { Unreachable } from "./Unreachable.tsx";
import type { View } from "./use-session-view.ts";

export const SETTINGS_PATH = "/settings";

export function Screen({
  view,
  path,
  look,
  refresh,
  navigate,
}: Readonly<{
  view: View;
  path: string;
  look: Look;
  refresh: () => void;
  navigate: (to: string) => void;
}>) {
  const toLibrary = useCallback(() => {
    navigate("/");
  }, [navigate]);

  const toSettings = useCallback(() => {
    navigate(SETTINGS_PATH);
  }, [navigate]);

  const signedOut = useCallback(() => {
    navigate("/");
    refresh();
  }, [navigate, refresh]);

  switch (view) {
    case "setup":
      return <SetupScreen refresh={refresh} />;
    case "signed-out":
      return <LoginScreen refresh={refresh} />;
    case "unreachable":
      return <Unreachable retry={refresh} />;
    case "signed-in":
      return path === SETTINGS_PATH ? (
        <SettingsPage back={toLibrary} signedOut={signedOut} />
      ) : (
        <Library look={look} openSettings={toSettings} />
      );
    case "loading":
      return null;
    default:
      return view satisfies never;
  }
}
