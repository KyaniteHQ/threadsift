import { IMPORT, planNoticeLabel } from "./import-text.ts";
import { InternalLink } from "./InternalLink.tsx";
import { SETTINGS_PATH } from "./routing.ts";
import { useProviderNotice } from "./use-provider-notice.ts";

export function ProviderNotice() {
  const notice = useProviderNotice();

  if (notice.kind === "none") return null;

  return (
    <div className="sec imp-notice">
      <p>{notice.kind === "plan" ? planNoticeLabel(notice.provider) : IMPORT.noProvider}</p>
      <InternalLink className="fl-link" to={SETTINGS_PATH}>
        {IMPORT.aiSettingsLink}
      </InternalLink>
    </div>
  );
}
