import type { VaultView } from "../../src/core/vault-contract.ts";
import { FormField } from "./FormField.tsx";
import { OBSIDIAN_TEXT as TEXT } from "./obsidian-text.ts";
import { SettingsActions, SettingsForm, SettingsResult } from "./SettingsForm.tsx";
import { useObsidian } from "./use-obsidian.ts";

const FIELD = { type: "text", autoComplete: "off", required: true, maxLength: 240 } as const;
const REPOSITORY = { ...FIELD, name: "repository" };
const BRANCH = { ...FIELD, name: "branch" };
const TOKEN = {
  name: "token",
  type: "password",
  autoComplete: "off",
  required: true,
  maxLength: 4096,
} as const;

export function ObsidianForm({
  view,
  changed,
}: Readonly<{ view: VaultView; changed: (view: VaultView) => void }>) {
  const form = useObsidian(view, changed);
  return (
    <>
      <SettingsForm action="/api/settings/obsidian" busy={form.busy} submit={form.submit}>
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
        <FormField field={form.token} label={TEXT.tokenLabel} help={TEXT.tokenHelp} kind={TOKEN} />
        <p>
          {view.token === "none"
            ? TEXT.missing
            : view.token === "saved"
              ? TEXT.configured
              : TEXT.unreadable}
        </p>
        <SettingsActions running={form.running} buttons={form.buttons} />
      </SettingsForm>
      <SettingsResult outcome={form.outcome} />
    </>
  );
}
