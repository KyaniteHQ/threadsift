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
import { type Shown, faceOf } from "./PasteCard.tsx";
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

export type PasteRequest = SaveTarget & { readonly seq: number };

export interface PasteQueue {
  readonly next: PasteRequest | null;
  readonly taken: (seq: number) => void;
}

const FAILED: SaveOutcome = { kind: "notice", notice: "failed" };
const EMPTY: SaveOutcome = { kind: "notice", notice: "empty" };

async function attempt(save: Save, target: SaveTarget): Promise<SaveOutcome> {
  try {
    return await save(target);
  } catch {
    return FAILED;
  }
}

function shownOf(outcome: Readonly<SaveOutcome>, url: string, seq: number): Shown {
  return outcome.kind === "item"
    ? { kind: "item", itemId: outcome.itemId, refreshed: outcome.refreshed, url, seq }
    : { kind: "notice", key: outcome.notice, url, seq };
}

function useSaveValue({
  save,
  setValue,
  setShown,
  focusField,
  release,
  open,
}: Readonly<{
  save: Save;
  setValue: Dispatch<SetStateAction<string>>;
  setShown: (shown: Shown | null) => void;
  focusField: () => void;
  release: () => void;
  open: (id: number) => void;
}>) {
  const sequence = useRef(0);

  return useCallback(
    async (target: SaveTarget, origin: "field" | "card" | "queue") => {
      const { url } = target;
      setShown(null);
      const outcome = url === "" ? EMPTY : await attempt(save, target);

      if (outcome.kind === "item") {
        setValue((current) => (current.trim() === url ? "" : current));
        release();
      }

      sequence.current += 1;
      setShown(shownOf(outcome, url, sequence.current));

      if (origin === "field" && outcome.kind === "item" && outcome.known) {
        open(outcome.itemId);
      } else if (origin !== "queue") {
        focusField();
      }
    },
    [focusField, open, release, save, setShown, setValue],
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
  open: (id: number) => void;
}>;

export function usePaste({ save, focusOnMount, items, open }: PasteOptions) {
  const handoff = useContext(ShareContext);
  const { release } = handoff;
  const { shown, show: setShown, prefill } = useShownCard(handoff, items);
  const [value, setValue] = useState(prefill);
  const field = useRef<HTMLInputElement>(null);

  const focusField = useCallback(() => {
    field.current?.focus();
  }, []);

  useFocusOnMount(field, focusOnMount);

  const saveValue = useSaveValue({ save, setValue, setShown, focusField, release, open });

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

  const { close, dismiss } = useCloseCard({ shown, items, setShown, focusField, release });

  const change = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      setValue(event.target.value);
      setShown(null);
      release();
    },
    [release, setShown],
  );

  const retry = useCallback(() => {
    if (shown !== null) {
      guard(() => saveValue({ kind: "paste", url: shown.url }, "card"));
    }
  }, [guard, saveValue, shown]);

  return { field, value, shown, saving, change, close, dismiss, submit, retry, guard, saveValue };
}

export function usePasteRequest(
  { next, taken }: Readonly<PasteQueue>,
  {
    guard,
    saveValue,
    saving,
  }: Readonly<Pick<ReturnType<typeof usePaste>, "guard" | "saveValue" | "saving">>,
) {
  const run = useEffectEvent((target: SaveTarget) => {
    guard(() => saveValue(target, "queue"));
  });

  useEffect(() => {
    if (next !== null && !saving) {
      taken(next.seq);
      run(next);
    }
  }, [next, saving, taken]);
}

export function useCardFace(
  { shown }: Readonly<Pick<ReturnType<typeof usePaste>, "shown">>,
  items: readonly Item[],
) {
  const item = shown?.kind === "item" ? items.find((each) => each.id === shown.itemId) : undefined;

  return shown === null ? null : faceOf(shown, item);
}

export function useOpenShown(
  { shown, close }: Readonly<Pick<ReturnType<typeof usePaste>, "shown" | "close">>,
  open: (id: number) => void,
) {
  return useCallback(() => {
    if (shown?.kind === "item") {
      close();
      open(shown.itemId);
    }
  }, [close, open, shown]);
}
