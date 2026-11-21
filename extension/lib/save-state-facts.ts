import type { Tone } from "./page-look.ts";
import type { SaveState } from "./state.ts";
import { TEXT } from "./text.ts";

type SaveAction = "open-item" | "settings" | "retry" | "none";

type SavedState = Extract<SaveState, { readonly itemUrl: string }>;

type ActionOf<State extends SaveState> = State extends SavedState
  ? "open-item"
  : Exclude<SaveAction, "open-item">;

interface SaveStateFacts<Action extends SaveAction> {
  readonly text: string;
  readonly tone: Tone;
  readonly badge: string;
  readonly action: Action;
}

type SaveStateTable = {
  readonly [Kind in SaveState["kind"]]: SaveStateFacts<
    ActionOf<Extract<SaveState, { kind: Kind }>>
  >;
};

function notSaved<Action extends Exclude<SaveAction, "open-item">>(
  text: string,
  action: Action,
): SaveStateFacts<Action> {
  return { text, tone: "warn", badge: TEXT.badgeNotSaved, action };
}

function savedWithWarning(text: string): SaveStateFacts<"open-item"> {
  return { text, tone: "warn", badge: TEXT.badgeSaved, action: "open-item" };
}

export const SAVE_STATE_FACTS = {
  saving: { text: TEXT.saving, tone: "plain", badge: "", action: "none" },
  saved: { text: TEXT.saved, tone: "ok", badge: TEXT.badgeSaved, action: "open-item" },
  "saved-incomplete": savedWithWarning(TEXT.savedIncomplete),
  "saved-page": savedWithWarning(TEXT.savedPage),
  "not-configured": notSaved(TEXT.notConfigured, "settings"),
  "access-missing": notSaved(TEXT.accessMissing, "settings"),
  "page-blocked": notSaved(TEXT.pageBlocked, "retry"),
  "token-refused": notSaved(TEXT.tokenRefused, "settings"),
  "scope-refused": notSaved(TEXT.scopeRefused, "settings"),
  "too-large": notSaved(TEXT.tooLarge, "retry"),
  "private-link": notSaved(TEXT.privateLink, "retry"),
  "unsupported-link": notSaved(TEXT.unsupportedLink, "retry"),
  "thread-kept": notSaved(TEXT.threadKept, "none"),
  "budget-spent": notSaved(TEXT.budgetSpent, "none"),
  unreachable: notSaved(TEXT.unreachable, "retry"),
  failed: notSaved(TEXT.failed, "retry"),
} satisfies SaveStateTable;

export function opensItem(state: Readonly<SaveState>): state is Readonly<SavedState> {
  return SAVE_STATE_FACTS[state.kind].action === "open-item";
}
