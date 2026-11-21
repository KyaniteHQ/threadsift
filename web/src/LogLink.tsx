import { useNavigateLink } from "./navigate-context.ts";

export function LogLink({
  href,
  label,
  text,
}: Readonly<{ href: string; label?: string; text: string }>) {
  const follow = useNavigateLink(href);

  return (
    <a className="lg-link" href={href} aria-label={label} onClick={follow}>
      <bdi dir="auto">{text}</bdi>
    </a>
  );
}
