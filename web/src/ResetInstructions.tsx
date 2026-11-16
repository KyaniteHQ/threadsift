import { RESET } from "./access-text.ts";
import { CodeText } from "./CodeText.tsx";
import { Command } from "./Command.tsx";

export function ResetInstructions() {
  return (
    <div className="stack">
      <p className="fld-help">{RESET.intro}</p>
      <p className="fld-help">{RESET.generate}</p>
      <Command text={RESET.generateCommand} />
      <p className="fld-help">
        <CodeText text={RESET.container} />
      </p>
      <p className="fld-help">{RESET.worker}</p>
      <Command text={RESET.workerCommand} />
      <p className="fld-help">
        <CodeText text={RESET.remove} />
      </p>
    </div>
  );
}
