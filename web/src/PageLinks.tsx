import { SETTINGS } from "./access-text.ts";
import { HIGHLIGHTS_PAGE } from "./highlights-page-text.ts";
import { IMPORT } from "./import-text.ts";
import {
  HIGHLIGHTS_PATH,
  IMPORT_PATH,
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
      <PageLink path={SETTINGS_PATH} label={SETTINGS.instanceSettings} open={pages.settings} />
    </div>
  );
}
