import { segmentsOf, withoutGitSuffix } from "./links.ts";

export interface RepositoryRef {
  readonly owner: string;
  readonly name: string;
}

export function repositoryRef(normalizedUrl: string): RepositoryRef {
  const [owner = "", name = ""] = segmentsOf(new URL(normalizedUrl).pathname);

  return { owner, name: withoutGitSuffix(name) };
}
