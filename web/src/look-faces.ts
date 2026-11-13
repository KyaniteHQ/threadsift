import { useEffect, useMemo, useState } from "react";

import { type FaceId, loadFaces } from "../../design/system/style-faces.ts";
import { FACE_WAIT_MS, LOOK_FONTS, loadStacks, stacksOf, whenAborted } from "./load-fonts.ts";

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

export function useSettledAttributes(wanted: Attributes, faces: readonly FaceId[]): Attributes {
  const [settled, setSettled] = useState(wanted);
  const stacks = useMemo(() => newStacks(wanted, settled), [wanted, settled]);

  if (stacks.length === 0 && settled !== wanted) setSettled(wanted);

  useEffect(() => {
    const superseded = new AbortController();

    const load = async (): Promise<void> => {
      const signal = AbortSignal.any([superseded.signal, AbortSignal.timeout(FACE_WAIT_MS)]);

      const loaded = await Promise.race([loadFaces(faces), whenAborted(signal).then(() => true)]);

      if (!loaded) {
        window.location.reload();

        return;
      }

      await loadStacks(stacks, signal);

      if (!superseded.signal.aborted) setSettled(wanted);
    };

    if (stacks.length > 0) void load();

    return () => {
      superseded.abort();
    };
  }, [faces, stacks, wanted]);

  return stacks.length === 0 ? wanted : settled;
}
