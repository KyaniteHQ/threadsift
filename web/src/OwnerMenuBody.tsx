import { useCallback, useState } from "react";

import { logOut } from "./access-api.ts";
import { SETTINGS } from "./access-text.ts";
import { Alert } from "./Alert.tsx";
import { InternalLink } from "./InternalLink.tsx";
import { OWNER_ENTRIES, type OwnerEntry } from "./owner-entries.ts";
import { PrimaryNav } from "./PrimaryNav.tsx";
import { SETTINGS_PATH } from "./routing.ts";
import type { Shell } from "./shell-context.ts";
import { signedInLine } from "./text.ts";

function Entry({
  entry,
  onSettings,
  follow,
}: Readonly<{ entry: OwnerEntry; onSettings: boolean; follow: () => void }>) {
  return (
    <li>
      {onSettings && entry.section !== null ? (
        <a className="om-row" href={`#${entry.section}`} onClick={follow}>
          {entry.label}
        </a>
      ) : (
        <InternalLink className="om-row" to={entry.path} onFollow={follow}>
          {entry.label}
        </InternalLink>
      )}
    </li>
  );
}

function SignOut({ signOut }: Readonly<{ signOut: () => void }>) {
  const [failed, setFailed] = useState(false);

  const press = useCallback(() => {
    setFailed(false);
    logOut().then(signOut, () => {
      setFailed(true);
    });
  }, [signOut]);

  return (
    <>
      <button type="button" className="om-row" onClick={press}>
        {SETTINGS.signOut}
      </button>
      <Alert text={failed ? SETTINGS.signOutFailed : null} />
    </>
  );
}

export function OwnerMenuBody({
  shell,
  host,
  withPages,
  follow,
}: Readonly<{ shell: Shell; host: string; withPages: boolean; follow: () => void }>) {
  return (
    <div className="pnl-body om-body">
      {withPages ? <PrimaryNav place={shell.place} className="om-nav" onFollow={follow} /> : null}
      <p className="om-who">{signedInLine(host)}</p>
      <ul role="list" className="om-list">
        {OWNER_ENTRIES.map((entry) => (
          <Entry
            key={entry.path}
            entry={entry}
            onSettings={shell.path === SETTINGS_PATH}
            follow={follow}
          />
        ))}
      </ul>
      <hr className="om-rule" />
      <SignOut signOut={shell.signOut} />
    </div>
  );
}
