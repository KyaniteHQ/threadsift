import { RESET } from "./access-text.ts";
import { CodeText } from "./CodeText.tsx";

export function ResetInstructions() {
  return (
    <div className="stack">
      <p className="fld-help">{RESET.intro}</p>
      <p className="fld-help">{RESET.generate}</p>
      <pre className="cmd">{RESET.generateCommand}</pre>
      <p className="fld-help">
        <CodeText text={RESET.container} />
      </p>
      <p className="fld-help">{RESET.worker}</p>
      <pre className="cmd">{RESET.workerCommand}</pre>
      <p className="fld-help">
        <CodeText text={RESET.remove} />
      </p>
    </div>
  );
}
