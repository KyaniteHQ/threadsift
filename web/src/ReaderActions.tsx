import { useCallback } from "react";

import type { Item } from "../../src/http/schemas.ts";
import { DeleteItem } from "./DeleteItem.tsx";
import { Icon } from "./Icon.tsx";
import { HINT_PANE, MARK_READ, MARK_UNREAD, OPEN_LABELS } from "./reader-text.ts";
import type { ReaderControls } from "./Reader.tsx";
import { SettingsPanel } from "./SettingsPanel.tsx";
import type { Look } from "./use-root.ts";

function ReadIcon({ read }: Readonly<{ read: boolean }>) {
  return (
    <svg
      className={read ? "ic rd-read-ic on" : "ic rd-read-ic"}
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12.3l2.7 2.7L16 9.6" />
    </svg>
  );
}

export function ReaderActions({
  item,
  controls,
  look,
  openSettings,
}: Readonly<{ item: Item; controls: ReaderControls; look: Look; openSettings: () => void }>) {
  const { mode, toggleRead, remove } = controls;
  const read = item.readState === "read";

  const toggle = useCallback(() => {
    toggleRead(item);
  }, [item, toggleRead]);

  return (
    <div className="rd-actions">
      {mode === "pane" ? (
        <p className="rd-hint" aria-hidden="true">
          {HINT_PANE}
        </p>
      ) : null}
      {mode === "pane" ? null : <SettingsPanel look={look} openInstanceSettings={openSettings} />}
      <button type="button" className="btn rd-act" aria-keyshortcuts="M" onClick={toggle}>
        <ReadIcon read={read} />
        <span className="rd-act-l">{read ? MARK_UNREAD : MARK_READ}</span>
      </button>
      <a className="btn rd-act" href={item.originalUrl} target="_blank" rel="noopener noreferrer">
        <span className="rd-act-l">{OPEN_LABELS[item.source]}</span>
        <Icon name="external" className="ic" />
      </a>
      <DeleteItem item={item} remove={remove} />
    </div>
  );
}
