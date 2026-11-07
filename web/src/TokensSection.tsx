import { useCallback, useEffect, useState } from "react";

import type { Token } from "../../src/http/schemas.ts";
import { fetchTokens } from "./access-api.ts";
import { SETTINGS } from "./access-text.ts";
import { Alert } from "./Alert.tsx";
import { TokenForm } from "./TokenForm.tsx";
import { TokenList } from "./TokenList.tsx";
import { TokenReveal } from "./TokenReveal.tsx";
import { useField } from "./use-form.ts";

type Loaded =
  | { readonly status: "loading" }
  | { readonly status: "failed" }
  | { readonly status: "ready"; readonly tokens: readonly Token[] };

const NO_TOKENS: readonly Token[] = [];

interface Revealed {
  readonly name: string;
  readonly value: string;
}

function withTokens(
  current: Loaded,
  incoming: readonly Token[],
  isRevoked: (id: number) => boolean,
): Loaded {
  const fresh = incoming.filter((token) => !isRevoked(token.id));
  const ids = new Set(fresh.map((token) => token.id));

  const kept =
    current.status === "ready" ? current.tokens.filter((token) => !ids.has(token.id)) : [];

  return { status: "ready", tokens: [...kept, ...fresh].toSorted((a, b) => b.id - a.id) };
}

function useTokens() {
  const [tokens, setTokens] = useState<Loaded>({ status: "loading" });
  const [revoked] = useState(() => new Set<number>());
  const isRevoked = useCallback((id: number) => revoked.has(id), [revoked]);

  useEffect(() => {
    const load = async (): Promise<void> => {
      try {
        const loaded = await fetchTokens();
        setTokens((current) => withTokens(current, loaded, isRevoked));
      } catch {
        setTokens({ status: "failed" });
      }
    };

    void load();
  }, [isRevoked]);

  const add = useCallback(
    (token: Token) => {
      setTokens((current) => withTokens(current, [token], isRevoked));
    },
    [isRevoked],
  );

  const remove = useCallback(
    (id: number) => {
      revoked.add(id);
      setTokens((current) =>
        current.status === "ready"
          ? { status: "ready", tokens: current.tokens.filter((token) => token.id !== id) }
          : current,
      );
    },
    [revoked],
  );

  return { tokens, add, remove };
}

export function TokensSection() {
  const name = useField();
  const [revealed, setRevealed] = useState<Revealed | null>(null);
  const { ref: nameRef } = name;

  const { tokens, add, remove } = useTokens();

  const created = useCallback(
    (token: Token, value: string) => {
      add(token);
      setRevealed({ name: token.name, value });
    },
    [add],
  );

  const dismiss = useCallback(() => {
    setRevealed(null);
    nameRef.current?.focus();
  }, [nameRef]);

  return (
    <section className="sec" aria-labelledby="tokens-title">
      <h2 id="tokens-title" className="rd-h">
        {SETTINGS.tokensTitle}
      </h2>
      <p>{SETTINGS.tokensIntro}</p>
      <TokenForm name={name} created={created} />
      {revealed === null ? null : (
        <TokenReveal name={revealed.name} value={revealed.value} done={dismiss} />
      )}
      <Alert text={tokens.status === "failed" ? SETTINGS.tokensLoadFailed : null} />
      <TokenList
        tokens={tokens.status === "ready" ? tokens.tokens : NO_TOKENS}
        removed={remove}
        nameField={nameRef}
      />
    </section>
  );
}
