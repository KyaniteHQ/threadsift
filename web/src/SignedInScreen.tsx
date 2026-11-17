import { useCallback } from "react";

import { HighlightsPage } from "./HighlightsPage.tsx";
import { IndexPage } from "./IndexPage.tsx";
import { ImportPage, SettingsPage, LogPage, ProposalsPage } from "./lazy-pages.tsx";
import { Library } from "./Library.tsx";
import { ModuleBoundary } from "./ModuleBoundary.tsx";
import { ObsidianPage } from "./ObsidianPage.tsx";
import { type Route, usePages } from "./routing.ts";
import type { SignedInState } from "./screens.ts";
import { TopicPage } from "./TopicPage.tsx";
import type { Look } from "./use-root.ts";

function SignedInContent({
  screen,
  look,
  arrived,
  route,
  loggedOut,
}: Readonly<{
  screen: SignedInState;
  look: Look;
  arrived: boolean;
  route: Route;
  loggedOut: () => void;
}>) {
  const { navigate } = route;

  const toLibrary = useCallback(() => {
    navigate("/");
  }, [navigate]);

  const pages = usePages(navigate);

  const leave = useCallback(() => {
    navigate("/");
    loggedOut();
  }, [navigate, loggedOut]);

  switch (screen.name) {
    case "obsidian":
      return <ObsidianPage back={toLibrary} />;
    case "settings":
      return <SettingsPage back={toLibrary} loggedOut={leave} />;
    case "highlights":
      return <HighlightsPage look={look} route={route} back={toLibrary} />;
    case "import":
      return <ImportPage pages={pages} back={toLibrary} />;
    case "index":
      return <IndexPage pages={pages} back={toLibrary} />;
    case "log":
      return <LogPage pages={pages} back={toLibrary} />;
    case "proposals":
      return <ProposalsPage pages={pages} back={toLibrary} />;
    case "topic":
      return <TopicPage key={screen.key} topicKey={screen.key} route={route} back={toLibrary} />;
    case "library":
      return <Library look={look} arrived={arrived} route={route} pages={pages} />;
    default:
      return screen satisfies never;
  }
}

export function SignedInScreen(props: Parameters<typeof SignedInContent>[0]) {
  return (
    <ModuleBoundary>
      <SignedInContent {...props} />
    </ModuleBoundary>
  );
}
