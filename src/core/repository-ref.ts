import { segmentsOf } from "./links.ts";

const GIT_SUFFIX = /\.git$/iu;

export interface RepositoryRef {
  readonly owner: string;
  readonly name: string;
}

export function repositoryRef(normalizedUrl: string): RepositoryRef {
  const [owner = "", name = ""] = segmentsOf(new URL(normalizedUrl).pathname);

  return { owner, name: name.replace(GIT_SUFFIX, "") };
}
