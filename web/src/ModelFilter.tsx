import { type ChangeEvent, type KeyboardEvent, useCallback, useId } from "react";

import type { ModelOption } from "../../src/core/contract/ai-settings-contract.ts";
import { AI_TEXT, modelMatchCount } from "./ai-text.ts";

export const MODEL_FILTER_OVER = 20;

const WORD_GAP = /\s+/u;

function wordsOf(query: string): readonly string[] {
  return query
    .toLowerCase()
    .split(WORD_GAP)
    .filter((word) => word !== "");
}

export function modelsMatching(
  options: readonly ModelOption[],
  query: string,
): readonly ModelOption[] {
  const words = wordsOf(query);

  if (words.length === 0) return options;

  return options.filter(({ id, label }) => {
    const named = `${label ?? ""} ${id}`.toLowerCase();

    return words.every((word) => named.includes(word));
  });
}

function keepFormOnEnter(event: KeyboardEvent<HTMLInputElement>): void {
  if (event.key === "Enter") event.preventDefault();
}

export function ModelFilter({
  query,
  matches,
  change,
}: Readonly<{ query: string; matches: number; change: (query: string) => void }>) {
  const id = useId();

  const edit = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      change(event.target.value);
    },
    [change],
  );

  return (
    <div className="fld">
      <label className="label" htmlFor={id}>
        {AI_TEXT.modelFilter}
      </label>
      <div className="field">
        <input
          id={id}
          type="search"
          autoComplete="off"
          spellCheck={false}
          autoCapitalize="none"
          autoCorrect="off"
          value={query}
          onChange={edit}
          onKeyDown={keepFormOnEnter}
        />
      </div>
      <output className="fld-help" htmlFor={id}>
        {wordsOf(query).length === 0 ? "" : modelMatchCount(matches)}
      </output>
    </div>
  );
}
