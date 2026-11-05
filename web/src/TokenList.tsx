import { type RefObject, useCallback, useState } from "react";

import type { Token } from "../../src/http/schemas.ts";
import { revokeToken } from "./access-api.ts";
import { SETTINGS } from "./access-text.ts";
import { Alert } from "./AuthShell.tsx";
import { TokenRow } from "./TokenRow.tsx";

function useRevoke(
  tokens: readonly Token[],
  removed: (id: number) => void,
  nameField: RefObject<HTMLInputElement | null>,
) {
  const [asking, setAsking] = useState<number | null>(null);
  const [focusId, setFocusId] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);

  const cancel = useCallback((id: number) => {
    setAsking(null);
    setFocusId(id);
  }, []);

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
      setFocusId(neighbour?.id ?? null);

      if (neighbour === undefined) {
        nameField.current?.focus();
      }
    },
    [nameField, removed, tokens],
  );

  return { asking, focusId, failed, actions: { ask: setAsking, cancel, revoke } };
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
  const { asking, focusId, failed, actions } = useRevoke(tokens, removed, nameField);

  return (
    <>
      <Alert text={failed ? SETTINGS.revokeFailed : null} />
      {tokens.length === 0 ? null : (
        <ul className="toks">
          {tokens.map((token) => (
            <TokenRow
              key={token.id}
              token={token}
              asking={asking === token.id}
              focusRevoke={focusId === token.id}
              actions={actions}
            />
          ))}
        </ul>
      )}
    </>
  );
}
