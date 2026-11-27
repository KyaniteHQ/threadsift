import { InternalLink } from "./InternalLink.tsx";
import { AI_SETTINGS_PATH } from "./routing.ts";
import { AI_SETTINGS_LINK } from "./text.ts";

export function AiSettingsLink() {
  return (
    <InternalLink className="fl-link" to={AI_SETTINGS_PATH}>
      {AI_SETTINGS_LINK}
    </InternalLink>
  );
}
