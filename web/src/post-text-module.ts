import { type ComponentProps, type ReactElement, createElement, use } from "react";

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

export function PostTextView(
  props: Readonly<ComponentProps<PostTextExports["PostText"]>>,
): ReactElement {
  const loaded = use(postTextModule());

  if (loaded.kind === "failed") throw new PostTextUnavailable();

  return createElement(loaded.PostText, props);
}
