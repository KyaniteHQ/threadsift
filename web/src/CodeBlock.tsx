import { type RefObject, useCallback, useLayoutEffect, useRef, useState } from "react";

import { exceedsFold } from "./fold.ts";
import { useRevealed } from "./highlights-context.ts";
import { Mark } from "./Mark.tsx";
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

export interface CodePart {
  readonly key: number;
  readonly text: string;
  readonly highlights: string | null;
}

function idsOf(parts: readonly CodePart[]): readonly number[] {
  return parts.flatMap(({ highlights }) =>
    highlights === null ? [] : highlights.split(" ").map(Number),
  );
}

export function CodeBlock({ text, parts }: Readonly<{ text: string; parts: readonly CodePart[] }>) {
  const box = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const revealed = useRevealed(({ id }) => idsOf(parts).includes(id));

  if (revealed && !open) setOpen(true);

  const foldable = useFoldable(box);
  const lines = text.split("\n").length;

  const toggle = useCallback(() => {
    setOpen((now) => !now);
  }, []);

  return (
    <div ref={box} className={foldable && !open ? "code folded" : "code"}>
      <div className="sxw">
        <pre className="sx" data-label={codeName(lines)}>
          <code>
            {parts.map(({ key, text: part, highlights }) =>
              highlights === null ? (
                part
              ) : (
                <Mark key={key} data-highlights={highlights}>
                  {part}
                </Mark>
              ),
            )}
          </code>
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
