import type { ChangeEvent, KeyboardEvent, RefObject } from "react";
import { useCallback } from "react";

import { SEARCH_MAX } from "../../src/http/schemas.ts";
import { Icon } from "./Icon.tsx";
import { SEARCH_LABEL, SEARCH_PLACEHOLDER } from "./text.ts";

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

export function SearchField({
  value,
  field,
  search,
  hint,
  leave,
  ghost,
}: Readonly<{
  value: string;
  field: RefObject<HTMLInputElement | null>;
  search: (text: string) => void;
  hint: string | null;
  leave: () => void;
  ghost: boolean;
}>) {
  const { type, escape } = useHandlers(search, leave);

  return (
    <search className="search" aria-hidden={ghost ? true : undefined} inert={ghost}>
      <label className="field">
        <span className="vh">{SEARCH_LABEL}</span>
        <Icon name="search" className="ic" />
        <input
          ref={field}
          type="search"
          placeholder={SEARCH_PLACEHOLDER}
          autoComplete="off"
          maxLength={SEARCH_MAX}
          value={value}
          aria-keyshortcuts="/"
          disabled={ghost}
          onChange={type}
          onKeyDown={escape}
        />
      </label>
      {hint === null ? null : (
        <p className="list-hint" aria-hidden="true">
          {hint}
        </p>
      )}
    </search>
  );
}
