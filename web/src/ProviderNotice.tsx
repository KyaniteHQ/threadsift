import { IMPORT, planNoticeLabel } from "./import-text.ts";
import { useNavigateLink } from "./navigate-context.ts";
import { SETTINGS_PATH } from "./routing.ts";
import { useProviderNotice } from "./use-provider-notice.ts";

export function ProviderNotice() {
  const notice = useProviderNotice();
  const follow = useNavigateLink(SETTINGS_PATH);

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
