import { type ReactNode, useRef } from "react";

import { InternalLink } from "./InternalLink.tsx";
import { Masthead } from "./Masthead.tsx";
import { OBSIDIAN_TEXT } from "./obsidian-text.ts";
import { INDEX_PATH, SETTINGS_PATH } from "./routing.ts";
import { TOPIC_PAGE } from "./topic-text.ts";
import { useFocusOnMount } from "./use-form.ts";

const BACK_LINKS = {
  index: { href: INDEX_PATH, label: TOPIC_PAGE.backToIndex },
  settings: { href: SETTINGS_PATH, label: OBSIDIAN_TEXT.backToSettings },
} as const;

type Back = keyof typeof BACK_LINKS;

function PageHead({
  title,
  ready,
  back,
}: Readonly<{ title: string; ready: boolean; back: Back | null }>) {
  const heading = useRef<HTMLHeadingElement>(null);

  useFocusOnMount(heading, ready);

  return (
    <div className="pg-head">
      {back === null ? null : (
        <InternalLink className="fl-link pg-back" to={BACK_LINKS[back].href}>
          {BACK_LINKS[back].label}
        </InternalLink>
      )}
      <h1 ref={heading} className="pg-title" tabIndex={-1}>
        {title}
      </h1>
    </div>
  );
}

export function PageFrame({
  title,
  ready = true,
  back = null,
  column = "page",
  children,
}: Readonly<{
  title: string;
  ready?: boolean;
  back?: Back | null;
  column?: "page" | "settings";
  children: ReactNode;
}>) {
  return (
    <>
      <Masthead />
      <div className="pg" data-column={column}>
        <PageHead title={title} ready={ready} back={back} />
        {children}
      </div>
    </>
  );
}
