import type { Announcement as AnnouncementState } from "./use-announcement.ts";

export function Announcement({ text, failed }: Readonly<AnnouncementState>) {
  return failed ? (
    <div className="vh" role="alert">
      {text}
    </div>
  ) : (
    <output className="vh" aria-live="polite">
      {text}
    </output>
  );
}
