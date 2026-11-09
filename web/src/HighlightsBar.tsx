import { useRef } from "react";

import { HIGHLIGHTS_PAGE } from "./highlights-page-text.ts";
import { BAR_FONTS, FACE_WAIT_MS } from "./load-fonts.ts";
import { useInternalLink } from "./routing.ts";
import { useFaces } from "./use-faces.ts";
import { useFocusOnMount } from "./use-form.ts";

export function HighlightsBar({ back }: Readonly<{ back: () => void }>) {
  const bar = useRef<HTMLElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const [faces] = useFaces(bar, BAR_FONTS, FACE_WAIT_MS);
  const follow = useInternalLink(back);

  useFocusOnMount(title);

  return (
    <header ref={bar} className="pg-bar" data-faces={faces ? "loaded" : "loading"}>
      <div className="pg-bar-in">
        <a className="btn" href="/" onClick={follow}>
          {HIGHLIGHTS_PAGE.back}
        </a>
        <h1 ref={title} className="pg-title" tabIndex={-1}>
          {HIGHLIGHTS_PAGE.title}
        </h1>
      </div>
    </header>
  );
}
