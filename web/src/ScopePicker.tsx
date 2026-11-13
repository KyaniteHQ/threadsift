import { useCallback, useId } from "react";

import { SCOPES, type Scope } from "../../src/core/kinds.ts";
import { SETTINGS } from "./access-text.ts";

const SCOPE_LABELS = {
  read: SETTINGS.scopeRead,
  add: SETTINGS.scopeAdd,
  digest: SETTINGS.scopeDigest,
  delete: SETTINGS.scopeDelete,
} as const satisfies Readonly<Record<Scope, string>>;

export const SCOPE_NAMES = {
  read: SETTINGS.scopeNameRead,
  add: SETTINGS.scopeNameAdd,
  digest: SETTINGS.scopeNameDigest,
  delete: SETTINGS.scopeNameDelete,
} as const satisfies Readonly<Record<Scope, string>>;

function ScopeOption({
  scope,
  checked,
  toggle,
}: Readonly<{ scope: Scope; checked: boolean; toggle: (scope: Scope) => void }>) {
  const id = useId();

  const change = useCallback(() => {
    toggle(scope);
  }, [toggle, scope]);

  return (
    <label className="st-b" htmlFor={id}>
      <input
        id={id}
        type="checkbox"
        className="st-in"
        name="token-scope"
        value={scope}
        checked={checked}
        onChange={change}
      />
      {SCOPE_LABELS[scope]}
    </label>
  );
}

export function ScopePicker({
  selected,
  toggle,
  error,
}: Readonly<{ selected: readonly Scope[]; toggle: (scope: Scope) => void; error: string | null }>) {
  const labelId = useId();
  const hintId = useId();
  const errorId = useId();

  return (
    <div className="fld">
      <span id={labelId} className="label">
        {SETTINGS.scopesLabel}
      </span>
      <fieldset
        className="st-seg"
        aria-labelledby={labelId}
        aria-describedby={error === null ? hintId : `${hintId} ${errorId}`}
      >
        {SCOPES.map((scope) => (
          <ScopeOption
            key={scope}
            scope={scope}
            checked={selected.includes(scope)}
            toggle={toggle}
          />
        ))}
      </fieldset>
      <p id={hintId} className="fld-help">
        {SETTINGS.scopesHint}
      </p>
      {error === null ? null : (
        <p id={errorId} className="fld-err" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
