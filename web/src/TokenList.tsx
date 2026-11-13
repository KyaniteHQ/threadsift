import { type RefObject, useCallback, useRef } from "react";

import type { Token } from "../../src/http/schemas.ts";
import { revokeToken } from "./access-api.ts";
import { SETTINGS } from "./access-text.ts";
import { Alert } from "./Alert.tsx";
import { START, askedId, reduceRevoke } from "./token-revoke.ts";
import { TokenRow } from "./TokenRow.tsx";
import { useFlow } from "./use-flow.ts";

function neighbourOf(tokens: readonly Token[], id: number): number | null {
  const index = tokens.findIndex((token) => token.id === id);

  return (tokens[index + 1] ?? tokens[index - 1])?.id ?? null;
}

function useRevoke(
  tokens: readonly Token[],
  removed: (id: number) => void,
  nameField: RefObject<HTMLInputElement | null>,
) {
  const [flow, send] = useFlow(reduceRevoke, START);
  const requests = useRef(0);

  const ask = useCallback(
    (id: number) => {
      send({ kind: "ask", id });
    },
    [send],
  );

  const cancel = useCallback(
    (id: number) => {
      send({ kind: "cancel", id });
    },
    [send],
  );

  const revoke = useCallback(
    async (id: number) => {
      const request = requests.current + 1;

      if (!send({ kind: "begin", id, request })) return;

      requests.current = request;

      const next = neighbourOf(tokens, id);

      try {
        await revokeToken(id);
      } catch {
        send({ kind: "refuse", id, request });

        return;
      }

      removed(id);
      send({ kind: "revoked", id, request, next });

      if (next === null) nameField.current?.focus();
    },
    [nameField, removed, send, tokens],
  );

  return { flow, actions: { ask, cancel, revoke } };
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
  const { flow, actions } = useRevoke(tokens, removed, nameField);
  const asking = askedId(flow);
  const focusId = flow.kind === "idle" ? flow.focus : null;

  return (
    <>
      <Alert text={flow.kind === "failed" ? SETTINGS.revokeFailed : null} />
      {tokens.length === 0 ? null : (
        <ul className="toks">
          {tokens.map((token) => (
            <TokenRow
              key={token.id}
              token={token}
              asking={asking === token.id}
              revoking={flow.kind === "revoking"}
              focusRevoke={focusId === token.id}
              actions={actions}
            />
          ))}
        </ul>
      )}
    </>
  );
}
