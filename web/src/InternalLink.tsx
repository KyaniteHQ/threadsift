import { type ReactNode, useCallback } from "react";

import { useNavigate } from "./navigate-context.ts";
import { useInternalLink } from "./routing.ts";

export function InternalLink({
  to,
  children,
  ...anchor
}: Readonly<{
  to: string;
  className: string;
  title?: string;
  "aria-label"?: string | undefined;
  "aria-describedby"?: string | undefined;
  children: ReactNode;
}>) {
  const navigate = useNavigate();

  const follow = useInternalLink(
    useCallback(() => {
      navigate(to);
    }, [navigate, to]),
  );

  return (
    <a {...anchor} href={to} onClick={follow}>
      {children}
    </a>
  );
}
