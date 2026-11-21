import { useNavigateLink } from "./navigate-context.ts";
import { OBSIDIAN_TEXT } from "./obsidian-text.ts";
import { OBSIDIAN_PATH } from "./routing.ts";

export function ObsidianLink() {
  const follow = useNavigateLink(OBSIDIAN_PATH);

  return (
    <section className="sec">
      <a className="fl-link" href={OBSIDIAN_PATH} onClick={follow}>
        {OBSIDIAN_TEXT.title}
      </a>
    </section>
  );
}
