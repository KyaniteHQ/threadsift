import { useId, useState } from "react";

import type { VaultView } from "../../src/core/contract/vault-contract.ts";
import { Alert } from "./Alert.tsx";
import { FormField } from "./FormField.tsx";
import { fetchObsidian } from "./obsidian-api.ts";
import { BRANCH, FOLDER, REPOSITORY, TOKEN } from "./obsidian-fields.ts";
import { OBSIDIAN_TEXT as TEXT } from "./obsidian-text.ts";
import { RadioChoice } from "./RadioChoice.tsx";
import { SettingsActions, SettingsForm, SettingsResult } from "./SettingsForm.tsx";
import { useObsidian } from "./use-obsidian.ts";
import { usePolling } from "./use-polling.ts";

const MODES = [
  { value: "github", label: TEXT.githubMode },
  { value: "folder", label: TEXT.folderMode },
] as const;

type Form = ReturnType<typeof useObsidian>;

function Destination({ mode, busy, setMode }: Readonly<Pick<Form, "mode" | "busy" | "setMode">>) {
  const id = useId();

  return (
    <div className="fld">
      <span className="label" id={id}>
        {TEXT.modeLabel}
      </span>
      <div className="st-seg" role="radiogroup" aria-labelledby={id}>
        {MODES.map(({ value, label }) => (
          <RadioChoice
            key={value}
            id={`${id}-${value}`}
            name="mode"
            value={value}
            label={label}
            checked={mode === value}
            disabled={busy}
            inputValue={value}
            pick={setMode}
          />
        ))}
      </div>
    </div>
  );
}

function statusOf(view: VaultView): string | null {
  if (view.mode === "folder") return TEXT.folderConfigured;
  if (view.token === "none") return null;
  return view.token === "saved" ? TEXT.configured : TEXT.unreadable;
}

function FolderConflicts({ view }: Readonly<{ view: Extract<VaultView, { mode: "folder" }> }>) {
  const [conflicts, setConflicts] = useState(view.conflicts);
  usePolling(true, async () => {
    if (document.hidden) return;
    const result = await fetchObsidian();
    if (result.mode === "folder" && result.folder === view.folder) setConflicts(result.conflicts);
  });

  return conflicts.map((path) => (
    <Alert key={path} text={TEXT.conflict.replace("{path}", () => path)} />
  ));
}

function VaultStatus({ view }: Readonly<{ view: VaultView }>) {
  const status = statusOf(view);

  return (
    <>
      {status === null ? null : <p>{status}</p>}
      {view.mode === "folder" ? <FolderConflicts key={view.folder} view={view} /> : null}
    </>
  );
}

export function ObsidianForm({
  view,
  changed,
}: Readonly<{ view: VaultView; changed: (view: VaultView) => void }>) {
  const form = useObsidian(view, changed);
  return (
    <>
      <SettingsForm action="/api/settings/obsidian" busy={form.busy} submit={form.submit}>
        {view.folderAvailable ? (
          <Destination mode={form.mode} busy={form.busy} setMode={form.setMode} />
        ) : null}
        {form.mode === "folder" ? (
          <FormField
            field={form.folder}
            label={TEXT.folderLabel}
            help={TEXT.folderHelp}
            kind={FOLDER}
          />
        ) : (
          <>
            <FormField
              field={form.repository}
              label={TEXT.repositoryLabel}
              help={TEXT.repositoryHelp}
              kind={REPOSITORY}
            />
            <FormField
              field={form.branch}
              label={TEXT.branchLabel}
              help={TEXT.branchHelp}
              kind={BRANCH}
            />
            <FormField
              field={form.token}
              label={TEXT.tokenLabel}
              help={TEXT.tokenHelp}
              kind={TOKEN}
            />
          </>
        )}
        <VaultStatus view={view} />
        <SettingsActions running={form.running} buttons={form.buttons} />
      </SettingsForm>
      <SettingsResult outcome={form.outcome} />
    </>
  );
}
