import type { Announcement as AnnouncementState } from "./use-announcement.ts";

export const ANNOUNCE_SETTLE_MS = 500;

export function Announcement({ text, failed }: Readonly<AnnouncementState>) {
  return (
    <>
      <output className="vh" aria-live="polite">
        {failed ? null : text}
      </output>
      <div className="vh" role="alert">
        {failed ? text : null}
      </div>
    </>
  );
}
