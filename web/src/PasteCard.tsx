import { type FocusEvent, useEffect, useState } from "react";

import type { Item } from "../../src/http/schemas.ts";
import { Icon } from "./Icon.tsx";
import { type CardView, isSettled, viewOf } from "./paste-card.ts";
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

export const CLOSE_MS = 6000;

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
  readonly alert: boolean;
  readonly actions: "open" | "retry" | "dismiss" | "none";
}

function faceOfView(view: Readonly<CardView>): Face {
  switch (view.kind) {
    case "reading": {
      return {
        icon: "spin",
        tone: "tone-acc",
        title: CARD_TITLES.reading,
        note: READING_NOTE,
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
      alert: true,
      actions: "dismiss",
    };
  }

  return item === undefined ? null : faceOfView(viewOf(item, shown.refreshed));
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

function useCloseAfter(enabled: boolean, dismiss: () => void): void {
  useEffect(() => {
    const timer = enabled ? window.setTimeout(dismiss, CLOSE_MS) : 0;

    return () => {
      window.clearTimeout(timer);
    };
  }, [enabled, dismiss]);
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
  shown,
  face,
  item,
  dismiss,
  retry,
  open,
}: Readonly<{
  id: string;
  shown: Shown;
  face: Face;
  item: Item | undefined;
  dismiss: () => void;
  retry: () => void;
  open: () => void;
}>) {
  const { held, handlers } = useHeld();

  const settled =
    shown.kind === "item" && item !== undefined && isSettled(viewOf(item, shown.refreshed));

  const itemTitle = settled ? (item?.title ?? null) : null;

  useCloseAfter(settled && !held, dismiss);

  return (
    <div id={id} className="ps paste-card" role={face.alert ? "alert" : undefined} {...handlers}>
      <p className="ps-head">
        <Icon
          name={face.icon}
          className={face.icon === "spin" ? `ic ${face.tone} spin` : `ic ${face.tone}`}
        />
        <span className="ps-title">{face.title}</span>
      </p>
      {itemTitle === null ? null : <p className="ps-item">{itemTitle}</p>}
      {shown.url === "" ? null : <p className="ps-url">{shown.url.replace(SCHEME_AND_WWW, "")}</p>}
      {face.note === null ? null : <p className="ps-sub">{face.note}</p>}
      <Actions actions={face.actions} dismiss={dismiss} retry={retry} open={open} />
    </div>
  );
}
