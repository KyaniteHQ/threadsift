import { useRef } from "react";

import { LookPanel } from "./LookPanel.tsx";
import { useRowFit } from "./masthead-fit.ts";
import { OwnerMenu } from "./OwnerMenu.tsx";
import { PrimaryNav } from "./PrimaryNav.tsx";
import { useShell } from "./shell-context.ts";
import { usePanelState } from "./use-panel.ts";
import { MastheadBrand } from "./Wordmark.tsx";

export function Masthead({
  inert = false,
  hidden = false,
}: Readonly<{ inert?: boolean; hidden?: boolean }>) {
  const shell = useShell();
  const { look, place } = shell;
  const bar = useRef<HTMLElement>(null);
  const lookPanel = usePanelState();
  const crowded = useRowFit(bar, !look.narrow, JSON.stringify(look.settings));
  const menu = look.narrow || crowded;

  return (
    <header ref={bar} className="masthead" inert={inert} data-covered={hidden || undefined}>
      <MastheadBrand home={place === "library"} />
      {menu ? null : <PrimaryNav place={place} className="mh-nav" />}
      <div className="mh-end">
        <LookPanel look={look} panel={lookPanel} />
        <OwnerMenu shell={shell} menu={menu} />
      </div>
    </header>
  );
}
