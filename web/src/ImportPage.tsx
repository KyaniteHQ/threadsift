import { IMPORT } from "./import-text.ts";
import { ListSection } from "./ListSection.tsx";
import { PageFrame } from "./PageFrame.tsx";
import { ProviderNotice } from "./ProviderNotice.tsx";
import { RedditNote } from "./RedditNote.tsx";
import { RunSection } from "./RunSection.tsx";
import { useImportInput } from "./use-import-input.ts";
import { useImportList } from "./use-import-list.ts";
import { shownRun, useImportRun } from "./use-import-run.ts";

export function ImportPage() {
  const input = useImportInput();
  const { list, check, retry } = useImportList(input.text);
  const runner = useImportRun(input.seal);
  const run = shownRun(runner.state, check);
  const finished = run.phase === "ended" && run.outcome.ending === "finished";

  return (
    <PageFrame title={IMPORT.title}>
      <main className="pg-col imp-col">
        <ListSection
          input={input}
          list={list}
          locked={run.phase === "running"}
          ran={run.phase !== "idle"}
        />
        <RunSection check={check} links={list.links} run={run} runner={runner} retry={retry} />
        <RedditNote links={list.links} finished={finished} />
        <ProviderNotice />
      </main>
    </PageFrame>
  );
}
