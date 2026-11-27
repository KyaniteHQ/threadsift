import { InternalLink } from "./InternalLink.tsx";
import { LIBRARY_PATH } from "./routing.ts";
import { WORDMARK_LINK_LABEL } from "./text.ts";

export function Wordmark() {
  return (
    <>
      Thread<span className="wm-sift">sift</span>
    </>
  );
}

export function MastheadBrand({ home }: Readonly<{ home: boolean }>) {
  return home ? (
    <h1 className="wordmark">
      <Wordmark />
    </h1>
  ) : (
    <InternalLink className="wordmark" to={LIBRARY_PATH} aria-label={WORDMARK_LINK_LABEL}>
      <Wordmark />
    </InternalLink>
  );
}
