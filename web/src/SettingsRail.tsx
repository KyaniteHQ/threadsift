import { InternalLink } from "./InternalLink.tsx";
import { SETTINGS_LINKS, type SettingsLink } from "./settings-links.ts";
import { SETTINGS_SECTIONS_LABEL } from "./text.ts";

function RailEntry({ link }: Readonly<{ link: SettingsLink }>) {
  return link.kind === "section" ? (
    <a className="nav-link" href={`#${link.id}`}>
      {link.title}
    </a>
  ) : (
    <InternalLink className="nav-link" to={link.path}>
      {link.title}
    </InternalLink>
  );
}

export function SettingsRail() {
  return (
    <nav className="st-rail" aria-label={SETTINGS_SECTIONS_LABEL}>
      <ul role="list">
        {SETTINGS_LINKS.map((link) => (
          <li key={link.title}>
            <RailEntry link={link} />
          </li>
        ))}
      </ul>
    </nav>
  );
}
