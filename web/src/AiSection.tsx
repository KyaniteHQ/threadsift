import { useCallback, useEffect, useState } from "react";

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
  const { fields, result, busy, verifying, onSubmit, onVerify } = useAiForm(view, saved);

  const { message, error, digest } = result;

  return (
    <>
      <form method="post" action="/api/settings/ai" className="stack ai-form" onSubmit={onSubmit}>
        <AiFields fields={fields} disabled={busy || verifying} />
        <p>{view.settings?.keySet === true ? AI_TEXT.keySet : AI_TEXT.keyMissing}</p>
        <Alert text={view.secretReady ? null : AI_TEXT.secretMissing} />
        <div className="ai-actions">
          <button
            className="btn btn-acc"
            disabled={busy || verifying || !view.secretReady}
            type="submit"
          >
            {busy ? AI_TEXT.saving : AI_TEXT.save}
          </button>
          <button
            className="btn"
            disabled={busy || verifying || !view.secretReady || view.settings === null}
            type="button"
            onClick={onVerify}
          >
            {verifying ? AI_TEXT.verifying : AI_TEXT.verify}
          </button>
        </div>
      </form>
      <output>{message}</output>
      <Alert text={error} />
      {digest === null ? null : <DigestResult digest={digest} />}
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
