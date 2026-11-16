import { useId, useRef } from "react";

import { SETUP } from "./access-text.ts";
import { useFocusOnMount } from "./use-form.ts";

export function StartStep({
  startEmpty,
  startRestore,
}: Readonly<{ startEmpty: () => void; startRestore: () => void }>) {
  const titleId = useId();
  const helpId = useId();
  const first = useRef<HTMLButtonElement>(null);

  useFocusOnMount(first);

  return (
    <section className="stack" aria-labelledby={titleId}>
      <h1 id={titleId} className="auth-title">
        {SETUP.startTitle}
      </h1>
      <p className="fld-help">{SETUP.startHelp}</p>
      <button ref={first} type="button" className="btn btn-acc" onClick={startEmpty}>
        {SETUP.startEmpty}
      </button>
      <button type="button" className="btn" aria-describedby={helpId} onClick={startRestore}>
        {SETUP.startRestore}
      </button>
      <p id={helpId} className="fld-help">
        {SETUP.startRestoreHelp}
      </p>
    </section>
  );
}
