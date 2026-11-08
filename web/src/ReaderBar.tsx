import { type RefObject, useEffect, useRef } from "react";

import type { Item } from "../../src/http/schemas.ts";
import type { BarStep } from "./bar-fit.ts";
import { Icon } from "./Icon.tsx";
import { leaveOf } from "./reader-text.ts";
import type { ReaderControls } from "./Reader.tsx";
import { ReaderActions } from "./ReaderActions.tsx";
import { followProgress } from "./reading-progress.ts";
import { useBarFit } from "./use-bar-fit.ts";
import type { Look } from "./use-root.ts";

export type BarMode = "pane" | "page" | "sheet" | "phone";

type Steps = readonly [BarStep, ...BarStep[]];

const STEPS: Readonly<Record<BarMode, Steps>> = {
  pane: [
    { hint: true, labels: true, back: "label", comments: "full", gaps: "normal" },
    { hint: false, labels: true, back: "label", comments: "full", gaps: "normal" },
    { hint: false, labels: false, back: "label", comments: "short", gaps: "normal" },
    { hint: false, labels: false, back: "label", comments: "count", gaps: "normal" },
  ],
  page: [
    { hint: false, labels: true, back: "label", comments: "full", gaps: "normal" },
    { hint: false, labels: false, back: "short", comments: "short", gaps: "normal" },
    { hint: false, labels: false, back: "short", comments: "count", gaps: "normal" },
    { hint: false, labels: false, back: "icon", comments: "count", gaps: "normal" },
  ],
  sheet: [
    { hint: false, labels: true, back: "label", comments: "full", gaps: "normal" },
    { hint: false, labels: false, back: "label", comments: "short", gaps: "normal" },
    { hint: false, labels: false, back: "label", comments: "count", gaps: "normal" },
    { hint: false, labels: false, back: "icon", comments: "count", gaps: "normal" },
  ],
  phone: [
    { hint: false, labels: false, back: "icon", comments: "short", gaps: "normal" },
    { hint: false, labels: false, back: "icon", comments: "count", gaps: "normal" },
    { hint: false, labels: false, back: "icon", comments: "count", gaps: "tight" },
  ],
};

function fitSignature(item: Readonly<Item>, mode: BarMode, settingsKey: string): string {
  const { id, readState, commentsKept, commentsTotal } = item;

  return [id, readState, commentsKept, commentsTotal, mode, settingsKey].join("|");
}

function useProgress(bar: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const element = bar.current;
    const slot = element?.closest<HTMLElement>(".reader-slot") ?? null;

    return element === null || slot === null ? undefined : followProgress(slot, element);
  }, [bar]);
}

export function ReaderBar({
  item,
  controls,
  look,
  openSettings,
}: Readonly<{ item: Item; controls: ReaderControls; look: Look; openSettings: () => void }>) {
  const { mode, settingsKey, close, hintPlaced } = controls;
  const bar = useRef<HTMLDivElement>(null);
  const leave = leaveOf(mode === "sheet", look.settings.layout === "grid");

  useBarFit(bar, STEPS[mode], fitSignature(item, mode, settingsKey), hintPlaced);
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
      <ReaderActions item={item} controls={controls} look={look} openSettings={openSettings} />
      <i className="rd-progress" aria-hidden="true" />
    </div>
  );
}
