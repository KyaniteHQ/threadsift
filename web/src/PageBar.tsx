import { useRef } from "react";

import { useInternalLink } from "./routing.ts";
import { BACK_TO_LIBRARY } from "./text.ts";
import { useFocusOnMount } from "./use-form.ts";

export function PageBar({
  title,
  back,
  ready = true,
}: Readonly<{
  title: string;
  back: () => void;
  ready?: boolean;
}>) {
  const heading = useRef<HTMLHeadingElement>(null);
  const follow = useInternalLink(back);

  useFocusOnMount(heading, ready);

  return (
    <header className="pg-bar">
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
