import { type RefObject, useId } from "react";

import { DEFAULTS } from "../../design/system/settings.ts";
import { Icon } from "./Icon.tsx";
import { PageLinks } from "./PageLinks.tsx";
import type { Pages } from "./routing.ts";
import { SettingsRows } from "./SettingsRows.tsx";
import {
  CLOSE_LABEL,
  RESET_LABEL,
  RESET_NOTE,
  SETTINGS_GEAR_LABEL,
  SETTINGS_TITLE,
} from "./text.ts";
import { usePanel } from "./use-panel.ts";
import type { Look } from "./use-root.ts";

function Gear({
  gear,
  open,
  controls,
  toggle,
}: Readonly<{
  gear: RefObject<HTMLButtonElement | null>;
  open: boolean;
  controls: string;
  toggle: () => void;
}>) {
  return (
    <button
      ref={gear}
      type="button"
      className="st-gear"
      aria-label={SETTINGS_GEAR_LABEL}
      aria-expanded={open}
      aria-controls={controls}
      onClick={toggle}
    >
      <Icon name="gear" className="ic" />
    </button>
  );
}

function SheetHeader({ titleId, close }: Readonly<{ titleId: string; close: () => void }>) {
  return (
    <div className="st-head">
      <h2 className="st-title" id={titleId}>
        {SETTINGS_TITLE}
      </h2>
      <button type="button" className="st-close" aria-label={CLOSE_LABEL} onClick={close}>
        <Icon name="close" className="ic" />
      </button>
    </div>
  );
}

export type PanelPages = Pages;

function Footer({ noteId, reset }: Readonly<{ noteId: string; reset: () => void }>) {
  return (
    <div className="st-foot">
      <button type="button" className="st-reset" aria-describedby={noteId} onClick={reset}>
        {RESET_LABEL}
      </button>
      <p className="st-foot-note" id={noteId}>
        {RESET_NOTE}
      </p>
    </div>
  );
}

export function SettingsPanel({ look, pages }: Readonly<{ look: Look; pages: Pages }>) {
  const { settings, themeNote, narrow: modal, pick: choose, reset } = look;
  const idBase = useId();
  const panelId = `${idBase}-panel`;
  const titleId = `${idBase}-title`;
  const { open, toggle, closeToGear, gear, panel } = usePanel(modal);

  return (
    <>
      <Gear gear={gear} open={open} controls={panelId} toggle={toggle} />
      {open ? (
        <dialog
          ref={panel}
          id={panelId}
          className="st-pop"
          aria-label={modal ? undefined : SETTINGS_TITLE}
          aria-labelledby={modal ? titleId : undefined}
          data-font={DEFAULTS.font}
        >
          {modal ? <SheetHeader titleId={titleId} close={closeToGear} /> : null}
          <div className="st-body">
            <SettingsRows
              settings={settings}
              themeNote={themeNote}
              narrow={modal}
              idBase={idBase}
              choose={choose}
            />
          </div>
          <PageLinks pages={pages} />
          <Footer noteId={`${idBase}-reset-note`} reset={reset} />
        </dialog>
      ) : null}
    </>
  );
}
