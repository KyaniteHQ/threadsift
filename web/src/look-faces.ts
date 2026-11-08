import { useEffect, useMemo, useState } from "react";

import { LOOK_FONTS, loadStacks, stacksOf } from "./load-fonts.ts";

const FACE_WAIT_MS = 3_000;

type Attributes = Readonly<Record<string, string>>;

function stacksFor(attributes: Attributes): string[] {
  const probe = document.createElement("div");
  probe.hidden = true;

  for (const [name, value] of Object.entries(attributes)) probe.setAttribute(name, value);

  document.body.append(probe);

  try {
    return stacksOf(probe, LOOK_FONTS);
  } finally {
    probe.remove();
  }
}

function newStacks(wanted: Attributes, shown: Attributes): string[] {
  const known = new Set(stacksFor(shown));

  return stacksFor(wanted).filter((stack) => !known.has(stack));
}

export function useSettledAttributes(wanted: Attributes): Attributes {
  const [settled, setSettled] = useState(wanted);
  const stacks = useMemo(() => newStacks(wanted, settled), [wanted, settled]);

  if (stacks.length === 0 && settled !== wanted) setSettled(wanted);

  useEffect(() => {
    const superseded = new AbortController();

    const load = async (): Promise<void> => {
      await loadStacks(
        stacks,
        AbortSignal.any([superseded.signal, AbortSignal.timeout(FACE_WAIT_MS)]),
      );

      if (!superseded.signal.aborted) setSettled(wanted);
    };

    if (stacks.length > 0) void load();

    return () => {
      superseded.abort();
    };
  }, [stacks, wanted]);

  return stacks.length === 0 ? wanted : settled;
}
