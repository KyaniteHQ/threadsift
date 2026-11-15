import type { ExportStatus } from "../../src/core/export-contract.ts";
import { Alert } from "./Alert.tsx";
import { exportDownloadAddress } from "./export-api.ts";
import { EXPORT_TEXT, failureLabel, progressLabel, readyDetailLabel } from "./export-text.ts";
import { Icon } from "./Icon.tsx";
import type { SectionSpec } from "./LoadedSection.tsx";
import { SettingsResult } from "./SettingsForm.tsx";
import { SwapButton } from "./SwapButton.tsx";
import { useBackup } from "./use-backup.ts";

const STATUS_TEXT = {
  none: null,
  running: EXPORT_TEXT.running,
  ready: EXPORT_TEXT.ready,
  failed: null,
} as const satisfies Record<ExportStatus["state"], string | null>;

const STOP = { label: EXPORT_TEXT.stop, busyLabel: EXPORT_TEXT.stopping } as const;

const DELETE = { label: EXPORT_TEXT.remove, busyLabel: EXPORT_TEXT.removing } as const;

function detailOf(view: ExportStatus): string | null {
  switch (view.state) {
    case "none":
    case "failed":
      return null;
    case "running":
      return progressLabel(view.entries, view.dataBytes);
    case "ready":
      return readyDetailLabel(view.entries, view.zipBytes);
    default:
      return view satisfies never;
  }
}

function State({ view, stale }: Readonly<{ view: ExportStatus; stale: boolean }>) {
  const detail = detailOf(view);

  return (
    <>
      <output className="bk-state">
        {view.state === "running" ? <Icon name="spin" className="ic ic-s spin" /> : null}
        {STATUS_TEXT[view.state]}
      </output>
      {detail === null ? null : <p className="ai-meta">{detail}</p>}
      {stale ? <p className="ai-meta">{EXPORT_TEXT.stale}</p> : null}
      {view.state === "failed" ? <Alert text={failureLabel(view.failure)} /> : null}
    </>
  );
}

function BackupForm({
  view,
  changed,
}: Readonly<{ view: ExportStatus; changed: (view: ExportStatus) => void }>) {
  const { busy, result, stale, start, remove } = useBackup(view, changed);
  const blocked = busy !== null;
  const startable = view.state === "none" || view.state === "failed";
  const removable = view.state === "ready" || view.state === "failed";
  const labels = view.state === "running" ? STOP : DELETE;

  return (
    <>
      <State view={view} stale={stale} />
      <div className="ai-actions">
        {startable ? (
          <SwapButton
            label={EXPORT_TEXT.start}
            busyLabel={EXPORT_TEXT.starting}
            busy={busy === "start"}
            blocked={blocked}
            type="button"
            onClick={start}
          />
        ) : null}
        {view.state === "ready" ? (
          <a className="btn btn-acc" href={exportDownloadAddress(view.id)} download>
            {EXPORT_TEXT.download}
          </a>
        ) : null}
        {view.state === "running" || removable ? (
          <SwapButton
            {...labels}
            busy={busy === "remove"}
            blocked={blocked}
            type="button"
            onClick={remove}
            secondary
          />
        ) : null}
      </div>
      <SettingsResult outcome={result} />
    </>
  );
}

const backupForm = (view: ExportStatus, changed: (view: ExportStatus) => void) => (
  <BackupForm view={view} changed={changed} />
);

export const BACKUP_SECTION: SectionSpec<ExportStatus> = {
  id: "backup",
  title: EXPORT_TEXT.sectionTitle,
  intro: EXPORT_TEXT.intro,
  loadFailed: EXPORT_TEXT.loadFailed,
  lead: <p>{EXPORT_TEXT.caution}</p>,
  form: backupForm,
};
