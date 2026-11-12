import type { ReactNode } from "react";

import { ModuleBoundary } from "./ModuleBoundary.tsx";
import { POST_TEXT_FAILED } from "./reader-text.ts";
import { RETRY_LABEL } from "./text.ts";

function postTextFailed(retry: () => void): ReactNode {
  return (
    <div className="rd-orig" role="alert">
      <p className="rd-note">{POST_TEXT_FAILED}</p>
      <button type="button" className="btn btn-block" onClick={retry}>
        {RETRY_LABEL}
      </button>
    </div>
  );
}

export function PostTextBoundary({ children }: Readonly<{ children: ReactNode }>) {
  return <ModuleBoundary fallback={postTextFailed}>{children}</ModuleBoundary>;
}
