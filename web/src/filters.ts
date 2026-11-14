import { useCallback, useState } from "react";

import type { ReadState, Source } from "../../src/core/kinds.ts";
import { searchTerms } from "../../src/core/search-terms.ts";

export interface Filters {
  readonly q: string;
  readonly source: Source | null;
  readonly read: ReadState | null;
  readonly topic: string | null;
  readonly tag: string | null;
}

export type Choice =
  | { readonly facet: "source"; readonly value: Source | null }
  | { readonly facet: "read"; readonly value: ReadState | null }
  | { readonly facet: "topic" | "tag"; readonly value: string | null };

export const NO_FILTERS: Filters = { q: "", source: null, read: null, topic: null, tag: null };

export function chosenCount({ source, read, topic, tag }: Readonly<Filters>): number {
  return [source, read, topic, tag].filter((value) => value !== null).length;
}

export function isSearching({ q }: Readonly<Filters>): boolean {
  return searchTerms(q).length > 0;
}

export function isEmptyResult(rows: number, next: string | null): boolean {
  return rows === 0 && next === null;
}

export function isFiltered(filters: Readonly<Filters>): boolean {
  return chosenCount(filters) > 0 || isSearching(filters);
}

function withChoice(filters: Readonly<Filters>, choice: Readonly<Choice>): Filters {
  switch (choice.facet) {
    case "source":
      return { ...filters, source: choice.value };
    case "read":
      return { ...filters, read: choice.value };
    case "topic":
      return { ...filters, topic: choice.value };
    case "tag":
      return { ...filters, tag: choice.value };
    default: {
      const exhaustive: never = choice;

      return exhaustive;
    }
  }
}

export function queryOf(filters: Readonly<Filters>, cursor: string | null = null): string {
  const query = new URLSearchParams();

  for (const [name, value] of Object.entries(filters)) {
    if (value !== null && value !== "") query.set(name, value);
  }

  if (cursor !== null) query.set("cursor", cursor);

  const text = query.toString();

  return text === "" ? "" : `?${text}`;
}

export function useFilters() {
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);

  const choose = useCallback((choice: Readonly<Choice>) => {
    setFilters((now) => withChoice(now, choice));
  }, []);

  const search = useCallback((q: string) => {
    setFilters((now) => ({ ...now, q }));
  }, []);

  const clear = useCallback(() => {
    setFilters(NO_FILTERS);
  }, []);

  const clearChosen = useCallback(() => {
    setFilters((now) => ({ ...NO_FILTERS, q: now.q }));
  }, []);

  return { filters, query: queryOf(filters), choose, search, clear, clearChosen };
}
