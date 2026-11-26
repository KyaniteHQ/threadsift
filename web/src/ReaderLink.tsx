import { createContext, use, type ReactNode } from "react";

import {
  FAILED_PICTURE,
  FOOTNOTE_BACKREF,
  FOOTNOTE_LABEL_ID,
  FOOTNOTE_REF,
} from "../../src/core/contract/reader-url.ts";

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
  readonly [FOOTNOTE_REF]?: string | undefined;
  readonly [FOOTNOTE_BACKREF]?: string | undefined;
  readonly failedPicture?: string | undefined;
}

export function Link({
  href,
  id,
  className,
  children,
  "aria-label": label,
  "aria-describedby": describedBy,
  [FOOTNOTE_REF]: footnoteRef,
  [FOOTNOTE_BACKREF]: footnoteBackref,
  failedPicture,
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
      {...{
        [FOOTNOTE_REF]: footnoteRef,
        [FOOTNOTE_BACKREF]: footnoteBackref,
        [FAILED_PICTURE]: failedPicture,
      }}
    >
      {children}
    </a>
  );
}
