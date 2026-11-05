import { type RefObject, useCallback, useRef, useState } from "react";

import type { Token } from "../../src/http/schemas.ts";
import { revokeToken } from "./access-api.ts";
import { SETTINGS } from "./access-text.ts";
import { Alert } from "./AuthShell.tsx";
import { TokenRow } from "./TokenRow.tsx";

function useFocusRevoke(
  nameField: RefObject<HTMLInputElement | null>,
  list: RefObject<HTMLUListElement | null>,
) {
  return useCallback(
    (id: number | undefined) => {
      window.setTimeout(() => {
        const row = list.current?.querySelector<HTMLElement>(`[data-revoke="${id}"]`);
        (id === undefined ? nameField.current : row)?.focus();
      });
    },
    [list, nameField],
  );
}

function useRevoke(
  tokens: readonly Token[],
  removed: (id: number) => void,
  focusRevoke: (id: number | undefined) => void,
) {
  const [asking, setAsking] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);

  const cancel = useCallback(
    (id: number) => {
      setAsking(null);
      focusRevoke(id);
    },
    [focusRevoke],
  );

  const revoke = useCallback(
    async (id: number) => {
      const index = tokens.findIndex((token) => token.id === id);
      const neighbour = tokens[index + 1] ?? tokens[index - 1];

      try {
        await revokeToken(id);
      } catch {
        setFailed(true);

        return;
      }

      setFailed(false);
      setAsking(null);
      removed(id);
      focusRevoke(neighbour?.id);
    },
    [focusRevoke, removed, tokens],
  );

  return { asking, failed, actions: { ask: setAsking, cancel, revoke } };
}

export function TokenList({
  tokens,
  removed,
  nameField,
}: Readonly<{
  tokens: readonly Token[];
  removed: (id: number) => void;
  nameField: RefObject<HTMLInputElement | null>;
}>) {
  const list = useRef<HTMLUListElement>(null);
  const focusRevoke = useFocusRevoke(nameField, list);
  const { asking, failed, actions } = useRevoke(tokens, removed, focusRevoke);

  return (
    <>
      <Alert text={failed ? SETTINGS.revokeFailed : null} />
      {tokens.length === 0 ? null : (
        <ul ref={list} className="toks">
          {tokens.map((token) => (
            <TokenRow key={token.id} token={token} asking={asking === token.id} actions={actions} />
          ))}
        </ul>
      )}
    </>
  );
}
