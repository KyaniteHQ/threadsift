import { browser } from "wxt/browser";

import { applyLook, element } from "../../lib/page-look.ts";
import { SAVE_PORT, type SaveState, SaveStateSchema, ask } from "../../lib/state.ts";
import { TEXT } from "../../lib/text.ts";

type Failure = Exclude<SaveState["kind"], "saving" | "saved">;

const FAILURE_TEXT: Readonly<Record<Failure, string>> = {
  "not-configured": TEXT.notConfigured,
  "access-missing": TEXT.accessMissing,
  "page-blocked": TEXT.pageBlocked,
  "token-refused": TEXT.tokenRefused,
  "scope-refused": TEXT.scopeRefused,
  "too-large": TEXT.tooLarge,
  "private-link": TEXT.privateLink,
  "unsupported-link": TEXT.unsupportedLink,
  "thread-kept": TEXT.threadKept,
  updating: TEXT.updating,
  unreachable: TEXT.unreachable,
  failed: TEXT.failed,
};

const NEEDS_SETTINGS: ReadonlySet<SaveState["kind"]> = new Set([
  "not-configured",
  "access-missing",
  "token-refused",
  "scope-refused",
]);

const root = document.querySelector("#root");

if (root === null) throw new Error("the popup has no root element");

function button(label: string, onClick: () => void): HTMLButtonElement {
  const created = element("button", { type: "button", class: "btn btn-acc" }, label);
  created.addEventListener("click", onClick);

  return created;
}

function status(text: string, tone: "ok" | "warn" | "plain"): HTMLParagraphElement {
  return element("p", { class: "ext-status", role: "status", "data-tone": tone }, text);
}

function actions(state: Readonly<SaveState>): HTMLElement[] {
  if (state.kind === "saved") {
    return [
      element(
        "a",
        { class: "btn btn-acc", href: state.itemUrl, target: "_blank", rel: "noreferrer" },
        TEXT.openItem,
      ),
    ];
  }

  if (state.kind === "saving" || state.kind === "thread-kept") return [];

  return NEEDS_SETTINGS.has(state.kind)
    ? [button(TEXT.openSettings, () => void browser.runtime.openOptionsPage())]
    : [button(TEXT.tryAgain, () => void save())];
}

function messageOf(state: Readonly<SaveState>): HTMLParagraphElement {
  if (state.kind === "saving") return status(TEXT.saving, "plain");

  if (state.kind === "saved") return status(TEXT.saved, "ok");

  return status(FAILURE_TEXT[state.kind], "warn");
}

function show(state: Readonly<SaveState>): void {
  root?.replaceChildren(
    element("h1", {}, "Threadsift"),
    messageOf(state),
    element("div", { class: "ext-actions" }, ...actions(state)),
  );
}

async function save(): Promise<void> {
  show({ kind: "saving" });

  try {
    show(await ask(SAVE_PORT, SaveStateSchema));
  } catch {
    show({ kind: "failed" });
  }
}

applyLook();

void save();
