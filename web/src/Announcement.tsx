import type { Announcement as AnnouncementState } from "./use-announcement.ts";

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
