import { type FocusEvent, useState } from "react";

import type { Item } from "../../src/http/schemas.ts";
import { Icon } from "./Icon.tsx";
import { type CardView, viewOf } from "./paste-card.ts";
import {
  CARD_TITLES,
  DISMISS_LABEL,
  FAILURE_TITLES,
  NOTICES,
  OPEN_LABEL,
  READING_NOTE,
  RETRY_LABEL,
  type NoticeKey,
} from "./text.ts";
import { useAfter } from "./use-form.ts";

const CLOSE_MS = 6000;

const SCHEME_AND_WWW = /^https?:\/\/(www\.)?/u;

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
  readonly note: string | null;
  readonly itemTitle: string | null;
  readonly alert: boolean;
  readonly actions: "open" | "retry" | "dismiss" | "none";
}

function faceOfView(view: Readonly<CardView>, itemTitle: string | null): Face {
  switch (view.kind) {
    case "reading": {
      return {
        icon: "spin",
        tone: "tone-acc",
        title: CARD_TITLES.reading,
        note: READING_NOTE,
        itemTitle: null,
        alert: false,
        actions: "none",
      };
    }

    case "failed": {
      return {
        icon: "warn",
        tone: "tone-warn",
        title: FAILURE_TITLES[view.reason],
        note: null,
        itemTitle: null,
        alert: true,
        actions: "retry",
      };
    }

    case "added":
    case "refreshed": {
      return {
        icon: view.kind === "added" ? "check" : "refresh",
        tone: view.kind === "added" ? "tone-ok" : "tone-acc",
        title: CARD_TITLES[view.kind],
        note: view.note === null ? null : NOTICES[view.note].text,
        itemTitle,
        alert: false,
        actions: "open",
      };
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
      note: null,
      itemTitle: null,
      alert: true,
      actions: "dismiss",
    };
  }

  return item === undefined ? null : faceOfView(viewOf(item, shown.refreshed), item.title);
}

export function announcementOf(face: Readonly<Face> | null): string {
  return face === null || face.alert ? "" : [face.title, face.note].filter(Boolean).join(". ");
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
          {OPEN_LABEL}
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
  dismiss,
  retry,
  open,
}: Readonly<{
  id: string;
  url: string;
  face: Face;
  dismiss: () => void;
  retry: () => void;
  open: () => void;
}>) {
  const { held, handlers } = useHeld();
  useAfter(face.actions === "open" && !held, CLOSE_MS, dismiss);

  return (
    <div id={id} className="ps paste-card" role={face.alert ? "alert" : undefined} {...handlers}>
      <p className="ps-head">
        <Icon
          name={face.icon}
          className={face.icon === "spin" ? `ic ${face.tone} spin` : `ic ${face.tone}`}
        />
        <span className="ps-title">{face.title}</span>
      </p>
      {face.itemTitle === null ? null : <p className="ps-item">{face.itemTitle}</p>}
      {url === "" ? null : <p className="ps-url">{url.replace(SCHEME_AND_WWW, "")}</p>}
      {face.note === null ? null : <p className="ps-sub">{face.note}</p>}
      <Actions actions={face.actions} dismiss={dismiss} retry={retry} open={open} />
    </div>
  );
}
