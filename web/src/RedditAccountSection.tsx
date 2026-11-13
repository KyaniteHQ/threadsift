import type { RedditAccountView } from "../../src/core/reddit-account-contract.ts";
import { FormField } from "./FormField.tsx";
import type { SectionSpec } from "./LoadedSection.tsx";
import { REDDIT_ACCOUNT_GUIDE_URL, REDDIT_ACCOUNT_TEXT, stateText } from "./reddit-account-text.ts";
import { SettingsActions, SettingsForm, SettingsResult } from "./SettingsForm.tsx";
import { useRedditAccountForm } from "./use-reddit-account-form.ts";
import { runningAction } from "./use-settings-action.ts";

const SESSION_KIND = {
  name: "session",
  type: "password",
  autoComplete: "off",
  mono: true,
} as const;

const SESSION_SAVED_KIND = {
  ...SESSION_KIND,
  placeholder: REDDIT_ACCOUNT_TEXT.fieldPlaceholder,
} as const;

function RedditAccountForm({
  view,
  changed,
}: Readonly<{ view: RedditAccountView; changed: (view: RedditAccountView) => void }>) {
  const form = useRedditAccountForm(view, changed);

  return (
    <>
      <SettingsForm
        action="/api/settings/reddit-account"
        busy={form.busy}
        submit={form.submit}
        noValidate
      >
        <FormField
          field={form.session}
          label={REDDIT_ACCOUNT_TEXT.fieldLabel}
          kind={form.saved ? SESSION_SAVED_KIND : SESSION_KIND}
          help={REDDIT_ACCOUNT_TEXT.fieldHelp}
        />
        <p>{stateText(view.state)}</p>
        <SettingsActions running={runningAction(form.flow)} buttons={form.buttons} />
      </SettingsForm>
      <SettingsResult outcome={form.result} />
    </>
  );
}

const redditAccountForm = (view: RedditAccountView, changed: (view: RedditAccountView) => void) => (
  <RedditAccountForm view={view} changed={changed} />
);

export const REDDIT_ACCOUNT_SECTION: SectionSpec<RedditAccountView> = {
  id: "reddit-account",
  title: REDDIT_ACCOUNT_TEXT.sectionTitle,
  intro: REDDIT_ACCOUNT_TEXT.intro,
  loadFailed: REDDIT_ACCOUNT_TEXT.loadFailed,
  foot: (
    <a
      className="fl-link gh-link"
      href={REDDIT_ACCOUNT_GUIDE_URL}
      target="_blank"
      rel="noopener noreferrer"
    >
      {REDDIT_ACCOUNT_TEXT.guideLink}
    </a>
  ),
  form: redditAccountForm,
};
