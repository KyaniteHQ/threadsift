import { INDEX_PAGE } from "./index-text.ts";
import { InternalLink } from "./InternalLink.tsx";
import { AI_SETTINGS_PATH, INDEX_PATH, LIBRARY_PATH } from "./routing.ts";
import { AI_SETTINGS_LINK, LIBRARY_LINK } from "./text.ts";

const PLACES = {
  library: { path: LIBRARY_PATH, text: LIBRARY_LINK },
  "ai-settings": { path: AI_SETTINGS_PATH, text: AI_SETTINGS_LINK },
  index: { path: INDEX_PATH, text: INDEX_PAGE.masthead },
} as const;

export type Place = keyof typeof PLACES;

export function PlaceLink({ to }: Readonly<{ to: Place }>) {
  return (
    <InternalLink className="fl-link" to={PLACES[to].path}>
      {PLACES[to].text}
    </InternalLink>
  );
}
