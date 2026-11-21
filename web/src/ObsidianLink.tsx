import { InternalLink } from "./InternalLink.tsx";
import { OBSIDIAN_TEXT } from "./obsidian-text.ts";
import { OBSIDIAN_PATH } from "./routing.ts";

export function ObsidianLink() {
  return (
    <section className="sec">
      <InternalLink className="fl-link" to={OBSIDIAN_PATH}>
        {OBSIDIAN_TEXT.title}
      </InternalLink>
    </section>
  );
}
