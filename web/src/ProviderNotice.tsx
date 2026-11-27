import { AiSettingsLink } from "./AiSettingsLink.tsx";
import { IMPORT, planNoticeLabel } from "./import-text.ts";
import { useProviderNotice } from "./use-provider-notice.ts";

export function ProviderNotice() {
  const notice = useProviderNotice();

  if (notice.kind === "none") return null;

  return (
    <div className="sec imp-notice">
      <p>{notice.kind === "plan" ? planNoticeLabel(notice.provider) : IMPORT.noProvider}</p>
      <AiSettingsLink />
    </div>
  );
}
