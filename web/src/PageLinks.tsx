import { SETTINGS } from "./access-text.ts";
import { HIGHLIGHTS_PAGE } from "./highlights-page-text.ts";
import { IMPORT } from "./import-text.ts";
import { INDEX_PAGE } from "./index-text.ts";
import { LOG_PAGE } from "./log-text.ts";
import { PROPOSALS_PAGE } from "./proposals-text.ts";
import {
  HIGHLIGHTS_PATH,
  IMPORT_PATH,
  INDEX_PATH,
  LOG_PATH,
  PROPOSALS_PATH,
  type Pages,
  SETTINGS_PATH,
  useInternalLink,
} from "./routing.ts";

function PageLink({
  path,
  label,
  open,
}: Readonly<{ path: string; label: string; open: () => void }>) {
  const follow = useInternalLink(open);

  return (
    <a className="fl-link" href={path} onClick={follow}>
      {label}
    </a>
  );
}

export function PageLinks({ pages }: Readonly<{ pages: Pages }>) {
  return (
    <div className="st-more">
      <PageLink path={HIGHLIGHTS_PATH} label={HIGHLIGHTS_PAGE.masthead} open={pages.highlights} />
      <PageLink path={IMPORT_PATH} label={IMPORT.settingsLink} open={pages.import} />
      <PageLink path={INDEX_PATH} label={INDEX_PAGE.masthead} open={pages.index} />
      <PageLink path={LOG_PATH} label={LOG_PAGE.masthead} open={pages.log} />
      <PageLink path={PROPOSALS_PATH} label={PROPOSALS_PAGE.masthead} open={pages.proposals} />
      <PageLink path={SETTINGS_PATH} label={SETTINGS.instanceSettings} open={pages.settings} />
    </div>
  );
}
