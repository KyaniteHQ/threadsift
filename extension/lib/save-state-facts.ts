import type { Tone } from "./page-look.ts";
import type { SaveState } from "./state.ts";
import { TEXT } from "./text.ts";

type SaveAction = "open-item" | "settings" | "retry" | "none";

type SavedState = Extract<SaveState, { readonly itemUrl: string }>;

type StateOf<State, Kind> = State extends { readonly kind: infer Of }
  ? Kind extends Of
    ? State
    : never
  : never;

type ActionOf<State extends SaveState> = State extends SavedState
  ? "open-item"
  : Exclude<SaveAction, "open-item">;

interface SaveStateFacts<Action extends SaveAction> {
  readonly text: string;
  readonly tone: Tone;
  readonly badge: string;
  readonly action: Action;
  readonly leavesRedditUnknown: boolean;
}

type SaveStateTable = {
  readonly [Kind in SaveState["kind"]]: SaveStateFacts<ActionOf<StateOf<SaveState, Kind>>>;
};

function notSaved<Action extends Exclude<SaveAction, "open-item">>(
  text: string,
  action: Action,
  reddit: Readonly<Pick<SaveStateFacts<Action>, "leavesRedditUnknown">>,
): SaveStateFacts<Action> {
  return { text, tone: "warn", badge: TEXT.badgeNotSaved, action, ...reddit };
}

function savedWithWarning(text: string): SaveStateFacts<"open-item"> {
  return {
    text,
    tone: "warn",
    badge: TEXT.badgeSaved,
    action: "open-item",
    leavesRedditUnknown: true,
  };
}

export const SAVE_STATE_FACTS = {
  saving: {
    text: TEXT.saving,
    tone: "plain",
    badge: "",
    action: "none",
    leavesRedditUnknown: false,
  },
  saved: {
    text: TEXT.saved,
    tone: "ok",
    badge: TEXT.badgeSaved,
    action: "open-item",
    leavesRedditUnknown: true,
  },
  "saved-incomplete": savedWithWarning(TEXT.savedIncomplete),
  "saved-page": savedWithWarning(TEXT.savedPage),
  "not-configured": notSaved(TEXT.notConfigured, "settings", { leavesRedditUnknown: false }),
  "access-missing": notSaved(TEXT.accessMissing, "settings", { leavesRedditUnknown: false }),
  "page-blocked": notSaved(TEXT.pageBlocked, "retry", { leavesRedditUnknown: true }),
  "token-refused": notSaved(TEXT.tokenRefused, "settings", { leavesRedditUnknown: false }),
  "scope-refused": notSaved(TEXT.scopeRefused, "settings", { leavesRedditUnknown: true }),
  "too-large": notSaved(TEXT.tooLarge, "none", { leavesRedditUnknown: true }),
  "private-link": notSaved(TEXT.privateLink, "none", { leavesRedditUnknown: true }),
  "unsupported-link": notSaved(TEXT.unsupportedLink, "none", { leavesRedditUnknown: true }),
  "thread-kept": notSaved(TEXT.threadKept, "none", { leavesRedditUnknown: true }),
  "budget-spent": notSaved(TEXT.budgetSpent, "none", { leavesRedditUnknown: true }),
  "name-not-found": notSaved(TEXT.nameNotFound, "retry", { leavesRedditUnknown: false }),
  "connection-refused": notSaved(TEXT.connectionRefused, "retry", { leavesRedditUnknown: false }),
  "timed-out": notSaved(TEXT.timedOut, "retry", { leavesRedditUnknown: false }),
  "secure-connection-failed": notSaved(TEXT.secureConnection, "retry", {
    leavesRedditUnknown: false,
  }),
  unreachable: notSaved(TEXT.unreachable, "retry", { leavesRedditUnknown: false }),
  failed: notSaved(TEXT.failed, "retry", { leavesRedditUnknown: true }),
} satisfies SaveStateTable;

export function leavesRedditUnknown({ kind }: Readonly<SaveState>): boolean {
  return SAVE_STATE_FACTS[kind].leavesRedditUnknown;
}

export function opensItem(state: Readonly<SaveState>): state is Readonly<SavedState> {
  return SAVE_STATE_FACTS[state.kind].action === "open-item";
}
