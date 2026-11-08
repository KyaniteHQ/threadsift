import { useCallback, useState } from "react";

import type { Token } from "../../src/http/schemas.ts";
import { SETTINGS } from "./access-text.ts";
import { Alert } from "./Alert.tsx";
import { TokenForm } from "./TokenForm.tsx";
import { TokenList } from "./TokenList.tsx";
import { TokenReveal } from "./TokenReveal.tsx";
import { useField } from "./use-form.ts";
import type { Loaded } from "./use-settings-load.ts";

const NO_TOKENS: readonly Token[] = [];

interface Revealed {
  readonly name: string;
  readonly value: string;
}

function useTokens(initial: Loaded<readonly Token[]>) {
  const [loaded, setLoaded] = useState(initial);

  const add = useCallback((token: Token) => {
    setLoaded((current) => ({
      kind: "ready",
      view: [token, ...(current.kind === "ready" ? current.view : NO_TOKENS)].toSorted(
        (a, b) => b.id - a.id,
      ),
    }));
  }, []);

  const remove = useCallback((id: number) => {
    setLoaded((current) =>
      current.kind === "ready"
        ? { kind: "ready", view: current.view.filter((token) => token.id !== id) }
        : current,
    );
  }, []);

  return {
    failed: loaded.kind === "failed",
    tokens: loaded.kind === "ready" ? loaded.view : NO_TOKENS,
    add,
    remove,
  };
}

export function TokensSection({ initial }: Readonly<{ initial: Loaded<readonly Token[]> }>) {
  const name = useField();
  const [revealed, setRevealed] = useState<Revealed | null>(null);
  const { ref: nameRef } = name;

  const { failed, tokens, add, remove } = useTokens(initial);

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
      <TokenList tokens={tokens} removed={remove} nameField={nameRef} />
    </section>
  );
}
