import type { MouseEvent } from "react";

import { RETRY_LABEL, LOAD_MORE } from "./text.ts";
import { TOPIC_PAGE } from "./topic-text.ts";

export type More = "idle" | "loading" | "failed";

function moreLabel(more: More): string {
  if (more === "loading") return TOPIC_PAGE.loadingMore;

  return more === "failed" ? RETRY_LABEL : LOAD_MORE;
}

export function LoadMore({
  more,
  failedText,
  loadMore,
}: Readonly<{
  more: More;
  failedText: string;
  loadMore: (event: MouseEvent<HTMLButtonElement>) => void;
}>) {
  return (
    <div className="rl-more">
      {more === "failed" ? (
        <p className="rd-note" role="alert">
          {failedText}
        </p>
      ) : null}
      <button type="button" className="btn" aria-disabled={more === "loading"} onClick={loadMore}>
        {moreLabel(more)}
      </button>
    </div>
  );
}
