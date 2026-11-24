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
  readonly readsReddit: boolean;
}

type SaveStateTable = {
  readonly [Kind in SaveState["kind"]]: SaveStateFacts<
    ActionOf<Extract<SaveState, { kind: Kind }>>
  >;
};

function notSaved<Action extends Exclude<SaveAction, "open-item">>(
  text: string,
  action: Action,
  readsReddit: boolean,
): SaveStateFacts<Action> {
  return { text, tone: "warn", badge: TEXT.badgeNotSaved, action, readsReddit };
}

function savedWithWarning(text: string): SaveStateFacts<"open-item"> {
  return { text, tone: "warn", badge: TEXT.badgeSaved, action: "open-item", readsReddit: true };
}

export const SAVE_STATE_FACTS = {
  saving: { text: TEXT.saving, tone: "plain", badge: "", action: "none", readsReddit: false },
  saved: {
    text: TEXT.saved,
    tone: "ok",
    badge: TEXT.badgeSaved,
    action: "open-item",
    readsReddit: true,
  },
  "saved-incomplete": savedWithWarning(TEXT.savedIncomplete),
  "saved-page": savedWithWarning(TEXT.savedPage),
  "not-configured": notSaved(TEXT.notConfigured, "settings", false),
  "access-missing": notSaved(TEXT.accessMissing, "settings", false),
  "page-blocked": notSaved(TEXT.pageBlocked, "retry", true),
  "token-refused": notSaved(TEXT.tokenRefused, "settings", false),
  "scope-refused": notSaved(TEXT.scopeRefused, "settings", true),
  "too-large": notSaved(TEXT.tooLarge, "retry", true),
  "private-link": notSaved(TEXT.privateLink, "retry", true),
  "unsupported-link": notSaved(TEXT.unsupportedLink, "retry", true),
  "thread-kept": notSaved(TEXT.threadKept, "none", true),
  "budget-spent": notSaved(TEXT.budgetSpent, "none", true),
  unreachable: notSaved(TEXT.unreachable, "retry", false),
  failed: notSaved(TEXT.failed, "retry", true),
} satisfies SaveStateTable;

export function leavesRedditUnknown({ kind }: Readonly<SaveState>): boolean {
  return SAVE_STATE_FACTS[kind].readsReddit;
}

export function opensItem(state: Readonly<SaveState>): state is Readonly<SavedState> {
  return SAVE_STATE_FACTS[state.kind].action === "open-item";
}
