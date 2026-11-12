import { useCallback, useId, useRef } from "react";

import type { Token } from "../../src/http/schemas.ts";
import { SETTINGS } from "./access-text.ts";
import { ageLabel } from "./saved-label.ts";
import { SCOPE_NAMES } from "./ScopePicker.tsx";
import { filled } from "./text.ts";
import { useEscape, useFocusOnMount } from "./use-form.ts";

export interface RowActions {
  readonly ask: (id: number) => void;
  readonly cancel: (id: number) => void;
  readonly revoke: (id: number) => Promise<void>;
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

  return `${created} · ${used} · ${scopes}`;
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

function useRowActions(id: number, { ask, cancel, revoke }: Readonly<RowActions>) {
  const askThis = useCallback(() => {
    ask(id);
  }, [ask, id]);

  const cancelThis = useCallback(() => {
    cancel(id);
  }, [cancel, id]);

  const revokeThis = useCallback(() => {
    void revoke(id);
  }, [revoke, id]);

  return { askThis, cancelThis, revokeThis };
}

export function TokenRow({
  token,
  asking,
  revoking,
  focusRevoke,
  actions,
}: Readonly<{
  token: Token;
  asking: boolean;
  revoking: boolean;
  focusRevoke: boolean;
  actions: RowActions;
}>) {
  const { id } = token;
  const revokeButton = useRef<HTMLButtonElement>(null);
  useFocusOnMount(revokeButton, focusRevoke && !asking);
  const { askThis, cancelThis, revokeThis } = useRowActions(id, actions);

  return (
    <li className="tok">
      <div className="tok-main">
        <p className="tok-name">{token.name}</p>
        <p className="tok-meta">{metaOf(token)}</p>
      </div>
      {asking ? (
        <Confirm token={token} revoking={revoking} cancel={cancelThis} revoke={revokeThis} />
      ) : (
        <button
          type="button"
          ref={revokeButton}
          className="btn"
          aria-label={filled(SETTINGS.revokeNamed, { name: token.name })}
          onClick={askThis}
        >
          {SETTINGS.revoke}
        </button>
      )}
    </li>
  );
}
