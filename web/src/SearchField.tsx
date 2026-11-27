import type { ChangeEvent, KeyboardEvent, ReactNode, RefObject } from "react";
import { useCallback, useId } from "react";

import { SEARCH_MAX } from "../../src/core/contract/item-contract.ts";
import { Icon } from "./Icon.tsx";

function useHandlers(search: (text: string) => void, leave: () => void) {
  const type = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      search(event.target.value);
    },
    [search],
  );

  const escape = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        leave();
      }
    },
    [leave],
  );

  return { type, escape };
}

function SearchHint({ hint }: Readonly<{ hint: string | null }>) {
  return hint === null ? null : (
    <p className="list-hint" aria-hidden="true">
      {hint}
    </p>
  );
}

type BoxProps = Readonly<{
  value: string;
  label: string;
  placeholder: string;
  field: RefObject<HTMLInputElement | null>;
  search: (text: string) => void;
  leave: () => void;
}>;

function SearchBox({ value, label, placeholder, field, search, leave }: BoxProps) {
  const { type, escape } = useHandlers(search, leave);
  const id = useId();

  return (
    <label className="field" htmlFor={id}>
      <span className="vh">{label}</span>
      <Icon name="search" className="ic" />
      <input
        ref={field}
        id={id}
        type="search"
        placeholder={placeholder}
        autoComplete="off"
        enterKeyHint="search"
        spellCheck={false}
        autoCapitalize="none"
        autoCorrect="off"
        maxLength={SEARCH_MAX}
        value={value}
        aria-keyshortcuts="/"
        onChange={type}
        onKeyDown={escape}
      />
    </label>
  );
}

export function SearchField({
  hint,
  children = null,
  ...box
}: BoxProps & Readonly<{ hint: string | null; children?: ReactNode }>) {
  return (
    <search className="search">
      <div className="search-row">
        <SearchBox {...box} />
        {children}
      </div>
      <SearchHint hint={hint} />
    </search>
  );
}
