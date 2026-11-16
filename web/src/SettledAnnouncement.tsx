import { useCallback, useState } from "react";

import { ANNOUNCE_SETTLE_MS, Announcement } from "./Announcement.tsx";
import { useAfter } from "./use-form.ts";

function useSettled(text: string | null, active: boolean): string {
  const [settled, setSettled] = useState("");

  const settle = useCallback(() => {
    if (text !== null) setSettled(text);
  }, [text]);

  if (!active && text !== null && settled !== text) setSettled(text);

  useAfter(active && text !== null && settled !== text, ANNOUNCE_SETTLE_MS, settle);

  return settled;
}

export function SettledAnnouncement({
  text,
  active = true,
}: Readonly<{ text: string | null; active?: boolean }>) {
  return <Announcement text={useSettled(text, active)} failed={false} />;
}
