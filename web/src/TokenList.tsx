import { type RefObject, useCallback, useRef, useState } from "react";

import type { Token } from "../../src/http/schemas.ts";
import { revokeToken } from "./access-api.ts";
import { SETTINGS } from "./access-text.ts";
import { Alert } from "./Alert.tsx";
import { TokenRow } from "./TokenRow.tsx";

function useQuestion() {
  const [asking, setAsking] = useState<number | null>(null);
  const [focusId, setFocusId] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);

  const ask = useCallback((id: number) => {
    setFailed(false);
    setAsking(id);
  }, []);

  const cancel = useCallback((id: number) => {
    setFailed(false);
    setAsking(null);
    setFocusId(id);
  }, []);

  const answered = useCallback((id: number, next: number | null) => {
    setFailed(false);
    setAsking((current) => (current === id ? null : current));
    setFocusId(next);
  }, []);

  return { asking, focusId, failed, setFailed, ask, cancel, answered };
}

function useRevoke(
  tokens: readonly Token[],
  removed: (id: number) => void,
  nameField: RefObject<HTMLInputElement | null>,
) {
  const { asking, focusId, failed, setFailed, ask, cancel, answered } = useQuestion();
  const [revoking, setRevoking] = useState(false);
  const inFlight = useRef(false);

  const revoke = useCallback(
    async (id: number) => {
      if (inFlight.current) return;

      inFlight.current = true;
      setRevoking(true);

      const index = tokens.findIndex((token) => token.id === id);
      const neighbour = tokens[index + 1] ?? tokens[index - 1];

      try {
        await revokeToken(id);
      } catch {
        setFailed(true);

        return;
      } finally {
        inFlight.current = false;
        setRevoking(false);
      }

      removed(id);
      answered(id, neighbour?.id ?? null);

      if (neighbour === undefined) {
        nameField.current?.focus();
      }
    },
    [answered, nameField, removed, setFailed, tokens],
  );

  return { asking, focusId, failed, revoking, actions: { ask, cancel, revoke } };
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
  const { asking, focusId, failed, revoking, actions } = useRevoke(tokens, removed, nameField);

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
              revoking={revoking}
              focusRevoke={focusId === token.id}
              actions={actions}
            />
          ))}
        </ul>
      )}
    </>
  );
}
