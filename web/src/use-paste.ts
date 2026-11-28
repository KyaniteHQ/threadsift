import {
  type ChangeEvent,
  type Dispatch,
  type SetStateAction,
  type SubmitEvent,
  useCallback,
  useContext,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from "react";

import type { Item } from "../../src/core/contract/item-wire.ts";
import type { SaveTarget } from "./api.ts";
import { type Shown, faceOf } from "./paste-card.ts";
import { ShareContext } from "./share-handoff.ts";
import type { NoticeKey } from "./text.ts";
import { useFocusOnMount, useGuard } from "./use-form.ts";
import { useShownCard } from "./use-shown-card.ts";

export type SaveOutcome =
  | {
      readonly kind: "item";
      readonly itemId: number;
      readonly known: boolean;
      readonly refreshed: boolean;
    }
  | { readonly kind: "notice"; readonly notice: NoticeKey };

export type Save = (target: SaveTarget) => Promise<SaveOutcome>;

export type PasteRequest = SaveTarget & { readonly seq: number; readonly reader: boolean };

export interface PasteQueue {
  readonly next: PasteRequest | null;
  readonly taken: (seq: number) => void;
  readonly refused: (target: SaveTarget) => void;
}

type Origin = "field" | "card" | "queue" | "reader";

const FAILED: SaveOutcome = { kind: "notice", notice: "failed" };
const EMPTY: SaveOutcome = { kind: "notice", notice: "empty" };

async function attempt(save: Save, target: SaveTarget): Promise<SaveOutcome> {
  try {
    return await save(target);
  } catch {
    return FAILED;
  }
}

function shownOf(outcome: Readonly<SaveOutcome>, target: SaveTarget, seq: number): Shown {
  const { url } = target;

  return outcome.kind === "item"
    ? {
        kind: "item",
        itemId: outcome.itemId,
        known: outcome.known,
        refreshed: outcome.refreshed,
        url,
        seq,
      }
    : { kind: "notice", key: outcome.notice, target: target.kind, url, seq };
}

function isRefusedRetry(origin: Origin, outcome: Readonly<SaveOutcome>): boolean {
  return origin === "reader" && outcome.kind === "notice" && outcome.notice === "restoring";
}

type SaveInputs = Readonly<{
  save: Save;
  setValue: Dispatch<SetStateAction<string>>;
  setShown: (shown: Shown | null) => void;
  focusField: () => void;
  release: () => void;
  open: (id: number) => void;
  refused: PasteQueue["refused"];
}>;

function useSaveValue({
  save,
  setValue,
  setShown,
  focusField,
  release,
  open,
  refused,
}: SaveInputs) {
  const sequence = useRef(0);

  return useCallback(
    async (target: SaveTarget, origin: Origin) => {
      const { url } = target;
      setShown(null);
      const outcome = url === "" ? EMPTY : await attempt(save, target);

      if (isRefusedRetry(origin, outcome)) {
        refused(target);

        return;
      }

      if (outcome.kind === "item") {
        setValue((current) => (current.trim() === url ? "" : current));
        release();
      }

      sequence.current += 1;
      setShown(shownOf(outcome, target, sequence.current));

      if (origin === "field" && outcome.kind === "item" && outcome.known) {
        open(outcome.itemId);
      } else if (origin === "field" || origin === "card") {
        focusField();
      }
    },
    [focusField, open, refused, release, save, setShown, setValue],
  );
}

function useCloseWhenGone(
  shown: Readonly<Shown> | null,
  items: readonly Item[],
  close: () => void,
): void {
  const gone = shown?.kind === "item" && !items.some((each) => each.id === shown.itemId);

  useEffect(() => {
    if (gone) close();
  }, [close, gone]);
}

function useCloseCard({
  shown,
  items,
  setShown,
  focusField,
  release,
}: Readonly<{
  shown: Readonly<Shown> | null;
  items: readonly Item[];
  setShown: (shown: Shown | null) => void;
  focusField: () => void;
  release: () => void;
}>) {
  const close = useCallback(() => {
    setShown(null);
    release();
  }, [release, setShown]);

  const dismiss = useCallback(() => {
    close();
    focusField();
  }, [close, focusField]);

  useCloseWhenGone(shown, items, close);

  return { close, dismiss };
}

type PasteOptions = Readonly<{
  save: Save;
  focusOnMount: boolean;
  items: readonly Item[];
  queue: PasteQueue;
  open: (id: number) => void;
}>;

function usePasteSaving({
  value,
  shown,
  queue: { next, taken, refused },
  ...inputs
}: Readonly<
  Omit<SaveInputs, "refused"> & { value: string; shown: Readonly<Shown> | null; queue: PasteQueue }
>) {
  const saveValue = useSaveValue({ ...inputs, refused });
  const { busy: saving, guard } = useGuard();

  const submit = useCallback(
    (event: SubmitEvent<HTMLFormElement>) => {
      event.preventDefault();
      const url = value.trim();

      if (url !== "") {
        guard(() => saveValue({ kind: "paste", url }, "field"));
      } else if (!saving) {
        void saveValue({ kind: "paste", url }, "field");
      }
    },
    [guard, saveValue, saving, value],
  );

  const retry = useCallback(() => {
    if (shown !== null) {
      guard(() => saveValue({ kind: "paste", url: shown.url }, "card"));
    }
  }, [guard, saveValue, shown]);

  const run = useEffectEvent((request: PasteRequest) => {
    guard(() => saveValue(request, request.reader ? "reader" : "queue"));
  });

  useEffect(() => {
    if (next !== null && !saving) {
      taken(next.seq);
      run(next);
    }
  }, [next, saving, taken]);

  return { saving, submit, retry };
}

function useOpenShown(
  shown: Readonly<Shown> | null,
  close: () => void,
  open: (id: number) => void,
) {
  return useCallback(() => {
    if (shown?.kind === "item") {
      close();
      open(shown.itemId);
    }
  }, [close, open, shown]);
}

export function usePaste({ save, focusOnMount, items, queue, open }: PasteOptions) {
  const handoff = useContext(ShareContext);
  const { release } = handoff;
  const { shown, show: setShown, prefill } = useShownCard(handoff, items);
  const [value, setValue] = useState(prefill);
  const field = useRef<HTMLInputElement>(null);

  const focusField = useCallback(() => {
    field.current?.focus();
  }, []);

  useFocusOnMount(field, focusOnMount);

  const { saving, submit, retry } = usePasteSaving({
    value,
    shown,
    queue,
    save,
    setValue,
    setShown,
    focusField,
    release,
    open,
  });

  const { close, dismiss } = useCloseCard({ shown, items, setShown, focusField, release });

  const change = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      setValue(event.target.value);
      setShown(null);
      release();
    },
    [release, setShown],
  );

  const face = shown === null ? null : faceOf(shown, items);
  const openShown = useOpenShown(shown, close, open);

  return { field, value, shown, face, saving, change, close, dismiss, submit, retry, openShown };
}
