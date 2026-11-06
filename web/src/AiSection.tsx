import { useCallback, useEffect, useState, type SubmitEvent } from "react";

import { type Digest } from "../../src/core/ai-contract.ts";
import { type AiView, fetchAiSettings } from "./ai-api.ts";
import { AI_TEXT } from "./ai-text.ts";
import { AiFields } from "./AiFields.tsx";
import { Alert } from "./Alert.tsx";
import { SwapButton } from "./SwapButton.tsx";
import { useAiForm } from "./use-ai-form.ts";

type Loaded =
  | { readonly kind: "loading" }
  | { readonly kind: "failed" }
  | { readonly kind: "ready"; readonly view: AiView };

const INITIAL: Loaded = { kind: "loading" };

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
  view,
  busy,
  action,
  onVerify,
}: Readonly<{
  view: AiView;
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
        blocked={busy || !view.secretReady}
      />
      <SwapButton
        label={AI_TEXT.verify}
        busyLabel={AI_TEXT.verifying}
        busy={busy && action === "verify"}
        blocked={busy || !view.secretReady || view.settings === null}
        type="button"
        onClick={onVerify}
        secondary
      />
    </div>
  );
}

function AiForm({ view, saved }: Readonly<{ view: AiView; saved: (value: AiView) => void }>) {
  const { fields, result, busy, action, guard, save, verify } = useAiForm(view, saved);

  const onSubmit = useCallback(
    (event: SubmitEvent<HTMLFormElement>) => {
      event.preventDefault();
      guard(save);
    },
    [guard, save],
  );

  const onVerify = useCallback(() => {
    if (view.settings !== null) guard(verify);
  }, [guard, verify, view.settings]);

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
          disabled={busy}
          publicOnly={view.publicOnly}
          keyRequired={view.settings?.keySet !== true}
        />
        <p>{view.settings?.keySet === true ? AI_TEXT.keySet : AI_TEXT.keyMissing}</p>
        {view.secretReady ? null : <p className="fld-help">{AI_TEXT["secret-missing"]}</p>}
        <AiActions view={view} busy={busy} action={action} onVerify={onVerify} />
      </form>
      <output>{result?.kind === "ok" ? result.text : null}</output>
      <Alert text={result?.kind === "error" ? result.text : null} />
      {result?.kind === "ok" && result.digest !== undefined ? (
        <DigestResult digest={result.digest} />
      ) : null}
    </>
  );
}

export function AiSection() {
  const [loaded, setLoaded] = useState<Loaded>(INITIAL);
  useEffect(() => {
    const load = async (): Promise<void> => {
      try {
        setLoaded({ kind: "ready", view: await fetchAiSettings() });
      } catch {
        setLoaded({ kind: "failed" });
      }
    };

    void load();
  }, []);

  const saved = useCallback((view: AiView) => {
    setLoaded({ kind: "ready", view });
  }, []);

  return (
    <section className="sec" aria-labelledby="ai-title">
      <h2 id="ai-title" className="rd-h">
        {AI_TEXT.title}
      </h2>
      <p>{AI_TEXT.intro}</p>
      {loaded.kind === "ready" ? (
        <AiForm view={loaded.view} saved={saved} />
      ) : (
        <Alert text={loaded.kind === "failed" ? AI_TEXT.loadFailed : null} />
      )}
    </section>
  );
}
