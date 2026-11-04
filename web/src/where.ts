import type { Item } from "../../src/http/schemas.ts";

const REDDIT_NAME_PREFIXES: ReadonlySet<string> = new Set(["r", "user", "u"]);

export function whereOf({
  source,
  kind,
  normalizedUrl,
}: Readonly<Pick<Item, "source" | "kind" | "normalizedUrl">>): string {
  const { host, pathname } = new URL(normalizedUrl);
  const [first = "", second = ""] = pathname.split("/").filter((segment) => segment !== "");

  if (source === "reddit" && second !== "" && REDDIT_NAME_PREFIXES.has(first)) {
    return first === "r" ? `r/${second}` : `u/${second}`;
  }

  if (kind === "x-post" && first !== "i") {
    return `@${first}`;
  }

  if (kind === "github-repo") {
    return `${first}/${second}`;
  }

  return host;
}
