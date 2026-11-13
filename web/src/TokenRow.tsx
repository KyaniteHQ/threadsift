import { type RefObject, useCallback, useId, useRef } from "react";

import type { Token } from "../../src/http/schemas.ts";
import { SETTINGS } from "./access-text.ts";
import { BudgetEdit } from "./BudgetEdit.tsx";
import { ageLabel } from "./saved-label.ts";
import { SCOPE_NAMES } from "./ScopePicker.tsx";
import { filled } from "./text.ts";
import type { RowBudget } from "./token-budget.ts";
import { useEscape, useFocusOnMount } from "./use-form.ts";

interface RowActions {
  readonly ask: (id: number) => void;
  readonly cancel: (id: number) => void;
  readonly revoke: (id: number) => Promise<void>;
  readonly editBudget: (id: number) => void;
  readonly cancelBudget: (id: number) => void;
  readonly saveBudget: (id: number, dailyBudget: number | null) => Promise<void>;
}

function budgetMeta({ budget }: Token): string {
  return budget.kind === "unlimited"
    ? filled(SETTINGS.budgetUsedUnlimited, { added: String(budget.added) })
    : filled(SETTINGS.budgetUsed, { added: String(budget.added), limit: String(budget.limit) });
}

function metaOf(token: Token): string {
  const now = Date.now();
  const created = filled(SETTINGS.created, { when: ageLabel(token.createdAt, now) });

  const used =
    token.lastUsedAt === null
      ? SETTINGS.neverUsed
      : filled(SETTINGS.lastUsed, { when: ageLabel(token.lastUsedAt, now) });

  const scopes = filled(SETTINGS.scopesMeta, {
    scopes:
      token.scopes.length === 0
        ? SETTINGS.scopesNone
        : token.scopes.map((scope) => SCOPE_NAMES[scope]).join(", "),
  });

  return `${created} · ${used} · ${scopes} · ${budgetMeta(token)}`;
}

function Confirm({
  token,
  revoking,
  cancel,
  revoke,
}: Readonly<{ token: Token; revoking: boolean; cancel: () => void; revoke: () => void }>) {
  const cancelButton = useRef<HTMLButtonElement>(null);
  const questionId = useId();
  useFocusOnMount(cancelButton);

  useEscape(cancel);

  return (
    <fieldset className="tok-ask" aria-labelledby={questionId}>
      <p id={questionId}>{filled(SETTINGS.revokeAsk, { name: token.name })}</p>
      <p className="tok-effect">{SETTINGS.revokeEffect}</p>
      <button
        type="button"
        className="btn btn-danger"
        aria-disabled={revoking ? true : undefined}
        onClick={revoke}
      >
        {SETTINGS.revokeConfirm}
      </button>
      <button ref={cancelButton} type="button" className="btn" onClick={cancel}>
        {SETTINGS.cancel}
      </button>
    </fieldset>
  );
}

function useRowActions(
  id: number,
  { ask, cancel, revoke, editBudget, cancelBudget, saveBudget }: Readonly<RowActions>,
) {
  const askThis = useCallback(() => {
    ask(id);
  }, [ask, id]);

  const cancelThis = useCallback(() => {
    cancel(id);
  }, [cancel, id]);

  const revokeThis = useCallback(() => {
    void revoke(id);
  }, [revoke, id]);

  const editThis = useCallback(() => {
    editBudget(id);
  }, [editBudget, id]);

  const cancelBudgetOfThis = useCallback(() => {
    cancelBudget(id);
  }, [cancelBudget, id]);

  const saveBudgetOfThis = useCallback(
    (dailyBudget: number | null) => {
      void saveBudget(id, dailyBudget);
    },
    [saveBudget, id],
  );

  return { askThis, cancelThis, revokeThis, editThis, cancelBudgetOfThis, saveBudgetOfThis };
}

function useRowFocus(revoke: boolean, budget: boolean) {
  const budgetButton = useRef<HTMLButtonElement>(null);
  const revokeButton = useRef<HTMLButtonElement>(null);
  useFocusOnMount(revokeButton, revoke);
  useFocusOnMount(budgetButton, budget);

  return { budgetButton, revokeButton };
}

function Controls({
  token,
  edit,
  ask,
  budgetRef,
  revokeRef,
}: Readonly<{
  token: Token;
  edit: () => void;
  ask: () => void;
  budgetRef: RefObject<HTMLButtonElement | null>;
  revokeRef: RefObject<HTMLButtonElement | null>;
}>) {
  return (
    <div className="ai-actions">
      <button
        type="button"
        ref={budgetRef}
        className="btn"
        aria-label={filled(SETTINGS.budgetChangeNamed, { name: token.name })}
        onClick={edit}
      >
        {SETTINGS.budgetChange}
      </button>
      <button
        type="button"
        ref={revokeRef}
        className="btn"
        aria-label={filled(SETTINGS.revokeNamed, { name: token.name })}
        onClick={ask}
      >
        {SETTINGS.revoke}
      </button>
    </div>
  );
}

function Aside({
  token,
  asking,
  revoking,
  budget,
  actions,
  budgetRef,
  revokeRef,
}: Readonly<{
  token: Token;
  asking: boolean;
  revoking: boolean;
  budget: RowBudget;
  actions: RowActions;
  budgetRef: RefObject<HTMLButtonElement | null>;
  revokeRef: RefObject<HTMLButtonElement | null>;
}>) {
  const { askThis, cancelThis, revokeThis, editThis, cancelBudgetOfThis, saveBudgetOfThis } =
    useRowActions(token.id, actions);

  if (asking) {
    return <Confirm token={token} revoking={revoking} cancel={cancelThis} revoke={revokeThis} />;
  }

  return budget === "idle" ? (
    <Controls
      token={token}
      edit={editThis}
      ask={askThis}
      budgetRef={budgetRef}
      revokeRef={revokeRef}
    />
  ) : (
    <BudgetEdit
      token={token}
      saving={budget === "saving"}
      failed={budget === "failed"}
      save={saveBudgetOfThis}
      cancel={cancelBudgetOfThis}
    />
  );
}

export function TokenRow({
  token,
  asking,
  revoking,
  focusRevoke,
  focusBudget,
  budget,
  actions,
}: Readonly<{
  token: Token;
  asking: boolean;
  revoking: boolean;
  focusRevoke: boolean;
  focusBudget: boolean;
  budget: RowBudget;
  actions: RowActions;
}>) {
  const { budgetButton, revokeButton } = useRowFocus(
    focusRevoke && !asking,
    focusBudget && budget === "idle",
  );

  return (
    <li className="tok">
      <div className="tok-main">
        <p className="tok-name">{token.name}</p>
        <p className="tok-meta">{metaOf(token)}</p>
        <output className="fld-err">
          {token.budget.kind === "spent" ? SETTINGS.budgetSpent : null}
        </output>
      </div>
      <Aside
        token={token}
        asking={asking}
        revoking={revoking}
        budget={budget}
        actions={actions}
        budgetRef={budgetButton}
        revokeRef={revokeButton}
      />
    </li>
  );
}
