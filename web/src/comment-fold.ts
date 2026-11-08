import { type RefObject, useLayoutEffect, useState } from "react";

import { pixelsOf } from "./css-length.ts";

const FOLD_OVER_LINES = 8;

export type CommentFold = "none" | "tall" | "long";

function foldOf(box: HTMLElement): CommentFold {
  const line = pixelsOf(getComputedStyle(box.querySelector(".md") ?? box).lineHeight);

  if (line === null || box.scrollHeight / line <= FOLD_OVER_LINES) return "none";

  const screen = box.closest(".reader-slot")?.clientHeight ?? innerHeight;

  return box.scrollHeight > screen ? "long" : "tall";
}

function unobserved(): void {}

export function useCommentFold(box: RefObject<HTMLElement | null>): CommentFold {
  const [fold, setFold] = useState<CommentFold>("none");

  useLayoutEffect(() => {
    const element = box.current;

    if (element === null) return unobserved;

    const measure = (): void => {
      setFold(foldOf(element));
    };

    const observer = new ResizeObserver(measure);
    observer.observe(element.querySelector(".md") ?? element);
    measure();
    void document.fonts.ready.then(measure);

    return () => {
      observer.disconnect();
    };
  }, [box]);

  return fold;
}
