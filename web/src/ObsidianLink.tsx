import { OBSIDIAN_TEXT } from "./obsidian-text.ts";
import { OBSIDIAN_PATH, useInternalLink } from "./routing.ts";

export function ObsidianLink({ open }: Readonly<{ open: () => void }>) {
  const follow = useInternalLink(open);
  return (
    <section className="sec">
      <a className="fl-link" href={OBSIDIAN_PATH} onClick={follow}>
        {OBSIDIAN_TEXT.title}
      </a>
    </section>
  );
}
