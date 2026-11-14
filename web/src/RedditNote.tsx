import { IMPORT, redditNoteLabel } from "./import-text.ts";
import { REDDIT_ACCOUNT_TEXT } from "./reddit-account-text.ts";
import { REDDIT_TEXT } from "./reddit-text.ts";
import { type Pages, SETTINGS_PATH, useInternalLink } from "./routing.ts";
import { redditLinkCount, useRedditNote } from "./use-reddit-note.ts";

const ARCHIVE_FILLED = {
  none: REDDIT_ACCOUNT_TEXT.stateNone,
  expired: IMPORT.redditExpired,
  unreadable: REDDIT_ACCOUNT_TEXT.stateUnreadable,
} as const;

function notConnectedText(state: keyof typeof ARCHIVE_FILLED, archiveFill: boolean): string {
  if (state === "unreadable" || archiveFill) return ARCHIVE_FILLED[state];

  return REDDIT_TEXT.stateOff;
}

export function RedditNote({
  pages,
  links,
  finished,
}: Readonly<{ pages: Pages; links: readonly string[]; finished: boolean }>) {
  const note = useRedditNote();
  const follow = useInternalLink(pages.settings);
  const count = redditLinkCount(links);

  if (note.state === "unknown" || note.state === "missing" || count === 0) return null;

  return (
    <div className="sec imp-notice">
      {note.state === "connected" ? (
        <p>{redditNoteLabel(count, finished)}</p>
      ) : (
        <>
          <p>{notConnectedText(note.state, note.archiveFill)}</p>
          <a className="fl-link" href={SETTINGS_PATH} onClick={follow}>
            {IMPORT.redditSettingsLink}
          </a>
        </>
      )}
    </div>
  );
}
