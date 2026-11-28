import { IMPORT, planNoticeLabel } from "./import-text.ts";
import { PlaceLink } from "./PlaceLink.tsx";
import { useProviderNotice } from "./use-provider-notice.ts";

export function ProviderNotice() {
  const notice = useProviderNotice();

  if (notice.kind === "none") return null;

  return (
    <div className="flat-note imp-notice">
      <p>{notice.kind === "plan" ? planNoticeLabel(notice.provider) : IMPORT.noProvider}</p>
      <PlaceLink to="ai-settings" />
    </div>
  );
}
