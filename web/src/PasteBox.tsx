import {
  type ChangeEvent,
  type Dispatch,
  type RefObject,
  type SetStateAction,
  type SubmitEvent,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";

import type { Item } from "../../src/http/schemas.ts";
import { Icon } from "./Icon.tsx";
import { PasteCard, type Shown, announcementOf, faceOf } from "./PasteCard.tsx";
import { SwapButton } from "./SwapButton.tsx";
import {
  ADD_LABEL,
  NOTICES,
  type NoticeKey,
  PASTE_LABEL,
  PASTE_PLACEHOLDER,
  SAVING_LABEL,
  SAVING_STATUS,
} from "./text.ts";
import { useFocusOnMount, useGuard } from "./use-form.ts";

export type SaveOutcome =
  | { readonly saved: false; readonly notice: NoticeKey }
  | { readonly saved: true; readonly itemId: number; readonly refreshed: boolean };

type Save = (url: string) => Promise<SaveOutcome>;

const FAILED: SaveOutcome = { saved: false, notice: "failed" };
const EMPTY: SaveOutcome = { saved: false, notice: "empty" };

async function attempt(save: Save, url: string): Promise<SaveOutcome> {
  try {
    return await save(url);
  } catch {
    return FAILED;
  }
}

function shownOf(outcome: Readonly<SaveOutcome>, url: string, seq: number): Shown {
  return outcome.saved
    ? { kind: "item", itemId: outcome.itemId, refreshed: outcome.refreshed, url, seq }
    : { kind: "notice", key: outcome.notice, url, seq };
}

function useSaveValue({
  save,
  setValue,
  setShown,
  focusField,
}: Readonly<{
  save: Save;
  setValue: Dispatch<SetStateAction<string>>;
  setShown: Dispatch<SetStateAction<Shown | null>>;
  focusField: () => void;
}>) {
  const sequence = useRef(0);

  return useCallback(
    async (url: string) => {
      setShown(null);
      const outcome = url === "" ? EMPTY : await attempt(save, url);

      if (outcome.saved) {
        setValue((current) => (current.trim() === url ? "" : current));
      }

      sequence.current += 1;
      setShown(shownOf(outcome, url, sequence.current));
      focusField();
    },
    [focusField, save, setShown, setValue],
  );
}

function usePaste(save: Save, focusOnMount: boolean) {
  const [value, setValue] = useState("");
  const [shown, setShown] = useState<Shown | null>(null);
  const field = useRef<HTMLInputElement>(null);

  const focusField = useCallback(() => {
    field.current?.focus();
  }, []);

  useFocusOnMount(field, focusOnMount);

  const saveValue = useSaveValue({ save, setValue, setShown, focusField });

  const { busy: saving, guard } = useGuard();

  const submit = useCallback(
    (event: SubmitEvent<HTMLFormElement>) => {
      event.preventDefault();
      const url = value.trim();

      if (url !== "") {
        guard(() => saveValue(url));
      } else if (!saving) {
        void saveValue(url);
      }
    },
    [guard, saveValue, saving, value],
  );

  const dismiss = useCallback(() => {
    setShown(null);
    focusField();
  }, [focusField]);

  const change = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setValue(event.target.value);
    setShown(null);
  }, []);

  const retry = useCallback(() => {
    if (shown !== null) {
      guard(() => saveValue(shown.url));
    }
  }, [guard, saveValue, shown]);

  return { field, value, shown, setShown, saving, change, dismiss, submit, retry };
}

function useCard(
  { shown, setShown }: Readonly<Pick<ReturnType<typeof usePaste>, "shown" | "setShown">>,
  items: readonly Item[],
  open: (id: number) => void,
) {
  const item = shown?.kind === "item" ? items.find((each) => each.id === shown.itemId) : undefined;

  const openItem = useCallback(() => {
    if (shown?.kind === "item") {
      setShown(null);
      open(shown.itemId);
    }
  }, [open, setShown, shown]);

  return { item, face: shown === null ? null : faceOf(shown, item), openItem };
}

function useEscape(root: RefObject<HTMLElement | null>, active: boolean, dismiss: () => void) {
  useEffect(() => {
    const element = root.current;

    const onKeyDown = ({ key }: Readonly<{ key: string }>): void => {
      if (active && key === "Escape") {
        dismiss();
      }
    };

    element?.addEventListener("keydown", onKeyDown);

    return () => {
      element?.removeEventListener("keydown", onKeyDown);
    };
  }, [active, dismiss, root]);
}

function PasteForm({
  field,
  value,
  saving,
  change,
  submit,
  describedBy,
  invalid,
}: Readonly<
  Pick<ReturnType<typeof usePaste>, "field" | "value" | "saving" | "change" | "submit"> & {
    describedBy: string | undefined;
    invalid: boolean;
  }
>) {
  return (
    <form className="paste-row" noValidate onSubmit={submit}>
      <label className="field">
        <span className="vh">{PASTE_LABEL}</span>
        <Icon name="link" className="ic" />
        <input
          ref={field}
          type="text"
          inputMode="url"
          enterKeyHint="go"
          autoComplete="off"
          spellCheck={false}
          placeholder={PASTE_PLACEHOLDER}
          value={value}
          aria-invalid={invalid ? true : undefined}
          aria-describedby={describedBy}
          onChange={change}
        />
      </label>
      <SwapButton label={ADD_LABEL} busyLabel={SAVING_LABEL} busy={saving} />
    </form>
  );
}

export function PasteBox({
  save,
  focusOnMount,
  items,
  open,
}: Readonly<{
  save: Save;
  focusOnMount: boolean;
  items: readonly Item[];
  open: (id: number) => void;
}>) {
  const paste = usePaste(save, focusOnMount);
  const { shown, saving, dismiss, retry } = paste;
  const { item, face, openItem } = useCard(paste, items, open);
  const root = useRef<HTMLDivElement>(null);
  const cardId = useId();
  useEscape(root, shown !== null, dismiss);

  return (
    <div ref={root} className="paste">
      <PasteForm
        field={paste.field}
        value={paste.value}
        saving={saving}
        change={paste.change}
        submit={paste.submit}
        describedBy={face === null ? undefined : cardId}
        invalid={shown?.kind === "notice" && NOTICES[shown.key].kind === "input-error"}
      />
      <output className="vh" aria-live="polite" aria-atomic="true">
        {saving ? SAVING_STATUS : announcementOf(face)}
      </output>
      {shown === null || face === null ? null : (
        <PasteCard
          key={shown.seq}
          id={cardId}
          shown={shown}
          face={face}
          item={item}
          dismiss={dismiss}
          retry={retry}
          open={openItem}
        />
      )}
    </div>
  );
}
