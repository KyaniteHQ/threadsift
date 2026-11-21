import { useCallback } from "react";

import { HighlightsPage } from "./HighlightsPage.tsx";
import { IndexPage } from "./IndexPage.tsx";
import { ImportPage, SettingsPage, LogPage, ProposalsPage, ObsidianPage } from "./lazy-pages.tsx";
import { Library } from "./Library.tsx";
import { ModuleBoundary } from "./ModuleBoundary.tsx";
import type { Route } from "./routing.ts";
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

  const leave = useCallback(() => {
    navigate("/");
    loggedOut();
  }, [navigate, loggedOut]);

  switch (screen.name) {
    case "obsidian":
      return <ObsidianPage />;
    case "settings":
      return <SettingsPage loggedOut={leave} />;
    case "highlights":
      return <HighlightsPage look={look} />;
    case "import":
      return <ImportPage />;
    case "index":
      return <IndexPage />;
    case "log":
      return <LogPage />;
    case "proposals":
      return <ProposalsPage />;
    case "topic":
      return <TopicPage key={screen.key} topicKey={screen.key} route={route} />;
    case "library":
      return <Library look={look} arrived={arrived} route={route} />;
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
