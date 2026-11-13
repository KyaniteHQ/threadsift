import type { MouseEvent } from "react";

import { LOADING_MORE, LOAD_MORE, RETRY_LABEL } from "./text.ts";

export type More = "idle" | "loading" | "failed";

function moreLabel(more: More): string {
  if (more === "loading") return LOADING_MORE;

  return more === "failed" ? RETRY_LABEL : LOAD_MORE;
}

export function LoadMore({
  more,
  failedText,
  disabled,
  loadMore,
}: Readonly<{
  more: More;
  failedText: string;
  disabled: boolean;
  loadMore: (event: MouseEvent<HTMLButtonElement>) => void;
}>) {
  return (
    <div className="rl-more">
      {more === "failed" ? (
        <p className="rd-note" role="alert">
          {failedText}
        </p>
      ) : null}
      <button type="button" className="btn" aria-disabled={disabled} onClick={loadMore}>
        {moreLabel(more)}
      </button>
    </div>
  );
}
