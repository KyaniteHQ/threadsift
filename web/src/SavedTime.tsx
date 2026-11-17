import { savedLabel } from "./saved-label.ts";

export function SavedTime({ savedAt, now }: Readonly<{ savedAt: number; now: number }>) {
  return (
    <time className="it-date" dateTime={new Date(savedAt).toISOString()}>
      {savedLabel(savedAt, now)}
    </time>
  );
}
