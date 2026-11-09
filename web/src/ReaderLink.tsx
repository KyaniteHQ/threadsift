import { createContext, use, type ReactNode } from "react";

import { FOOTNOTE_LABEL_ID } from "../../src/core/reader-url.ts";

export const FootnoteScope = createContext("");

export function scoped(scope: string, id: string | undefined): string | undefined {
  return id === FOOTNOTE_LABEL_ID ? `${scope}-${id}` : id;
}

export interface Generated {
  readonly id?: string | undefined;
  readonly className?: string | undefined;
  readonly children?: ReactNode;
}

export function classed(base: string, extra: string | undefined): string {
  return extra === undefined ? base : `${base} ${extra}`;
}

interface LinkAttributes extends Generated {
  readonly href?: string | undefined;
  readonly "aria-label"?: string | undefined;
  readonly "aria-describedby"?: string | undefined;
  readonly "data-footnote-ref"?: string | undefined;
  readonly "data-footnote-backref"?: string | undefined;
}

export function Link({
  href,
  id,
  className,
  children,
  "aria-label": label,
  "aria-describedby": describedBy,
  "data-footnote-ref": footnoteRef,
  "data-footnote-backref": footnoteBackref,
}: Readonly<LinkAttributes>) {
  const scope = use(FootnoteScope);

  if (href === undefined || href === "") return <span>{children}</span>;

  const inside = href.startsWith("#");

  return (
    <a
      id={id}
      className={classed("il-a", className)}
      href={href}
      target={inside ? undefined : "_blank"}
      rel={inside ? undefined : "noopener noreferrer"}
      aria-label={label}
      aria-describedby={scoped(scope, describedBy)}
      data-footnote-ref={footnoteRef}
      data-footnote-backref={footnoteBackref}
    >
      {children}
    </a>
  );
}
