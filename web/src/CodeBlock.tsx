import { type RefObject, useCallback, useLayoutEffect, useRef, useState } from "react";

import { exceedsFold } from "./fold.ts";
import { FOLD_HIDE, codeName, foldShowLabel } from "./reader-text.ts";

function useFoldable(box: RefObject<HTMLElement | null>): boolean {
  const [foldable, setFoldable] = useState(false);

  useLayoutEffect(() => {
    const element = box.current;

    if (element === null) return;

    const measure = (): void => {
      setFoldable(exceedsFold(element));
    };

    measure();
    void document.fonts.ready.then(measure);
  }, [box]);

  return foldable;
}

export function CodeBlock({ text }: Readonly<{ text: string }>) {
  const box = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const foldable = useFoldable(box);
  const lines = text.split("\n").length;

  const toggle = useCallback(() => {
    setOpen((now) => !now);
  }, []);

  return (
    <div ref={box} className={foldable && !open ? "code folded" : "code"}>
      <div className="sxw">
        <pre className="sx" data-label={codeName(lines)}>
          <code>{text}</code>
        </pre>
      </div>
      {foldable ? (
        <button type="button" className="code-more" aria-expanded={open} onClick={toggle}>
          {open ? FOLD_HIDE : foldShowLabel(lines)}
        </button>
      ) : null}
    </div>
  );
}
