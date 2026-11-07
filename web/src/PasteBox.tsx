import { useId, useRef } from "react";

import type { Item } from "../../src/http/schemas.ts";
import { Icon } from "./Icon.tsx";
import { PasteCard, announcementsOf, type faceOf } from "./PasteCard.tsx";
import { SwapButton } from "./SwapButton.tsx";
import {
  ADD_LABEL,
  NOTICES,
  PASTE_LABEL,
  PASTE_PLACEHOLDER,
  SAVING_LABEL,
  SAVING_STATUS,
} from "./text.ts";
import { useEscape } from "./use-form.ts";
import {
  type PasteRequest,
  type Save,
  useCardFace,
  useOpenShown,
  usePaste,
  usePasteRequest,
} from "./use-paste.ts";

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

function Announcements({
  face,
  saving,
}: Readonly<{ face: ReturnType<typeof faceOf>; saving: boolean }>) {
  const { polite, alert } = announcementsOf(face);

  return (
    <>
      <output className="vh" aria-live="polite" aria-atomic="true">
        {saving ? SAVING_STATUS : polite}
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
  open,
}: Readonly<{
  save: Save;
  focusOnMount: boolean;
  items: readonly Item[];
  request: PasteRequest | null;
  open: (id: number) => void;
}>) {
  const paste = usePaste(save, focusOnMount, items);
  const { shown, saving, close, dismiss, retry } = paste;

  const openShown = useOpenShown(paste, open);
  const face = useCardFace(paste, items);
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
      <Announcements face={face} saving={saving} />
      {shown === null || face === null ? null : (
        <PasteCard
          key={shown.seq}
          id={cardId}
          url={shown.kind === "item" ? shown.url : ""}
          face={face}
          close={close}
          dismiss={dismiss}
          retry={retry}
          open={openShown}
        />
      )}
    </div>
  );
}
