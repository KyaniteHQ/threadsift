import { useCallback } from "react";

import { HighlightsPage } from "./HighlightsPage.tsx";
import { Library } from "./Library.tsx";
import { type Route, usePages } from "./routing.ts";
import type { SignedInState } from "./screens.ts";
import { SettingsPage } from "./SettingsPage.tsx";
import { TopicPage } from "./TopicPage.tsx";
import type { Look } from "./use-root.ts";

export function SignedInScreen({
  screen,
  look,
  arrived,
  route,
  signedOut,
}: Readonly<{
  screen: SignedInState;
  look: Look;
  arrived: boolean;
  route: Route;
  signedOut: () => void;
}>) {
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
    case "settings":
      return <SettingsPage back={toLibrary} signedOut={leave} />;
    case "highlights":
      return <HighlightsPage look={look} route={route} back={toLibrary} />;
    case "topic":
      return <TopicPage key={screen.key} topicKey={screen.key} route={route} back={toLibrary} />;
    case "library":
      return <Library look={look} arrived={arrived} route={route} pages={pages} />;
    default:
      return screen satisfies never;
  }
}
