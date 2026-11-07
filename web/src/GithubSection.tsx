import { useCallback, useEffect, useState, type SubmitEvent } from "react";

import { GITHUB_TOKEN_MAX, type GithubSettingsView } from "../../src/core/github-contract.ts";
import { AI_TEXT } from "./ai-text.ts";
import { Alert } from "./Alert.tsx";
import { FormField } from "./FormField.tsx";
import { fetchGithubSettings } from "./github-api.ts";
import {
  GITHUB_TEXT,
  GUIDE_URL,
  TOKEN_PAGE,
  TOKEN_PLACEHOLDER,
  TOKEN_STATES,
} from "./github-text.ts";
import { SwapButton } from "./SwapButton.tsx";
import { useGithubForm } from "./use-github-form.ts";

type Loaded =
  | { readonly kind: "loading" }
  | { readonly kind: "failed" }
  | { readonly kind: "ready"; readonly view: GithubSettingsView };

const INITIAL: Loaded = { kind: "loading" };

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

function GithubActions({
  busy,
  action,
  blocked,
  onVerify,
  onRemove,
}: Readonly<{
  busy: boolean;
  action: "save" | "verify" | "remove" | null;
  blocked: Readonly<Record<"save" | "verify" | "remove", boolean>>;
  onVerify: () => void;
  onRemove: () => void;
}>) {
  return (
    <div className="ai-actions">
      <SwapButton
        label={GITHUB_TEXT.save}
        busyLabel={GITHUB_TEXT.saving}
        busy={busy && action === "save"}
        blocked={busy || blocked.save}
      />
      <SwapButton
        label={GITHUB_TEXT.verify}
        busyLabel={GITHUB_TEXT.verifying}
        busy={busy && action === "verify"}
        blocked={busy || blocked.verify}
        type="button"
        onClick={onVerify}
        secondary
      />
      <SwapButton
        label={GITHUB_TEXT.remove}
        busyLabel={GITHUB_TEXT.removing}
        busy={busy && action === "remove"}
        blocked={busy || blocked.remove}
        type="button"
        onClick={onRemove}
        secondary
      />
    </div>
  );
}

function GithubForm({
  view,
  changed,
}: Readonly<{ view: GithubSettingsView; changed: (view: GithubSettingsView) => void }>) {
  const form = useGithubForm(view, changed);
  const { submit } = form;

  const onSubmit = useCallback(
    (event: SubmitEvent<HTMLFormElement>) => {
      event.preventDefault();
      submit();
    },
    [submit],
  );

  return (
    <>
      <form
        method="post"
        action="/api/settings/github"
        className="stack ai-form"
        onSubmit={onSubmit}
        aria-busy={form.busy}
      >
        <FormField
          field={form.token}
          label={GITHUB_TEXT.fieldLabel}
          kind={TOKEN_KIND}
          help={GITHUB_TEXT.fieldHelp}
        />
        <p>{TOKEN_STATES[view.token]}</p>
        {form.blocked.save ? <p className="fld-help">{AI_TEXT["secret-missing"]}</p> : null}
        <GithubActions
          busy={form.busy}
          action={form.action}
          blocked={form.blocked}
          onVerify={form.verifyNow}
          onRemove={form.removeNow}
        />
      </form>
      <output>{form.result?.kind === "ok" ? form.result.text : null}</output>
      <Alert text={form.result?.kind === "error" ? form.result.text : null} />
    </>
  );
}

export function GithubSection() {
  const [loaded, setLoaded] = useState<Loaded>(INITIAL);

  useEffect(() => {
    const load = async (): Promise<void> => {
      try {
        setLoaded({ kind: "ready", view: await fetchGithubSettings() });
      } catch {
        setLoaded({ kind: "failed" });
      }
    };

    void load();
  }, []);

  const changed = useCallback((view: GithubSettingsView) => {
    setLoaded({ kind: "ready", view });
  }, []);

  return (
    <section className="sec" aria-labelledby="github-title">
      <h2 id="github-title" className="rd-h">
        {GITHUB_TEXT.sectionTitle}
      </h2>
      <p>{GITHUB_TEXT.intro}</p>
      <Steps />
      {loaded.kind === "ready" ? (
        <GithubForm view={loaded.view} changed={changed} />
      ) : (
        <Alert text={loaded.kind === "failed" ? GITHUB_TEXT.loadFailed : null} />
      )}
      <a className="fl-link gh-link" href={GUIDE_URL} target="_blank" rel="noopener noreferrer">
        {GITHUB_TEXT.guideLink}
      </a>
    </section>
  );
}
