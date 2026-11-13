import { useRef } from "react";

import { BAR_FONTS, FACE_WAIT_MS } from "./load-fonts.ts";
import { useInternalLink } from "./routing.ts";
import { BACK_TO_LIBRARY } from "./text.ts";
import { useFaces } from "./use-faces.ts";
import { useFocusOnMount } from "./use-form.ts";

export function PageBar({
  title,
  back,
  ready = true,
  faceWaitMs = FACE_WAIT_MS,
}: Readonly<{
  title: string;
  back: () => void;
  ready?: boolean;
  faceWaitMs?: number;
}>) {
  const bar = useRef<HTMLElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const [faces] = useFaces(bar, BAR_FONTS, faceWaitMs);
  const follow = useInternalLink(back);

  useFocusOnMount(heading, ready);

  return (
    <header ref={bar} className="pg-bar" data-faces={faces ? "loaded" : "loading"}>
      <div className="pg-bar-in">
        <a className="btn" href="/" onClick={follow}>
          {BACK_TO_LIBRARY}
        </a>
        <h1 ref={heading} className="pg-title" tabIndex={-1}>
          {title}
        </h1>
      </div>
    </header>
  );
}
