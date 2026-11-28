import { type MouseEvent, useRef } from "react";

import { InternalLink } from "./InternalLink.tsx";
import { useSidewaysFade } from "./scroll-fades.ts";
import type { SettingsLink } from "./settings-links.ts";
import { SETTINGS_LINKS } from "./SettingsSections.tsx";
import { SETTINGS_SECTIONS_LABEL } from "./text.ts";
import { useSectionInView } from "./use-section-in-view.ts";

const SECTION_IDS: readonly string[] = SETTINGS_LINKS.flatMap((link) =>
  link.kind === "section" ? [link.id] : [],
);

function focusHeading(event: MouseEvent<HTMLAnchorElement>): void {
  const heading = document.querySelector(`${event.currentTarget.hash} h2`);

  requestAnimationFrame(() => {
    if (heading instanceof HTMLElement) heading.focus({ preventScroll: true });
  });
}

function RailEntry({ link, current }: Readonly<{ link: SettingsLink; current: string | null }>) {
  return link.kind === "section" ? (
    <a
      className="nav-link"
      href={`#${link.id}`}
      aria-current={link.id === current ? "location" : undefined}
      onClick={focusHeading}
    >
      {link.title}
    </a>
  ) : (
    <InternalLink className="nav-link" to={link.path}>
      {link.title}
    </InternalLink>
  );
}

export function SettingsRail({ ready }: Readonly<{ ready: boolean }>) {
  const rail = useRef<HTMLElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const current = useSectionInView(rail, SECTION_IDS, ready);

  useSidewaysFade(box);

  return (
    <nav ref={rail} className="st-rail" aria-label={SETTINGS_SECTIONS_LABEL}>
      <div ref={box} className="sxw">
        <div className="sx">
          <ul role="list">
            {SETTINGS_LINKS.map((link) => (
              <li key={link.title}>
                <RailEntry link={link} current={current} />
              </li>
            ))}
          </ul>
        </div>
      </div>
    </nav>
  );
}
