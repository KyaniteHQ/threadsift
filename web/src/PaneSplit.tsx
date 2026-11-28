import { type RefObject, useId, useLayoutEffect, useMemo, useRef, useState } from "react";

import { NOTHING } from "../../src/core/contract/nothing.ts";
import { PaneSplits } from "./pane-split.ts";
import type { Pane } from "./pane-widths.ts";
import { RESIZE_LIST_LABEL, RESIZE_RAIL_LABEL } from "./text.ts";
import type { Look } from "./use-root.ts";

const LABELS: Readonly<Record<Pane, string>> = {
  rail: RESIZE_RAIL_LABEL,
  list: RESIZE_LIST_LABEL,
};

function usePaneSplits(lib: RefObject<HTMLElement | null>, on: boolean): PaneSplits {
  const [splits] = useState(() => new PaneSplits());

  useLayoutEffect(() => {
    if (!on || lib.current === null) return NOTHING;

    return splits.mount(lib.current);
  }, [lib, on, splits]);

  return splits;
}

function PaneSplit({
  splits,
  pane,
  controls,
}: Readonly<{ splits: PaneSplits; pane: Pane; controls: string }>) {
  const handle = useRef<HTMLHRElement>(null);

  useLayoutEffect(() => {
    if (handle.current === null) return NOTHING;

    return splits.attach(handle.current, pane);
  }, [splits, pane]);

  return (
    <hr
      ref={handle}
      className={`split split-${pane}`}
      // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- A separator with a value is a focusable window splitter (WAI-ARIA, separator role).
      tabIndex={0}
      aria-orientation="vertical"
      aria-controls={controls}
      aria-label={LABELS[pane]}
    />
  );
}

export interface ListPanes {
  readonly splits: PaneSplits;
  readonly ids: Readonly<Record<Pane, string>>;
  readonly shown: Readonly<Record<Pane, boolean>>;
}

export function useListPanes(
  lib: RefObject<HTMLElement | null>,
  look: Look,
  readerBeside: boolean,
): ListPanes {
  const rail = useId();
  const list = useId();
  const resizable = look.settings.layout === "list" && !look.narrow;
  const splits = usePaneSplits(lib, resizable);
  const railShown = resizable && !look.medium;
  const listShown = resizable && readerBeside && look.reader === "pane";

  return useMemo(
    () => ({ splits, ids: { rail, list }, shown: { rail: railShown, list: listShown } }),
    [splits, rail, list, railShown, listShown],
  );
}

export function PaneSplitOf({ panes, pane }: Readonly<{ panes: ListPanes; pane: Pane }>) {
  return panes.shown[pane] ? (
    <PaneSplit splits={panes.splits} pane={pane} controls={panes.ids[pane]} />
  ) : null;
}
