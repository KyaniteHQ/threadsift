import { useCallback, type SubmitEvent } from "react";

import { type Digest, type Provider } from "../../src/core/ai-contract.ts";
import type { AiView } from "./ai-api.ts";
import { AI_TEXT } from "./ai-text.ts";
import { AiFields } from "./AiFields.tsx";
import { Alert } from "./Alert.tsx";
import { SwapButton } from "./SwapButton.tsx";
import { isSignedOut, useAiForm } from "./use-ai-form.ts";
import { type Loaded, useLoaded } from "./use-settings-load.ts";

function DigestResult({ digest }: Readonly<{ digest: Readonly<Digest> }>) {
  return (
    <div className="ai-digest">
      <h3>{digest.title}</h3>
      <p className="ai-meta">{[digest.topic, ...digest.tags].join(" · ")}</p>
      <p>{digest.summary}</p>
      <ul>
        {digest.keyPoints.map((point) => (
          <li key={point}>{point}</li>
        ))}
      </ul>
    </div>
  );
}

function AiActions({
  saveBlocked,
  verifyBlocked,
  busy,
  action,
  onVerify,
}: Readonly<{
  saveBlocked: boolean;
  verifyBlocked: boolean;
  busy: boolean;
  action: "save" | "verify" | null;
  onVerify: () => void;
}>) {
  return (
    <div className="ai-actions">
      <SwapButton
        label={AI_TEXT.save}
        busyLabel={AI_TEXT.saving}
        busy={busy && action === "save"}
        blocked={busy || saveBlocked}
      />
      <SwapButton
        label={AI_TEXT.verify}
        busyLabel={AI_TEXT.verifying}
        busy={busy && action === "verify"}
        blocked={busy || verifyBlocked}
        type="button"
        onClick={onVerify}
        secondary
      />
    </div>
  );
}

function keyStatus(provider: Provider, keySaved: boolean): string {
  if (provider === "workers-ai") return AI_TEXT.keyNotNeeded;

  if (provider === "claude-code") return AI_TEXT.claudeCodeKeyNotNeeded;

  return keySaved ? AI_TEXT.keySet : AI_TEXT.keyMissing;
}

function AiOutcome({ result }: Readonly<{ result: ReturnType<typeof useAiForm>["result"] }>) {
  return (
    <>
      <output>{result?.kind === "ok" ? result.text : null}</output>
      <Alert text={result?.kind === "error" ? result.text : null} />
      {result?.kind === "ok" && result.digest !== undefined ? (
        <DigestResult digest={result.digest} />
      ) : null}
    </>
  );
}

function ProviderNotes({
  view,
  provider,
  keySaved,
  saveBlocked,
}: Readonly<{ view: AiView; provider: Provider; keySaved: boolean; saveBlocked: boolean }>) {
  const signedOut = isSignedOut(view, provider);

  return (
    <>
      <p>{keyStatus(provider, keySaved)}</p>
      {signedOut ? (
        <p className="fld-help">
          {AI_TEXT.claudeCodeSignedOut} <code>{AI_TEXT.claudeCodeSignInCommand}</code>.
        </p>
      ) : null}
      {saveBlocked && !signedOut ? <p className="fld-help">{AI_TEXT["secret-missing"]}</p> : null}
    </>
  );
}

function AiForm({ view, saved }: Readonly<{ view: AiView; saved: (value: AiView) => void }>) {
  const keySaved = view.settings !== null && "keySet" in view.settings && view.settings.keySet;

  const { fields, result, busy, action, submit, verifyNow, saveBlocked, verifyBlocked } = useAiForm(
    view,
    saved,
  );

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
        action="/api/settings/ai"
        className="stack ai-form"
        onSubmit={onSubmit}
        aria-busy={busy}
      >
        <AiFields
          fields={fields}
          providers={view.providers}
          disabled={busy}
          publicOnly={view.publicOnly}
          keyRequired={!keySaved}
        />
        <ProviderNotes
          view={view}
          provider={fields.provider}
          keySaved={keySaved}
          saveBlocked={saveBlocked}
        />
        <AiActions
          saveBlocked={saveBlocked}
          verifyBlocked={verifyBlocked}
          busy={busy}
          action={action}
          onVerify={verifyNow}
        />
      </form>
      <AiOutcome result={result} />
    </>
  );
}

export function AiSection({ initial }: Readonly<{ initial: Loaded<AiView> }>) {
  const { loaded, ready } = useLoaded(initial);

  return (
    <section className="sec" aria-labelledby="ai-title">
      <h2 id="ai-title" className="rd-h">
        {AI_TEXT.title}
      </h2>
      <p>{AI_TEXT.intro}</p>
      {loaded.kind === "ready" ? (
        <AiForm view={loaded.view} saved={ready} />
      ) : (
        <Alert text={AI_TEXT.loadFailed} />
      )}
    </section>
  );
}
