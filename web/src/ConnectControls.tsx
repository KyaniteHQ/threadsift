import { useEffect, useState } from "react";

import {
  ConnectNoticeSchema,
  NOTICE_PARAMETER,
  type ConnectNotice as Notice,
} from "../../src/core/openrouter-contract.ts";
import type { AiView } from "./ai-api.ts";
import { AI_TEXT } from "./ai-text.ts";
import { Alert } from "./Alert.tsx";
import { SwapButton } from "./SwapButton.tsx";
import type { Connection } from "./use-connect.ts";

export function ConnectButton({
  view,
  connection,
  blocked,
}: Readonly<{ view: AiView; connection: Connection; blocked: boolean }>) {
  return view.connect ? (
    <SwapButton
      label={AI_TEXT.connect}
      busyLabel={AI_TEXT.connecting}
      busy={connection.leaving}
      blocked={blocked || !view.secretReady}
      type="button"
      onClick={connection.connect}
      secondary
    />
  ) : null;
}

export function ConnectNotes({
  view,
  connection,
}: Readonly<{ view: AiView; connection: Connection }>) {
  return (
    <>
      <p className="fld-help">{view.connect ? AI_TEXT.connectHelp : AI_TEXT.connectUnavailable}</p>
      <Alert text={connection.failure} />
    </>
  );
}

const FAILURE_TEXT = {
  incomplete: AI_TEXT.connectIncomplete,
  "settings-changed": AI_TEXT.connectSettingsChanged,
  "possible-orphan": AI_TEXT.connectPossibleOrphan,
} as const;

function noticeOf(search: string): Notice | null {
  const parsed = ConnectNoticeSchema.safeParse(new URLSearchParams(search).get(NOTICE_PARAMETER));

  return parsed.success ? parsed.data : null;
}

function holdsOpenRouterKey({ settings }: Readonly<AiView>): boolean {
  return (
    settings !== null &&
    settings.provider === "openrouter" &&
    "keySet" in settings &&
    settings.keySet
  );
}

export function ConnectNotice({ view }: Readonly<{ view: AiView }>) {
  const [notice] = useState(() => noticeOf(window.location.search));

  useEffect(() => {
    if (notice !== null) {
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, [notice]);

  if (notice === null) return null;

  if (notice === "connected" && holdsOpenRouterKey(view))
    return <output>{AI_TEXT.connected}</output>;

  return <Alert text={FAILURE_TEXT[notice === "connected" ? "incomplete" : notice]} />;
}
