import {
  type ChangeEvent,
  type Dispatch,
  type SetStateAction,
  type SubmitEvent,
  useCallback,
  useEffect,
  useEffectEvent,
  useId,
  useRef,
  useState,
} from "react";

import type { Item } from "../../src/http/schemas.ts";
import { Icon } from "./Icon.tsx";
import { PasteCard, type Shown, announcementsOf, faceOf } from "./PasteCard.tsx";
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
import { useEscape, useFocusOnMount, useGuard } from "./use-form.ts";

export type SaveOutcome =
  | { readonly saved: false; readonly notice: NoticeKey }
  | { readonly saved: true; readonly itemId: number; readonly refreshed: boolean };

type Save = (url: string) => Promise<SaveOutcome>;

export type PasteRequest = Readonly<{ url: string; seq: number }>;

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
    async (url: string, refocus = true) => {
      setShown(null);
      const outcome = url === "" ? EMPTY : await attempt(save, url);

      if (outcome.saved) {
        setValue((current) => (current.trim() === url ? "" : current));
      }

      sequence.current += 1;
      setShown(shownOf(outcome, url, sequence.current));

      if (refocus) {
        focusField();
      }
    },
    [focusField, save, setShown, setValue],
  );
}

function useCloseCard(setShown: Dispatch<SetStateAction<Shown | null>>, focusField: () => void) {
  const close = useCallback(() => {
    setShown(null);
  }, [setShown]);

  const dismiss = useCallback(() => {
    close();
    focusField();
  }, [close, focusField]);

  return { close, dismiss };
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

  const { close, dismiss } = useCloseCard(setShown, focusField);

  const change = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setValue(event.target.value);
    setShown(null);
  }, []);

  const retry = useCallback(() => {
    if (shown !== null) {
      guard(() => saveValue(shown.url));
    }
  }, [guard, saveValue, shown]);

  return { field, value, shown, saving, change, close, dismiss, submit, retry, guard, saveValue };
}

function usePasteRequest(
  request: PasteRequest | null,
  { guard, saveValue }: Readonly<Pick<ReturnType<typeof usePaste>, "guard" | "saveValue">>,
) {
  const run = useEffectEvent((url: string) => {
    guard(() => saveValue(url, false));
  });

  useEffect(() => {
    if (request !== null) {
      run(request.url);
    }
  }, [request]);
}

function useCardFace(
  { shown }: Readonly<Pick<ReturnType<typeof usePaste>, "shown">>,
  items: readonly Item[],
) {
  const item = shown?.kind === "item" ? items.find((each) => each.id === shown.itemId) : undefined;

  return shown === null ? null : faceOf(shown, item);
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

function Announcements({ polite, alert }: Readonly<{ polite: string; alert: string }>) {
  return (
    <>
      <output className="vh" aria-live="polite" aria-atomic="true">
        {polite}
      </output>
      <div className="vh" role="alert">
        {alert}
      </div>
    </>
  );
}

export function PasteBox({
  save,
  focusOnMount,
  items,
  request,
}: Readonly<{
  save: Save;
  focusOnMount: boolean;
  items: readonly Item[];
  request: PasteRequest | null;
}>) {
  const paste = usePaste(save, focusOnMount);
  const { shown, saving, close, dismiss, retry } = paste;
  const face = useCardFace(paste, items);
  const { polite, alert } = announcementsOf(face);
  const root = useRef<HTMLDivElement>(null);
  const cardId = useId();
  useEscape(dismiss, root, shown !== null);
  usePasteRequest(request, paste);

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
      <Announcements polite={saving ? SAVING_STATUS : polite} alert={alert} />
      {shown === null || face === null ? null : (
        <PasteCard
          key={shown.seq}
          id={cardId}
          url={shown.kind === "item" ? shown.url : ""}
          face={face}
          close={close}
          dismiss={dismiss}
          retry={retry}
        />
      )}
    </div>
  );
}
