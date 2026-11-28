import { useCallback, useMemo } from "react";

import { HighlightsPage } from "./HighlightsPage.tsx";
import { IndexPage } from "./IndexPage.tsx";
import { ImportPage, SettingsPage, LogPage, ProposalsPage, ObsidianPage } from "./lazy-pages.tsx";
import { Library } from "./Library.tsx";
import { ModuleBoundary } from "./ModuleBoundary.tsx";
import { LIBRARY_PATH, type Route } from "./routing.ts";
import type { SignedInState } from "./screens.ts";
import { type Place, ShellContext } from "./shell-context.ts";
import { TopicPage } from "./TopicPage.tsx";
import type { Look } from "./use-root.ts";

function placeOf(screen: SignedInState): Place | null {
  switch (screen.name) {
    case "library":
    case "highlights":
    case "index":
    case "log":
    case "proposals":
      return screen.name;
    case "topic":
      return "index";
    case "settings":
    case "obsidian":
    case "import":
      return null;
    default:
      return screen satisfies never;
  }
}

function SignedInContent({
  screen,
  look,
  arrived,
  route,
}: Readonly<{ screen: SignedInState; look: Look; arrived: boolean; route: Route }>) {
  switch (screen.name) {
    case "obsidian":
      return <ObsidianPage />;
    case "settings":
      return <SettingsPage />;
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

export function SignedInScreen({
  loggedOut,
  ...content
}: Readonly<Parameters<typeof SignedInContent>[0] & { loggedOut: () => void }>) {
  const { screen, look, route } = content;
  const { navigate, path } = route;

  const signOut = useCallback(() => {
    navigate(LIBRARY_PATH);
    loggedOut();
  }, [navigate, loggedOut]);

  const place = placeOf(screen);
  const shell = useMemo(() => ({ look, place, path, signOut }), [look, place, path, signOut]);

  return (
    <ShellContext value={shell}>
      <div className="frame">
        <ModuleBoundary>
          <SignedInContent {...content} />
        </ModuleBoundary>
      </div>
    </ShellContext>
  );
}
