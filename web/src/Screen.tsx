import type { Route } from "./routing.ts";
import { type ScreenState, isSignedInScreen } from "./screens.ts";
import { SetupScreen } from "./SetupScreen.tsx";
import { SignedInScreen } from "./SignedInScreen.tsx";
import { SignedOutScreen } from "./SignedOutScreen.tsx";
import { Unreachable } from "./Unreachable.tsx";
import type { Look } from "./use-root.ts";

interface SessionActions {
  readonly refresh: () => void;
  readonly signedIn: () => void;
  readonly loggedOut: () => void;
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
  const { refresh, signedIn } = session;
  const { navigate } = route;

  if (isSignedInScreen(screen)) {
    return (
      <SignedInScreen
        screen={screen}
        look={look}
        arrived={arrived}
        route={route}
        loggedOut={session.loggedOut}
      />
    );
  }

  switch (screen.name) {
    case "setup":
      return <SetupScreen problem={screen.problem} refresh={refresh} signedIn={signedIn} />;
    case "login":
    case "reset":
      return <SignedOutScreen name={screen.name} signedIn={signedIn} navigate={navigate} />;
    case "unreachable":
      return <Unreachable retry={refresh} />;
    case "loading":
      return null;
    default:
      return screen satisfies never;
  }
}
