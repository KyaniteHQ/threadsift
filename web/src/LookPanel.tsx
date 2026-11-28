import { type RefObject, useId } from "react";

import { DEFAULTS } from "../../design/system/settings.ts";
import { PANEL_CLASS } from "./panel-dom.ts";
import { PanelHead } from "./PanelHead.tsx";
import { SettingsRows } from "./SettingsRows.tsx";
import { LOOK_SETTINGS_LABEL, RESET_LABEL, RESET_NOTE } from "./text.ts";
import { type PanelState, usePanel } from "./use-panel.ts";
import type { Look } from "./use-root.ts";

function LookButton({
  opener,
  open,
  controls,
  toggle,
}: Readonly<{
  opener: RefObject<HTMLButtonElement | null>;
  open: boolean;
  controls: string;
  toggle: () => void;
}>) {
  return (
    <button
      ref={opener}
      type="button"
      className="btn look-btn"
      aria-label={LOOK_SETTINGS_LABEL}
      aria-expanded={open}
      aria-controls={controls}
      onClick={toggle}
    >
      <span className="look-mark" aria-hidden="true">
        Aa
      </span>
    </button>
  );
}

function Footer({ noteId, reset }: Readonly<{ noteId: string; reset: () => void }>) {
  return (
    <div className="st-foot">
      <button
        type="button"
        className="btn st-reset"
        data-focus-key="reset"
        aria-describedby={noteId}
        onClick={reset}
      >
        {RESET_LABEL}
      </button>
      <p className="st-foot-note" id={noteId}>
        {RESET_NOTE}
      </p>
    </div>
  );
}

export function LookPanel({ look, panel: state }: Readonly<{ look: Look; panel: PanelState }>) {
  const { settings, themeNote, narrow: modal, pick: choose, reset } = look;
  const idBase = useId();
  const panelId = `${idBase}-panel`;
  const titleId = `${idBase}-title`;
  const { open, toggle, closeToOpener, opener, panel } = usePanel(modal, state);

  return (
    <div className="pop-anchor">
      <LookButton opener={opener} open={open} controls={panelId} toggle={toggle} />
      {open ? (
        <dialog
          ref={panel}
          id={panelId}
          className={PANEL_CLASS}
          aria-labelledby={titleId}
          data-font={DEFAULTS.font}
        >
          <PanelHead
            modal={modal}
            titleId={titleId}
            title={LOOK_SETTINGS_LABEL}
            close={closeToOpener}
          />
          <div className="pnl-body">
            <SettingsRows
              settings={settings}
              themeNote={themeNote}
              narrow={modal}
              idBase={idBase}
              choose={choose}
            />
          </div>
          <Footer noteId={`${idBase}-reset-note`} reset={reset} />
        </dialog>
      ) : null}
    </div>
  );
}
