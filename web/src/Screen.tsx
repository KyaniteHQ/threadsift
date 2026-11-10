import { useCallback } from "react";

import { HighlightsPage } from "./HighlightsPage.tsx";
import { Library } from "./Library.tsx";
import { type Route, usePages } from "./routing.ts";
import type { ScreenState } from "./screens.ts";
import { SettingsPage } from "./SettingsPage.tsx";
import { SetupScreen } from "./SetupScreen.tsx";
import { SignedOutScreen } from "./SignedOutScreen.tsx";
import { Unreachable } from "./Unreachable.tsx";
import type { Look } from "./use-root.ts";

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
  route,
}: Readonly<{
  screen: ScreenState;
  look: Look;
  arrived: boolean;
  session: SessionActions;
  route: Route;
}>) {
  const { refresh, signedIn, signedOut } = session;
  const { navigate } = route;

  const toLibrary = useCallback(() => {
    navigate("/");
  }, [navigate]);

  const pages = usePages(navigate);

  const leave = useCallback(() => {
    navigate("/");
    signedOut();
  }, [navigate, signedOut]);

  switch (screen.name) {
    case "setup":
      return <SetupScreen problem={screen.problem} refresh={refresh} signedIn={signedIn} />;
    case "login":
    case "reset":
      return <SignedOutScreen name={screen.name} signedIn={signedIn} navigate={navigate} />;
    case "unreachable":
      return <Unreachable retry={refresh} />;
    case "settings":
      return <SettingsPage back={toLibrary} signedOut={leave} />;
    case "highlights":
      return <HighlightsPage look={look} route={route} back={toLibrary} />;
    case "library":
      return <Library look={look} arrived={arrived} route={route} pages={pages} />;
    case "loading":
      return null;
    default:
      return screen satisfies never;
  }
}
