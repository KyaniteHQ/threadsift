import { useCallback, useState } from "react";

import type { Token } from "../../src/http/schemas.ts";
import { SETTINGS } from "./access-text.ts";
import { Alert } from "./Alert.tsx";
import type { Loaded } from "./settings-load-types.ts";
import { TokenForm } from "./TokenForm.tsx";
import { TokenList } from "./TokenList.tsx";
import { TokenReveal } from "./TokenReveal.tsx";
import { useField } from "./use-form.ts";

const NO_TOKENS: readonly Token[] = [];

interface Revealed {
  readonly name: string;
  readonly value: string;
}

function useTokens(initial: Loaded<readonly Token[]>) {
  const [tokens, setTokens] = useState(initial.kind === "ready" ? initial.view : NO_TOKENS);
  const failed = initial.kind === "failed";

  const add = useCallback((token: Token) => {
    setTokens((current) => [token, ...current].toSorted((a, b) => b.id - a.id));
  }, []);

  const remove = useCallback((id: number) => {
    setTokens((current) => current.filter((token) => token.id !== id));
  }, []);

  const replace = useCallback((changed: Token) => {
    setTokens((current) => current.map((token) => (token.id === changed.id ? changed : token)));
  }, []);

  return { failed, tokens, add, remove, replace };
}

export function TokensSection({ initial }: Readonly<{ initial: Loaded<readonly Token[]> }>) {
  const name = useField();
  const [revealed, setRevealed] = useState<Revealed | null>(null);
  const { ref: nameRef } = name;

  const { failed, tokens, add, remove, replace } = useTokens(initial);

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
      <Alert text={failed ? SETTINGS.tokensLoadFailed : null} />
      <TokenList tokens={tokens} removed={remove} changed={replace} nameField={nameRef} />
    </section>
  );
}
