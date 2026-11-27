import { NOTHING } from "../../src/core/contract/nothing.ts";
import { HIGHLIGHTS_PAGE } from "./highlights-page-text.ts";
import { INDEX_PAGE } from "./index-text.ts";
import { InternalLink } from "./InternalLink.tsx";
import { LOG_PAGE } from "./log-text.ts";
import { PROPOSALS_PAGE } from "./proposals-text.ts";
import { HIGHLIGHTS_PATH, INDEX_PATH, LIBRARY_PATH, LOG_PATH, PROPOSALS_PATH } from "./routing.ts";
import type { Place } from "./shell-context.ts";
import { LIBRARY_LINK, PAGES_NAV_LABEL } from "./text.ts";

const PAGES: readonly Readonly<{ place: Place; path: string; label: string }>[] = [
  { place: "library", path: LIBRARY_PATH, label: LIBRARY_LINK },
  { place: "index", path: INDEX_PATH, label: INDEX_PAGE.masthead },
  { place: "highlights", path: HIGHLIGHTS_PATH, label: HIGHLIGHTS_PAGE.masthead },
  { place: "proposals", path: PROPOSALS_PATH, label: PROPOSALS_PAGE.masthead },
  { place: "log", path: LOG_PATH, label: LOG_PAGE.masthead },
];

export function PrimaryNav({
  place,
  className,
  onFollow = NOTHING,
}: Readonly<{ place: Place | null; className: string; onFollow?: () => void }>) {
  return (
    <nav className={className} aria-label={PAGES_NAV_LABEL}>
      <ul role="list">
        {PAGES.map((page) => (
          <li key={page.place}>
            <InternalLink
              className="nav-link"
              to={page.path}
              aria-current={page.place === place ? "page" : undefined}
              onFollow={onFollow}
            >
              {page.label}
            </InternalLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
