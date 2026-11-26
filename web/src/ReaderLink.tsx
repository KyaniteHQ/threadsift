import { createContext, use, type ReactNode } from "react";

import {
  FAILED_PICTURE,
  FOOTNOTE_BACKREF,
  FOOTNOTE_BACKREF_PROPERTY,
  FOOTNOTE_LABEL_ID,
  FOOTNOTE_REF,
  FOOTNOTE_REF_PROPERTY,
} from "../../src/core/contract/projection-markers.ts";
import type { HastNode } from "../../src/core/contract/text-projection.ts";

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
  readonly node?: HastNode | undefined;
  readonly href?: string | undefined;
  readonly "aria-label"?: string | undefined;
  readonly "aria-describedby"?: string | undefined;
  readonly failedPicture?: string | undefined;
}

export function Link({
  node,
  href,
  id,
  className,
  children,
  "aria-label": label,
  "aria-describedby": describedBy,
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
        [FOOTNOTE_REF]: node?.properties?.[FOOTNOTE_REF_PROPERTY],
        [FOOTNOTE_BACKREF]: node?.properties?.[FOOTNOTE_BACKREF_PROPERTY],
        [FAILED_PICTURE]: failedPicture,
      }}
    >
      {children}
    </a>
  );
}
