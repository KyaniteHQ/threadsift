import { type ComponentProps, Fragment, type ReactElement, createElement, lazy } from "react";

import { HighlightAction } from "./HighlightAction.tsx";
import { useSpans } from "./highlights-context.ts";
import { unavailable } from "./module-unavailable.ts";

type PostTextExports = typeof import("./PostText.tsx");

let loading: Promise<PostTextExports> | null = null;

let ready: Promise<boolean> | null = null;

function postTextModule(): Promise<PostTextExports> {
  loading ??= import("./PostText.tsx").catch(unavailable);

  return loading;
}

export function postTextReady(): Promise<boolean> {
  ready ??= postTextModule().then(
    () => true,
    () => false,
  );

  return ready;
}

const LazyPostText = lazy(() => postTextModule().then(({ PostText }) => ({ default: PostText })));

export function PostTextView({
  targetKey,
  ...props
}: Readonly<
  Omit<ComponentProps<PostTextExports["PostText"]>, "spans"> & { targetKey: string }
>): ReactElement {
  const spans = useSpans(targetKey);

  return createElement(
    Fragment,
    null,
    createElement(LazyPostText, { ...props, targetKey, spans }),
    createElement(HighlightAction, { targetKey }),
  );
}
