import type { ReactNode } from "react";

import { Announcement } from "./Announcement.tsx";
import { Sheet, type SheetNav } from "./Sheet.tsx";
import type { Announcement as AnnouncementState } from "./use-announcement.ts";
import type { Look } from "./use-root.ts";

export function Placed({
  place,
  titleId,
  nav,
  announcement,
  children,
}: Readonly<{
  place: Look["reader"];
  titleId: string;
  nav: SheetNav;
  announcement: AnnouncementState;
  children: ReactNode;
}>) {
  return place === "sheet" ? (
    <Sheet titleId={titleId} nav={nav}>
      {children}
      <Announcement {...announcement} />
    </Sheet>
  ) : (
    children
  );
}
