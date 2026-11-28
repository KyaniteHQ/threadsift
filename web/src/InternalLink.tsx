import { type ReactNode, useCallback } from "react";

import { NOTHING } from "../../src/core/contract/nothing.ts";
import { useNavigate } from "./navigate-context.ts";
import { useInternalLink } from "./routing.ts";

export function InternalLink({
  to,
  onFollow = NOTHING,
  children,
  ...anchor
}: Readonly<{
  to: string;
  className: string;
  title?: string;
  "aria-label"?: string | undefined;
  "aria-describedby"?: string | undefined;
  "aria-current"?: "page" | undefined;
  onFollow?: () => void;
  children: ReactNode;
}>) {
  const navigate = useNavigate();

  const follow = useInternalLink(
    useCallback(() => {
      onFollow();
      navigate(to);
    }, [navigate, onFollow, to]),
  );

  return (
    <a {...anchor} href={to} onClick={follow}>
      {children}
    </a>
  );
}
