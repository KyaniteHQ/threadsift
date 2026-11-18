import { useId } from "react";

import { VAULT_FOLDER_MAX, type VaultView } from "../../src/core/vault-contract.ts";
import { FormField } from "./FormField.tsx";
import { OBSIDIAN_TEXT as TEXT } from "./obsidian-text.ts";
import { RadioChoice } from "./RadioChoice.tsx";
import { SettingsActions, SettingsForm, SettingsResult } from "./SettingsForm.tsx";
import { useObsidian } from "./use-obsidian.ts";

const FIELD = { type: "text", autoComplete: "off", required: true, maxLength: 240 } as const;
const REPOSITORY = { ...FIELD, name: "repository" };
const BRANCH = { ...FIELD, name: "branch" };
const FOLDER = { ...FIELD, name: "folder", maxLength: VAULT_FOLDER_MAX };
const TOKEN = {
  name: "token",
  type: "password",
  autoComplete: "off",
  required: true,
  maxLength: 4096,
} as const;

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

function statusOf(view: VaultView): string {
  if (view.mode === "folder") return TEXT.folderConfigured;
  if (view.token === "none") return TEXT.missing;
  return view.token === "saved" ? TEXT.configured : TEXT.unreadable;
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
        <p>{statusOf(view)}</p>
        <SettingsActions running={form.running} buttons={form.buttons} />
      </SettingsForm>
      <SettingsResult outcome={form.outcome} />
    </>
  );
}
