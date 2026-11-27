import type { ReactNode } from "react";

import { InternalLink } from "./InternalLink.tsx";
import { LIBRARY_PATH } from "./routing.ts";
import { LIBRARY_LINK } from "./text.ts";

export function PageEmpty({
  heading,
  line,
  children,
}: Readonly<{ heading: string; line?: string; children?: ReactNode }>) {
  return (
    <div className="pg-empty">
      <h2 tabIndex={-1}>{heading}</h2>
      {line === undefined ? null : <p>{line}</p>}
      {children}
    </div>
  );
}

export function LibraryLink() {
  return (
    <InternalLink className="fl-link" to={LIBRARY_PATH}>
      {LIBRARY_LINK}
    </InternalLink>
  );
}
