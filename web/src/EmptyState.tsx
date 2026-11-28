import { Icon } from "./Icon.tsx";
import { type Place, PlaceLink } from "./PlaceLink.tsx";

export function EmptyState({
  heading,
  line,
  place,
  link = null,
}: Readonly<{ heading: string; line?: string; place: "page" | "library"; link?: Place | null }>) {
  return (
    <div className={place === "page" ? "pg-empty" : "empty"}>
      {place === "library" ? <Icon name="tray" className="ic ic-xl" /> : null}
      <h2 tabIndex={-1}>{heading}</h2>
      {line === undefined ? null : <p>{line}</p>}
      {link === null ? null : <PlaceLink to={link} />}
    </div>
  );
}
