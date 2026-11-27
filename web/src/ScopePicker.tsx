import { useCallback, useId } from "react";

import { SCOPES, type Scope } from "../../src/core/contract/agent-token-contract.ts";
import { SETTINGS } from "./access-text.ts";

export const SCOPE_LABELS = {
  read: SETTINGS.scopeRead,
  add: SETTINGS.scopeAdd,
  digest: SETTINGS.scopeDigest,
  delete: SETTINGS.scopeDelete,
  reddit: SETTINGS.scopeReddit,
} as const satisfies Readonly<Record<Scope, string>>;

const SCOPE_HINTS = {
  read: SETTINGS.scopeHintRead,
  add: SETTINGS.scopeHintAdd,
  digest: SETTINGS.scopeHintDigest,
  delete: SETTINGS.scopeHintDelete,
  reddit: SETTINGS.scopeHintReddit,
} as const satisfies Readonly<Record<Scope, string>>;

function ScopeOption({
  scope,
  checked,
  toggle,
}: Readonly<{ scope: Scope; checked: boolean; toggle: (scope: Scope) => void }>) {
  const id = useId();
  const hintId = useId();

  const change = useCallback(() => {
    toggle(scope);
  }, [toggle, scope]);

  return (
    <li className="tok-scope">
      <label className="tok-scope-name" htmlFor={id}>
        <input
          id={id}
          type="checkbox"
          name="token-scope"
          value={scope}
          checked={checked}
          aria-describedby={hintId}
          onChange={change}
        />
        {SCOPE_LABELS[scope]}
      </label>
      <p id={hintId} className="fld-help">
        {SCOPE_HINTS[scope]}
      </p>
    </li>
  );
}

export function ScopePicker({
  selected,
  toggle,
  error,
}: Readonly<{ selected: readonly Scope[]; toggle: (scope: Scope) => void; error: string | null }>) {
  const errorId = useId();

  return (
    <div className="fld">
      <fieldset className="tok-scopes" aria-describedby={error === null ? undefined : errorId}>
        <legend className="label">{SETTINGS.scopesLabel}</legend>
        <ul role="list">
          {SCOPES.map((scope) => (
            <ScopeOption
              key={scope}
              scope={scope}
              checked={selected.includes(scope)}
              toggle={toggle}
            />
          ))}
        </ul>
      </fieldset>
      <p id={errorId} className="fld-err" role="alert">
        {error}
      </p>
    </div>
  );
}
