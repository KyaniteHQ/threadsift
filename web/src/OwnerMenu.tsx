import { type RefObject, useId } from "react";

import { Icon } from "./Icon.tsx";
import { OwnerMenuBody } from "./OwnerMenuBody.tsx";
import { PANEL_CLASS } from "./panel-dom.ts";
import { PanelHead } from "./PanelHead.tsx";
import type { Shell } from "./shell-context.ts";
import { MENU_LABEL, ownerMenuLabel } from "./text.ts";
import { usePanel, usePanelState } from "./use-panel.ts";

function OwnerButton({
  opener,
  open,
  controls,
  label,
  host,
  compact,
  toggle,
}: Readonly<{
  opener: RefObject<HTMLButtonElement | null>;
  open: boolean;
  controls: string;
  label: string;
  host: string;
  compact: boolean;
  toggle: () => void;
}>) {
  return (
    <button
      ref={opener}
      type="button"
      className={compact ? "btn btn-icon om-btn" : "btn om-btn"}
      aria-label={label}
      aria-expanded={open}
      aria-controls={controls}
      onClick={toggle}
    >
      {compact ? (
        <Icon name="menu" className="ic ic-m" />
      ) : (
        <>
          <span className="om-host">{host}</span>
          <Icon name="chevron" className="ic ic-s" />
        </>
      )}
    </button>
  );
}

export function OwnerMenu({ shell, menu }: Readonly<{ shell: Shell; menu: boolean }>) {
  const modal = shell.look.narrow;
  const host = window.location.host;
  const idBase = useId();
  const panelId = `${idBase}-menu`;
  const titleId = `${idBase}-title`;
  const { open, toggle, closeToOpener, dismiss, opener, panel } = usePanel(modal, usePanelState());
  const label = menu ? MENU_LABEL : ownerMenuLabel(host);

  return (
    <div className="pop-anchor">
      <OwnerButton
        opener={opener}
        open={open}
        controls={panelId}
        label={label}
        host={host}
        compact={menu}
        toggle={toggle}
      />
      {open ? (
        <dialog
          ref={panel}
          id={panelId}
          className={`${PANEL_CLASS} om-pop`}
          aria-labelledby={titleId}
        >
          <PanelHead modal={modal} titleId={titleId} title={label} close={closeToOpener} />
          <OwnerMenuBody shell={shell} host={host} withPages={menu} follow={dismiss} />
        </dialog>
      ) : null}
    </div>
  );
}
