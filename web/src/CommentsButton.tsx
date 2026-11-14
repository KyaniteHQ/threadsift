import { type MouseEvent, useCallback } from "react";

import type { CommentCount } from "../../src/core/comment-view.ts";
import { Icon } from "./Icon.tsx";
import { jumpToComments } from "./jump-to-comments.ts";
import { commentsButtonLabels } from "./reader-text.ts";

export function CommentsButton({ counts }: Readonly<{ counts: CommentCount }>) {
  const labels = commentsButtonLabels(counts);

  const jump = useCallback((event: MouseEvent<HTMLButtonElement>) => {
    jumpToComments(event.currentTarget);
  }, []);

  return (
    <button type="button" className="btn rd-cm full" aria-label={labels.full} onClick={jump}>
      <Icon name="comment" className="ic rd-cm-ic" />
      <span className="rd-cm-full">{labels.full}</span>
      <span className="rd-cm-short" hidden>
        {labels.short}
      </span>
      <span className="rd-cm-count" hidden>
        {labels.count}
      </span>
    </button>
  );
}
