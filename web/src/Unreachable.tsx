import { LOGIN } from "./access-text.ts";
import { AuthShell } from "./AuthShell.tsx";
import { RETRY_LABEL } from "./text.ts";

export function Unreachable({ retry }: Readonly<{ retry: () => void }>) {
  return (
    <AuthShell>
      <div className="stack">
        <p role="alert">{LOGIN.unreachable}</p>
        <button type="button" className="btn btn-acc" onClick={retry}>
          {RETRY_LABEL}
        </button>
      </div>
    </AuthShell>
  );
}
