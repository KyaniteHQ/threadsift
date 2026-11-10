import { type ComponentProps, Fragment, type ReactElement, createElement, use } from "react";

import { HighlightAction } from "./HighlightAction.tsx";
import { useSpans } from "./highlights-context.ts";

type PostTextExports = typeof import("./PostText.tsx");

type PostTextLoad =
  | { readonly kind: "ready"; readonly PostText: PostTextExports["PostText"] }
  | { readonly kind: "failed" };

export class PostTextUnavailable extends Error {}

let loading: Promise<PostTextLoad> | null = null;

export function postTextModule(): Promise<PostTextLoad> {
  loading ??= import("./PostText.tsx").then(
    ({ PostText }): PostTextLoad => ({ kind: "ready", PostText }),
    (): PostTextLoad => ({ kind: "failed" }),
  );

  return loading;
}

export function PostTextView({
  targetKey,
  ...props
}: Readonly<
  Omit<ComponentProps<PostTextExports["PostText"]>, "spans"> & { targetKey: string }
>): ReactElement {
  const loaded = use(postTextModule());
  const spans = useSpans(targetKey);

  if (loaded.kind === "failed") throw new PostTextUnavailable();

  return createElement(
    Fragment,
    null,
    createElement(loaded.PostText, { ...props, targetKey, spans }),
    createElement(HighlightAction, { targetKey }),
  );
}
