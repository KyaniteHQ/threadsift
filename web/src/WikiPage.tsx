import { IndexPage } from "./IndexPage.tsx";
import { LogPage, ProposalsPage } from "./lazy-pages.tsx";
import type { Pages } from "./routing.ts";

export function WikiPage({
  name,
  pages,
  back,
}: Readonly<{ name: "index" | "log" | "proposals"; pages: Pages; back: () => void }>) {
  switch (name) {
    case "index":
      return <IndexPage pages={pages} back={back} />;
    case "log":
      return <LogPage pages={pages} back={back} />;
    case "proposals":
      return <ProposalsPage pages={pages} back={back} />;
    default:
      return name satisfies never;
  }
}
