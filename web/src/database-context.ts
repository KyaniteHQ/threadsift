import { createContext, use } from "react";

import { provided } from "./provided.ts";

export interface SignedInDatabase {
  readonly name: string;
  readonly recheck: () => void;
}

export const DatabaseContext = createContext<SignedInDatabase | null>(null);

export function useDatabase(): string {
  return provided(use(DatabaseContext), "useDatabase").name;
}

export function useDatabaseRecheck(): () => void {
  return provided(use(DatabaseContext), "useDatabaseRecheck").recheck;
}
