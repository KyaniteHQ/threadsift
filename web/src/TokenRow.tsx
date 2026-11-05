import { useCallback, useEffect, useId, useRef } from "react";

import type { Token } from "../../src/http/schemas.ts";
import { SETTINGS, filled } from "./access-text.ts";
import { ageLabel } from "./saved-label.ts";

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

  return `${created} · ${used}`;
}

function Confirm({
  token,
  cancel,
  revoke,
}: Readonly<{ token: Token; cancel: () => void; revoke: () => void }>) {
  const cancelButton = useRef<HTMLButtonElement>(null);
  const questionId = useId();

  useEffect(() => {
    cancelButton.current?.focus();
  }, []);

  useEffect(() => {
    const onKeyDown = ({ key }: Readonly<{ key: string }>): void => {
      if (key === "Escape") {
        cancel();
      }
    };

    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [cancel]);

  return (
    <fieldset className="tok-ask" aria-labelledby={questionId}>
      <p id={questionId}>{filled(SETTINGS.revokeAsk, { name: token.name })}</p>
      <p className="tok-effect">{SETTINGS.revokeEffect}</p>
      <button type="button" className="btn btn-danger" onClick={revoke}>
        {SETTINGS.revokeConfirm}
      </button>
      <button ref={cancelButton} type="button" className="btn" onClick={cancel}>
        {SETTINGS.cancel}
      </button>
    </fieldset>
  );
}

export function TokenRow({
  token,
  asking,
  actions,
}: Readonly<{ token: Token; asking: boolean; actions: RowActions }>) {
  const { id } = token;
  const { ask, cancel, revoke } = actions;

  const askThis = useCallback(() => {
    ask(id);
  }, [ask, id]);

  const cancelThis = useCallback(() => {
    cancel(id);
  }, [cancel, id]);

  const revokeThis = useCallback(() => {
    void revoke(id);
  }, [revoke, id]);

  return (
    <li className="tok">
      <div className="tok-main">
        <p className="tok-name">{token.name}</p>
        <p className="tok-meta">{metaOf(token)}</p>
      </div>
      {asking ? (
        <Confirm token={token} cancel={cancelThis} revoke={revokeThis} />
      ) : (
        <button
          type="button"
          className="btn"
          data-revoke={id}
          aria-label={filled(SETTINGS.revokeNamed, { name: token.name })}
          onClick={askThis}
        >
          {SETTINGS.revoke}
        </button>
      )}
    </li>
  );
}
