import { type FocusEvent, useState } from "react";

import { shownUrl } from "../../src/core/contract/link-place.ts";
import { Icon } from "./Icon.tsx";
import type { Face } from "./paste-card.ts";
import { PASTE_OPEN } from "./reader-text.ts";
import { DISMISS_LABEL, RETRY_LABEL } from "./text.ts";
import { useAfter } from "./use-form.ts";
import { WaitText } from "./WaitText.tsx";

const CLOSE_MS = 6000;

function useHeld() {
  const [pointer, setPointer] = useState(false);
  const [focus, setFocus] = useState(false);

  const handlers = {
    onPointerEnter: () => {
      setPointer(true);
    },
    onPointerLeave: () => {
      setPointer(false);
    },
    onFocus: () => {
      setFocus(true);
    },
    onBlur: (event: Readonly<Pick<FocusEvent<HTMLElement>, "currentTarget" | "relatedTarget">>) => {
      if (!event.currentTarget.contains(event.relatedTarget)) {
        setFocus(false);
      }
    },
  };

  return { held: pointer || focus, handlers };
}

function Actions({
  actions,
  dismiss,
  retry,
  open,
}: Readonly<{
  actions: Face["actions"];
  dismiss: () => void;
  retry: () => void;
  open: () => void;
}>) {
  if (actions === "none") {
    return null;
  }

  return (
    <div className="ps-acts">
      {actions === "open" ? (
        <button type="button" className="btn btn-acc" onClick={open}>
          {PASTE_OPEN}
        </button>
      ) : null}
      {actions === "retry" ? (
        <button type="button" className="btn btn-acc" onClick={retry}>
          {RETRY_LABEL}
        </button>
      ) : null}
      <button type="button" className="btn btn-plain" onClick={dismiss}>
        {DISMISS_LABEL}
      </button>
    </div>
  );
}

export function PasteCard({
  id,
  url,
  face,
  close,
  dismiss,
  retry,
  open,
}: Readonly<{
  id: string;
  url: string;
  face: Face;
  close: () => void;
  dismiss: () => void;
  retry: () => void;
  open: () => void;
}>) {
  const { held, handlers } = useHeld();
  useAfter(face.closes && !held, CLOSE_MS, close);

  return (
    <div id={id} className="ps paste-card" {...handlers}>
      <p className="ps-head">
        <Icon
          name={face.icon}
          className={face.icon === "spin" ? `ic ${face.tone} spin` : `ic ${face.tone}`}
        />
        <span className="ps-title">{face.title}</span>
      </p>
      {face.itemTitle === null ? null : <p className="ps-item">{face.itemTitle}</p>}
      {url === "" ? null : <p className="ps-url">{shownUrl(url)}</p>}
      {face.wait === null ? null : (
        <p className="ps-sub">
          <WaitText wait={face.wait} />
        </p>
      )}
      {face.wait !== null || face.note === null ? null : <p className="ps-sub">{face.note}</p>}
      <Actions actions={face.actions} dismiss={dismiss} retry={retry} open={open} />
    </div>
  );
}
