import { type RefObject, useCallback, useEffect, useRef } from "react";

import type { Item } from "../../src/http/schemas.ts";
import type { BarStep } from "./bar-fit.ts";
import { Icon } from "./Icon.tsx";
import { HINT_PANE, MARK_READ, MARK_UNREAD, OPEN_LABELS, leaveOf } from "./reader-text.ts";
import type { ReaderControls } from "./Reader.tsx";
import { followProgress } from "./reading-progress.ts";
import { SettingsPanel } from "./SettingsPanel.tsx";
import { useBarFit } from "./use-bar-fit.ts";
import type { Look } from "./use-root.ts";

export type BarMode = "pane" | "page" | "sheet" | "phone";

type Steps = readonly [BarStep, ...BarStep[]];

const STEPS: Readonly<Record<BarMode, Steps>> = {
  pane: [
    { hint: true, labels: true, back: "label" },
    { hint: false, labels: true, back: "label" },
    { hint: false, labels: false, back: "label" },
  ],
  page: [
    { hint: false, labels: true, back: "label" },
    { hint: false, labels: false, back: "short" },
    { hint: false, labels: false, back: "icon" },
  ],
  sheet: [
    { hint: false, labels: true, back: "label" },
    { hint: false, labels: false, back: "label" },
    { hint: false, labels: false, back: "icon" },
  ],
  phone: [{ hint: false, labels: false, back: "icon" }],
};

function useProgress(bar: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const element = bar.current;
    const slot = element?.closest<HTMLElement>(".reader-slot") ?? null;

    return element === null || slot === null ? undefined : followProgress(slot, element);
  }, [bar]);
}

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

export function ReaderBar({
  item,
  controls,
  look,
  openSettings,
}: Readonly<{ item: Item; controls: ReaderControls; look: Look; openSettings: () => void }>) {
  const { mode, settingsKey, toggleRead, close, hintPlaced } = controls;
  const bar = useRef<HTMLDivElement>(null);
  const read = item.readState === "read";
  const leave = leaveOf(mode === "sheet", look.settings.layout === "grid");

  const toggle = useCallback(() => {
    toggleRead(item);
  }, [item, toggleRead]);

  useBarFit(bar, STEPS[mode], `${item.id}|${item.readState}|${mode}|${settingsKey}`, hintPlaced);
  useProgress(bar);

  return (
    <div ref={bar} className="rd-bar">
      {mode === "pane" ? null : (
        <button type="button" className="btn btn-plain rd-back" onClick={close}>
          <Icon name={leave.icon} className="ic" />
          <span className="rd-back-long">{leave.long}</span>
          <span className="rd-back-short" hidden>
            {leave.short}
          </span>
        </button>
      )}
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
      </div>
      <i className="rd-progress" aria-hidden="true" />
    </div>
  );
}
