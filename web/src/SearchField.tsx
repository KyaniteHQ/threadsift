import type { ChangeEvent, RefObject } from "react";
import { useCallback } from "react";

import { Icon } from "./Icon.tsx";
import { SEARCH_LABEL, SEARCH_PLACEHOLDER } from "./text.ts";

export function SearchField({
  value,
  field,
  search,
}: Readonly<{
  value: string;
  field: RefObject<HTMLInputElement | null>;
  search: (text: string) => void;
}>) {
  const type = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      search(event.target.value);
    },
    [search],
  );

  return (
    <search className="search">
      <label className="field">
        <span className="vh">{SEARCH_LABEL}</span>
        <Icon name="search" className="ic" />
        <input
          ref={field}
          type="search"
          placeholder={SEARCH_PLACEHOLDER}
          autoComplete="off"
          value={value}
          onChange={type}
        />
      </label>
    </search>
  );
}
