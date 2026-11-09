import { type ComponentProps, Fragment, type ReactElement, createElement, use } from "react";

import type { HighlightTarget } from "../../src/core/highlight-contract.ts";
import { keyOf } from "./highlight-target.ts";
import { HighlightAction } from "./HighlightAction.tsx";

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
  target,
  ...props
}: Readonly<
  Omit<ComponentProps<PostTextExports["PostText"]>, "targetKey"> & { target: HighlightTarget }
>): ReactElement {
  const loaded = use(postTextModule());

  if (loaded.kind === "failed") throw new PostTextUnavailable();

  const targetKey = keyOf(target);

  return createElement(
    Fragment,
    null,
    createElement(loaded.PostText, { ...props, targetKey }),
    createElement(HighlightAction, { targetKey }),
  );
}
