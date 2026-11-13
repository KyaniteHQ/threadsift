export class ModuleUnavailable extends Error {}

export function unavailable(cause: unknown): never {
  throw new ModuleUnavailable("a code chunk did not load", { cause });
}
