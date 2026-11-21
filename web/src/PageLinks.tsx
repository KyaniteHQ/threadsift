import { SETTINGS } from "./access-text.ts";
import { HIGHLIGHTS_PAGE } from "./highlights-page-text.ts";
import { IMPORT } from "./import-text.ts";
import { INDEX_PAGE } from "./index-text.ts";
import { LOG_PAGE } from "./log-text.ts";
import { useNavigateLink } from "./navigate-context.ts";
import { PROPOSALS_PAGE } from "./proposals-text.ts";
import {
  HIGHLIGHTS_PATH,
  IMPORT_PATH,
  INDEX_PATH,
  LOG_PATH,
  PROPOSALS_PATH,
  SETTINGS_PATH,
} from "./routing.ts";

function PageLinkItem({ path, label }: Readonly<{ path: string; label: string }>) {
  const follow = useNavigateLink(path);

  return (
    <li>
      <a className="fl-link" href={path} onClick={follow}>
        {label}
      </a>
    </li>
  );
}

export function PageLinks() {
  return (
    <nav className="st-more">
      <ul role="list">
        <PageLinkItem path={HIGHLIGHTS_PATH} label={HIGHLIGHTS_PAGE.masthead} />
        <PageLinkItem path={IMPORT_PATH} label={IMPORT.settingsLink} />
        <PageLinkItem path={INDEX_PATH} label={INDEX_PAGE.masthead} />
        <PageLinkItem path={LOG_PATH} label={LOG_PAGE.masthead} />
        <PageLinkItem path={PROPOSALS_PATH} label={PROPOSALS_PAGE.masthead} />
        <PageLinkItem path={SETTINGS_PATH} label={SETTINGS.instanceSettings} />
      </ul>
    </nav>
  );
}
