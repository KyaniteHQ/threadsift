import { IMPORT, redditNoteLabel } from "./import-text.ts";
import { InternalLink } from "./InternalLink.tsx";
import { REDDIT_ACCOUNT_TEXT } from "./reddit-account-text.ts";
import { SETTINGS_PATH } from "./routing.ts";
import { redditLinkCount, useRedditNote } from "./use-reddit-note.ts";

const NOT_CONNECTED = {
  none: {
    on: REDDIT_ACCOUNT_TEXT.stateNoneFilled,
    off: REDDIT_ACCOUNT_TEXT.stateNoneLinkOnly,
  },
  expired: {
    on: REDDIT_ACCOUNT_TEXT.stateExpiredFilled,
    off: REDDIT_ACCOUNT_TEXT.stateExpiredLinkOnly,
  },
  unreadable: {
    on: IMPORT.redditUnreadableFilled,
    off: IMPORT.redditUnreadableLinkOnly,
  },
} as const;

function notConnectedText(state: keyof typeof NOT_CONNECTED, archiveFill: boolean): string {
  return NOT_CONNECTED[state][archiveFill ? "on" : "off"];
}

export function RedditNote({
  links,
  finished,
}: Readonly<{ links: readonly string[]; finished: boolean }>) {
  const note = useRedditNote();
  const count = redditLinkCount(links);

  if (note.state === "unknown" || note.state === "missing" || count === 0) return null;

  return (
    <div className="sec imp-notice">
      {note.state === "connected" ? (
        <p>{redditNoteLabel(count, finished)}</p>
      ) : (
        <>
          <p>{notConnectedText(note.state, note.archiveFill)}</p>
          <InternalLink className="fl-link" to={SETTINGS_PATH}>
            {IMPORT.redditSettingsLink}
          </InternalLink>
        </>
      )}
    </div>
  );
}
