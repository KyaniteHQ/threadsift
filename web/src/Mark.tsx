import type { ReactNode } from "react";

export function Mark({
  children,
  "data-highlights": highlights,
}: Readonly<{ children?: ReactNode; "data-highlights"?: string | undefined }>) {
  return (
    <mark data-highlights={highlights} tabIndex={-1}>
      {children}
    </mark>
  );
}
