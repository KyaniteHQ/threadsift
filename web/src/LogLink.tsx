import { useInternalLink } from "./routing.ts";

export function LogLink({
  href,
  open,
  label,
  text,
}: Readonly<{ href: string; open: () => void; label?: string; text: string }>) {
  const follow = useInternalLink(open);

  return (
    <a className="lg-link" href={href} aria-label={label} onClick={follow}>
      <bdi dir="auto">{text}</bdi>
    </a>
  );
}
