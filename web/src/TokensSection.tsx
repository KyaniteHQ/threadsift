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

function withLoaded(current: Loaded, loaded: readonly Token[]): Loaded {
  if (current.status !== "ready") return { status: "ready", tokens: loaded };

  const listed = new Set(loaded.map((token) => token.id));

  return {
    status: "ready",
    tokens: [...current.tokens.filter((token) => !listed.has(token.id)), ...loaded],
  };
}

function useTokens() {
  const [tokens, setTokens] = useState<Loaded>({ status: "loading" });

  useEffect(() => {
    const load = async (): Promise<void> => {
      try {
        const loaded = await fetchTokens();
        setTokens((current) => withLoaded(current, loaded));
      } catch {
        setTokens({ status: "failed" });
      }
    };

    void load();
  }, []);

  const add = useCallback((token: Token) => {
    setTokens((current) => ({
      status: "ready",
      tokens: current.status === "ready" ? [token, ...current.tokens] : [token],
    }));
  }, []);

  const remove = useCallback((id: number) => {
    setTokens((current) =>
      current.status === "ready"
        ? { status: "ready", tokens: current.tokens.filter((token) => token.id !== id) }
        : current,
    );
  }, []);

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
