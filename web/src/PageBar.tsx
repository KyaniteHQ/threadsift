import { useRef } from "react";

import { InternalLink } from "./InternalLink.tsx";
import { LIBRARY_PATH } from "./routing.ts";
import { BACK_TO_LIBRARY } from "./text.ts";
import { useFocusOnMount } from "./use-form.ts";

const LIBRARY_BACK = { href: LIBRARY_PATH, label: BACK_TO_LIBRARY };

export function PageBar({
  title,
  ready = true,
  backLink = LIBRARY_BACK,
}: Readonly<{
  title: string;
  ready?: boolean;
  backLink?: Readonly<{ href: string; label: string }>;
}>) {
  const heading = useRef<HTMLHeadingElement>(null);

  useFocusOnMount(heading, ready);

  return (
    <header className="pg-bar">
      <div className="pg-bar-in">
        <InternalLink className="btn" to={backLink.href}>
          {backLink.label}
        </InternalLink>
        <h1 ref={heading} className="pg-title" tabIndex={-1}>
          {title}
        </h1>
      </div>
    </header>
  );
}
