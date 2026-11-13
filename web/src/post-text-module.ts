import { type ComponentProps, Fragment, type ReactElement, createElement } from "react";

import { HighlightAction } from "./HighlightAction.tsx";
import { useSpans } from "./highlights-context.ts";
import { lazyModule } from "./ModuleBoundary.tsx";

type PostTextExports = typeof import("./PostText.tsx");

const loadPostText = () => import("./PostText.tsx").then(({ PostText }) => PostText);

const LazyPostText = lazyModule(loadPostText);

let settled: Promise<boolean> | null = null;

export function postTextModule(): Promise<boolean> {
  settled ??= loadPostText().then(
    () => true,
    () => false,
  );

  return settled;
}

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
