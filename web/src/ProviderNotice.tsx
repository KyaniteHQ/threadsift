import { IMPORT, planNoticeLabel } from "./import-text.ts";
import { type Pages, SETTINGS_PATH, useInternalLink } from "./routing.ts";
import { useProviderNotice } from "./use-provider-notice.ts";

export function ProviderNotice({ pages }: Readonly<{ pages: Pages }>) {
  const notice = useProviderNotice();
  const follow = useInternalLink(pages.settings);

  if (notice.kind === "none") return null;

  return (
    <div className="sec imp-notice">
      <p>{notice.kind === "plan" ? planNoticeLabel(notice.provider) : IMPORT.noProvider}</p>
      <a className="fl-link" href={SETTINGS_PATH} onClick={follow}>
        {IMPORT.aiSettingsLink}
      </a>
    </div>
  );
}
