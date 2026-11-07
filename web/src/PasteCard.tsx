import { type FocusEvent, useState } from "react";

import { shownUrl, whereOf } from "../../src/core/links.ts";
import type { Item } from "../../src/http/schemas.ts";
import { Icon } from "./Icon.tsx";
import { type CardView, viewOf } from "./paste-card.ts";
import { PASTE_OPEN } from "./reader-text.ts";
import {
  CARD_TITLES,
  DISMISS_LABEL,
  FAILURE_TITLES,
  NOTICES,
  READING_NOTE,
  RETRY_LABEL,
  type NoticeKey,
} from "./text.ts";
import { useAfter } from "./use-form.ts";

const CLOSE_MS = 6000;

export type Shown = Readonly<{ seq: number; url: string }> &
  (
    | { readonly kind: "notice"; readonly key: NoticeKey }
    | { readonly kind: "item"; readonly itemId: number; readonly refreshed: boolean }
  );

type Tone = "tone-acc" | "tone-ok" | "tone-warn";

interface Face {
  readonly icon: "spin" | "check" | "refresh" | "warn";
  readonly tone: Tone;
  readonly title: string;
  readonly name: string | null;
  readonly note: string | null;
  readonly itemTitle: string | null;
  readonly alert: boolean;
  readonly closes: boolean;
  readonly actions: "open" | "retry" | "dismiss" | "none";
}

function savedLook(view: Readonly<Extract<CardView, { kind: "added" | "refreshed" }>>) {
  if (view.note !== null) {
    return { icon: "warn", tone: "tone-warn" } as const;
  }

  return view.kind === "added"
    ? ({ icon: "check", tone: "tone-ok" } as const)
    : ({ icon: "refresh", tone: "tone-acc" } as const);
}

function noteOf(view: Readonly<Extract<CardView, { kind: "added" | "refreshed" }>>): string | null {
  return view.note === null ? null : NOTICES[view.note].text;
}

function savedFace(
  view: Readonly<Extract<CardView, { kind: "added" | "refreshed" }>>,
  item: Readonly<Item>,
): Face {
  return {
    ...savedLook(view),
    title: CARD_TITLES[view.kind],
    name: item.title ?? whereOf(item),
    note: noteOf(view),
    itemTitle: item.title,
    alert: false,
    closes: true,
    actions: "open",
  };
}

function faceOfView(view: Readonly<CardView>, item: Readonly<Item>): Face {
  const name = item.title ?? whereOf(item);

  switch (view.kind) {
    case "reading": {
      return {
        icon: "spin",
        tone: "tone-acc",
        title: CARD_TITLES.reading,
        name,
        note: READING_NOTE,
        itemTitle: null,
        alert: false,
        closes: false,
        actions: "none",
      };
    }

    case "failed": {
      return {
        icon: "warn",
        tone: "tone-warn",
        title: FAILURE_TITLES[view.reason],
        name,
        note: null,
        itemTitle: null,
        alert: true,
        closes: true,
        actions: "retry",
      };
    }

    case "added":
    case "refreshed": {
      return savedFace(view, item);
    }

    default: {
      const exhaustive: never = view;

      return exhaustive;
    }
  }
}

export function faceOf(shown: Readonly<Shown>, item: Readonly<Item> | undefined): Face | null {
  if (shown.kind === "notice") {
    return {
      icon: "warn",
      tone: "tone-warn",
      title: NOTICES[shown.key].text,
      name: null,
      note: null,
      itemTitle: null,
      alert: true,
      closes: false,
      actions: "dismiss",
    };
  }

  return item === undefined ? null : faceOfView(viewOf(item, shown.refreshed), item);
}

export function announcementsOf(face: Readonly<Face> | null) {
  if (face === null) {
    return { polite: "", alert: "" };
  }

  const said = [face.name === null ? face.title : `${face.title}: ${face.name}`, face.note]
    .filter(Boolean)
    .join(". ");

  return face.alert ? { polite: "", alert: said } : { polite: said, alert: "" };
}

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
      {face.note === null ? null : <p className="ps-sub">{face.note}</p>}
      <Actions actions={face.actions} dismiss={dismiss} retry={retry} open={open} />
    </div>
  );
}
