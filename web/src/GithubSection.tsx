import { GITHUB_TOKEN_MAX, type GithubSettingsView } from "../../src/core/github-contract.ts";
import { AI_TEXT } from "./ai-text.ts";
import { FormField } from "./FormField.tsx";
import {
  GITHUB_TEXT,
  GUIDE_URL,
  TOKEN_PAGE,
  TOKEN_PLACEHOLDER,
  TOKEN_STATES,
} from "./github-text.ts";
import type { SectionSpec } from "./LoadedSection.tsx";
import { SettingsActions, SettingsForm, SettingsResult } from "./SettingsForm.tsx";
import { useGithubForm } from "./use-github-form.ts";
import { runningAction } from "./use-settings-action.ts";

const TOKEN_KIND = {
  name: "token",
  type: "password",
  autoComplete: "off",
  required: true,
  maxLength: GITHUB_TOKEN_MAX,
  placeholder: TOKEN_PLACEHOLDER,
} as const;

function Steps() {
  return (
    <>
      <ol className="gh-steps">
        <li>
          <a
            className="fl-link gh-link"
            href={TOKEN_PAGE}
            target="_blank"
            rel="noopener noreferrer"
          >
            {GITHUB_TEXT.stepOne}
          </a>
        </li>
        <li>{GITHUB_TEXT.stepTwo}</li>
        <li>{GITHUB_TEXT.stepThree}</li>
      </ol>
      <p className="fld-help">{GITHUB_TEXT.classicNote}</p>
    </>
  );
}

function GithubForm({
  view,
  changed,
}: Readonly<{ view: GithubSettingsView; changed: (view: GithubSettingsView) => void }>) {
  const form = useGithubForm(view, changed);

  return (
    <>
      <SettingsForm action="/api/settings/github" busy={form.busy} submit={form.submit}>
        <FormField
          field={form.token}
          label={GITHUB_TEXT.fieldLabel}
          kind={TOKEN_KIND}
          help={GITHUB_TEXT.fieldHelp}
        />
        <p>{TOKEN_STATES[view.token]}</p>
        {form.blocked.save ? <p className="fld-help">{AI_TEXT["secret-missing"]}</p> : null}
        <SettingsActions running={runningAction(form.flow)} buttons={form.buttons} />
      </SettingsForm>
      <SettingsResult outcome={form.result} />
    </>
  );
}

const githubForm = (view: GithubSettingsView, changed: (view: GithubSettingsView) => void) => (
  <GithubForm view={view} changed={changed} />
);

export const GITHUB_SECTION: SectionSpec<GithubSettingsView> = {
  id: "github",
  title: GITHUB_TEXT.sectionTitle,
  intro: GITHUB_TEXT.intro,
  loadFailed: GITHUB_TEXT.loadFailed,
  lead: <Steps />,
  foot: (
    <a className="fl-link gh-link" href={GUIDE_URL} target="_blank" rel="noopener noreferrer">
      {GITHUB_TEXT.guideLink}
    </a>
  ),
  form: githubForm,
};
