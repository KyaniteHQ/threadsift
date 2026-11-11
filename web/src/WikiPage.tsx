import { IndexPage } from "./IndexPage.tsx";
import { LogPage } from "./LogPage.tsx";
import type { Pages } from "./routing.ts";

export function WikiPage({
  name,
  pages,
  back,
}: Readonly<{ name: "index" | "log"; pages: Pages; back: () => void }>) {
  return name === "index" ? (
    <IndexPage pages={pages} back={back} />
  ) : (
    <LogPage pages={pages} back={back} />
  );
}
