import { IMPORT, redditNoteLabel } from "./import-text.ts";
import { type Pages, SETTINGS_PATH, useInternalLink } from "./routing.ts";
import { redditLinkCount, useRedditNote } from "./use-reddit-note.ts";

export function RedditNote({
  pages,
  links,
  finished,
}: Readonly<{ pages: Pages; links: readonly string[]; finished: boolean }>) {
  const note = useRedditNote();
  const follow = useInternalLink(pages.settings);
  const count = redditLinkCount(links);

  if (note === "none" || count === 0) return null;

  return (
    <div className="sec imp-notice">
      {note === "connected" ? (
        <p>{redditNoteLabel(count, finished)}</p>
      ) : (
        <>
          <p>{IMPORT.redditExpired}</p>
          <a className="fl-link" href={SETTINGS_PATH} onClick={follow}>
            {IMPORT.redditSettingsLink}
          </a>
        </>
      )}
    </div>
  );
}
