import { useEffect, useState } from "react";

import type { VaultView } from "../../src/core/vault-contract.ts";
import { FormField } from "./FormField.tsx";
import { LoadedSection, type SectionSpec } from "./LoadedSection.tsx";
import { fetchObsidian } from "./obsidian-api.ts";
import { OBSIDIAN_TEXT as TEXT } from "./obsidian-text.ts";
import { PageBar } from "./PageBar.tsx";
import type { Loaded } from "./settings-load-types.ts";
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

function ObsidianForm({
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

const SECTION: SectionSpec<VaultView> = {
  id: "obsidian",
  title: TEXT.title,
  intro: TEXT.intro,
  loadFailed: TEXT.loadFailed,
  Form: ObsidianForm,
};

export function ObsidianPage({ back }: Readonly<{ back: () => void }>) {
  const [loaded, setLoaded] = useState<Loaded<VaultView> | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    fetchObsidian(controller.signal).then(
      (view) => {
        if (!controller.signal.aborted) setLoaded({ kind: "ready", view });
        return null;
      },
      () => {
        if (!controller.signal.aborted) setLoaded({ kind: "failed" });
        return null;
      },
    );
    return () => {
      controller.abort();
    };
  }, []);
  return (
    <div className="pg">
      <PageBar title={TEXT.title} back={back} />
      <main className="pg-col" aria-busy={loaded === null}>
        {loaded === null ? (
          <div className="pg-ghost it-ghost" aria-hidden="true">
            <i />
            <i />
            <i />
          </div>
        ) : (
          <LoadedSection {...SECTION} initial={loaded} />
        )}
      </main>
    </div>
  );
}

export function ObsidianLink() {
  return (
    <section className="sec">
      <a className="fl-link" href="/settings/obsidian">
        {TEXT.title}
      </a>
    </section>
  );
}
