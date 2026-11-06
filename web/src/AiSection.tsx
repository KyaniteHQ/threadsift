import { useCallback, useEffect, useState, type SubmitEvent } from "react";

import { type Digest } from "../../src/core/ai-contract.ts";
import { type AiView, fetchAiSettings } from "./ai-api.ts";
import { AI_TEXT } from "./ai-text.ts";
import { AiFields } from "./AiFields.tsx";
import { Alert } from "./Alert.tsx";
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

function AiForm({ view, saved }: Readonly<{ view: AiView; saved: (value: AiView) => void }>) {
  const { fields, result, busy, guard, save, verify } = useAiForm(view, saved);

  const onSubmit = useCallback(
    (event: SubmitEvent<HTMLFormElement>) => {
      event.preventDefault();
      guard(save);
    },
    [guard, save],
  );

  const onVerify = useCallback(() => {
    guard(verify);
  }, [guard, verify]);

  return (
    <>
      <form
        method="post"
        action="/api/settings/ai"
        className="stack ai-form"
        onSubmit={onSubmit}
        aria-busy={busy}
      >
        <AiFields fields={fields} disabled={busy} publicOnly={view.publicOnly} />
        <p>{view.settings?.keySet === true ? AI_TEXT.keySet : AI_TEXT.keyMissing}</p>
        {view.secretReady ? null : <p className="fld-help">{AI_TEXT["secret-missing"]}</p>}
        <div className="ai-actions">
          <button className="btn btn-acc" disabled={busy || !view.secretReady} type="submit">
            {AI_TEXT.save}
          </button>
          <button
            className="btn"
            disabled={busy || !view.secretReady || view.settings === null}
            type="button"
            onClick={onVerify}
          >
            {AI_TEXT.verify}
          </button>
        </div>
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
