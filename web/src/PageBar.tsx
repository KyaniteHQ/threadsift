import { useRef } from "react";

import { useInternalLink } from "./routing.ts";
import { BACK_TO_LIBRARY } from "./text.ts";
import { useFocusOnMount } from "./use-form.ts";

const LIBRARY_BACK = { href: "/", label: BACK_TO_LIBRARY };

export function PageBar({
  title,
  back,
  ready = true,
  backLink = LIBRARY_BACK,
}: Readonly<{
  title: string;
  back: () => void;
  ready?: boolean;
  backLink?: Readonly<{ href: string; label: string }>;
}>) {
  const heading = useRef<HTMLHeadingElement>(null);
  const follow = useInternalLink(back);

  useFocusOnMount(heading, ready);

  return (
    <header className="pg-bar">
      <div className="pg-bar-in">
        <a className="btn" href={backLink.href} onClick={follow}>
          {backLink.label}
        </a>
        <h1 ref={heading} className="pg-title" tabIndex={-1}>
          {title}
        </h1>
      </div>
    </header>
  );
}
