import type { Item } from "../../src/core/contract/item-wire.ts";
import { InternalLink } from "./InternalLink.tsx";
import { rejectsToken } from "./paste-card.ts";
import { SETTINGS_PATH } from "./routing.ts";
import { TOKEN_REFUSED } from "./text.ts";

export function ReaderTokenRefused({ item }: Readonly<{ item: Item }>) {
  if (!rejectsToken(item)) return null;

  return (
    <>
      <p className="rd-note">{TOKEN_REFUSED.message}</p>
      <InternalLink className="btn" to={SETTINGS_PATH}>
        {TOKEN_REFUSED.link}
      </InternalLink>
    </>
  );
}
