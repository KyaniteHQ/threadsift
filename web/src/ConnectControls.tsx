import type { ConnectNotice as Notice } from "../../src/core/openrouter-contract.ts";
import type { AiView } from "./ai-api.ts";
import { AI_TEXT } from "./ai-text.ts";
import { Alert } from "./Alert.tsx";

export function ConnectNotes({ view }: Readonly<{ view: AiView }>) {
  return (
    <p className="fld-help">{view.connect ? AI_TEXT.connectHelp : AI_TEXT.connectUnavailable}</p>
  );
}

const FAILURE_TEXT = {
  incomplete: AI_TEXT.connectIncomplete,
  "settings-changed": AI_TEXT.connectSettingsChanged,
  "possible-orphan": AI_TEXT.connectPossibleOrphan,
} as const;

function holdsOpenRouterKey({ settings }: Readonly<AiView>): boolean {
  return (
    settings !== null &&
    settings.provider === "openrouter" &&
    "keySet" in settings &&
    settings.keySet
  );
}

export function ConnectNotice({ view, notice }: Readonly<{ view: AiView; notice: Notice | null }>) {
  if (notice === null) return null;

  if (notice === "connected" && holdsOpenRouterKey(view))
    return <output>{AI_TEXT.connected}</output>;

  if (notice === "activation-pending" && holdsOpenRouterKey(view))
    return <output>{AI_TEXT.connectActivationPending}</output>;

  return (
    <Alert
      text={
        FAILURE_TEXT[
          notice === "connected" || notice === "activation-pending" ? "incomplete" : notice
        ]
      }
    />
  );
}
