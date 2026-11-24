import type { MouseEvent } from "react";

import type { More } from "./list-paging.ts";
import { LOADING_MORE, LOAD_MORE, RETRY_LABEL } from "./text.ts";

const VARIANTS = {
  page: { box: "rl-more", note: "rd-note", loading: LOADING_MORE },
  column: { box: "noresults", note: undefined, loading: LOAD_MORE },
} as const;

type Variant = keyof typeof VARIANTS;

function moreLabel(more: More, loading: string): string {
  if (more === "loading") return loading;

  return more === "failed" ? RETRY_LABEL : LOAD_MORE;
}

export function LoadMore({
  more,
  failedText,
  disabled,
  loadMore,
  variant = "page",
}: Readonly<{
  more: More;
  failedText: string;
  disabled: boolean;
  loadMore: (event: MouseEvent<HTMLButtonElement>) => void;
  variant?: Variant;
}>) {
  const { box, note, loading } = VARIANTS[variant];

  return (
    <div className={box}>
      <p className={note} role="alert">
        {more === "failed" ? failedText : null}
      </p>
      <button type="button" className="btn" aria-disabled={disabled} onClick={loadMore}>
        {moreLabel(more, loading)}
      </button>
    </div>
  );
}
