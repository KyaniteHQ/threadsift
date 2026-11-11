import { IMPORT } from "./import-text.ts";
import { ListSection } from "./ListSection.tsx";
import { PageBar } from "./PageBar.tsx";
import { ProviderNotice } from "./ProviderNotice.tsx";
import type { Pages } from "./routing.ts";
import { RunSection } from "./RunSection.tsx";
import { useImportInput } from "./use-import-input.ts";
import { useImportList } from "./use-import-list.ts";
import { useImportRun } from "./use-import-run.ts";

export function ImportPage({ pages, back }: Readonly<{ pages: Pages; back: () => void }>) {
  const input = useImportInput();
  const { list, check, retry } = useImportList(input.text);
  const runner = useImportRun(input.seal);

  return (
    <div className="pg imp">
      <PageBar title={IMPORT.title} backLabel={IMPORT.back} back={back} />
      <main className="pg-col imp-col">
        <ListSection input={input} list={list} locked={runner.state.phase === "running"} />
        <RunSection check={check} links={list.links} runner={runner} retry={retry} />
        <ProviderNotice pages={pages} />
      </main>
    </div>
  );
}
