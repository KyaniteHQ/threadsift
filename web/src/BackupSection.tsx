import type { ExportStatus } from "../../src/core/contract/export-contract.ts";
import { Alert } from "./Alert.tsx";
import { exportDownloadAddress } from "./export-api.ts";
import { EXPORT_TEXT, failureLabel, progressLabel, readyDetailLabel } from "./export-text.ts";
import { Icon } from "./Icon.tsx";
import type { SectionSpec } from "./LoadedSection.tsx";
import { RestoreBlock } from "./RestoreBlock.tsx";
import { SettingsResult } from "./SettingsForm.tsx";
import { SwapButton } from "./SwapButton.tsx";
import { useBackup } from "./use-backup.ts";

const STATUS_TEXT = {
  none: null,
  running: EXPORT_TEXT.running,
  ready: EXPORT_TEXT.ready,
  failed: null,
} as const satisfies Record<ExportStatus["state"], string | null>;

const STOP = { action: "stop", label: EXPORT_TEXT.stop, busyLabel: EXPORT_TEXT.stopping } as const;

const DELETE = {
  action: "remove",
  label: EXPORT_TEXT.remove,
  busyLabel: EXPORT_TEXT.removing,
} as const;

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

function State({ view }: Readonly<{ view: ExportStatus }>) {
  const detail = detailOf(view);

  return (
    <>
      <output className="bk-state">
        {view.state === "running" ? <Icon name="spin" className="ic ic-s spin" /> : null}
        {STATUS_TEXT[view.state]}
      </output>
      {detail === null ? null : <p className="ai-meta">{detail}</p>}
      <Alert text={view.state === "failed" ? failureLabel(view.failure) : null} />
    </>
  );
}

function BackupForm({
  view,
  changed,
}: Readonly<{ view: ExportStatus; changed: (view: ExportStatus) => void }>) {
  const { busy, result, start, stop, remove } = useBackup(view, changed);
  const blocked = busy !== null;
  const startable = view.state === "none" || view.state === "failed";
  const removable = view.state === "ready" || view.state === "failed";
  const ending = view.state === "running" ? STOP : DELETE;
  const presses = { stop, remove } as const;

  return (
    <>
      <State view={view} />
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
            label={ending.label}
            busyLabel={ending.busyLabel}
            busy={busy === ending.action}
            blocked={blocked}
            type="button"
            onClick={presses[ending.action]}
            secondary
          />
        ) : null}
      </div>
      <SettingsResult outcome={result} />
      <RestoreBlock />
    </>
  );
}

export const BACKUP_SECTION: SectionSpec<ExportStatus> = {
  id: "backup",
  title: EXPORT_TEXT.sectionTitle,
  intro: EXPORT_TEXT.intro,
  loadFailed: EXPORT_TEXT.loadFailed,
  lead: <p>{EXPORT_TEXT.caution}</p>,
  Form: BackupForm,
};
