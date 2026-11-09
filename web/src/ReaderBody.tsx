import { type RefObject, use, useMemo } from "react";

import type { Item } from "../../src/http/schemas.ts";
import { BASE_SAMPLE, FACE_WAIT_MS, LOOK_FONTS, sampleOf } from "./load-fonts.ts";
import { postTextModule } from "./post-text-module.ts";
import { ReaderHead, ReaderLoading } from "./ReaderColumn.tsx";
import { ReaderContent } from "./ReaderContent.tsx";
import { useFaces } from "./use-faces.ts";
import type { DetailActions, DetailState } from "./use-item-detail.ts";
import { useReadingPlace } from "./use-reading-place.ts";

function sampleOfDetail(state: DetailState): string | null {
  switch (state.status) {
    case "loading":
      return null;
    case "failed":
      return BASE_SAMPLE;
    case "ready":
      return sampleOf(JSON.stringify(state.detail));
    default: {
      const exhaustive: never = state;

      return exhaustive;
    }
  }
}

export function ReaderBody({
  item,
  slot,
  state,
  actions,
  now,
  settingsKey,
  titleId,
  focusTitle,
  tryAgain,
}: Readonly<{
  item: Item;
  slot: RefObject<HTMLElement | null>;
  state: DetailState;
  actions: DetailActions;
  now: number;
  settingsKey: string;
  titleId: string;
  focusTitle: boolean;
  tryAgain: (item: Item) => void;
}>) {
  use(postTextModule());
  const sample = useMemo(() => sampleOfDetail(state), [state]);
  const [faces] = useFaces(slot, LOOK_FONTS, FACE_WAIT_MS, sample);
  const ready = state.status === "loading" || !faces ? null : state;
  useReadingPlace(slot, item.id, ready?.status === "ready", settingsKey);

  return (
    <>
      <ReaderHead
        item={item}
        detail={state.status === "ready" ? state.detail : null}
        now={now}
        titleId={titleId}
        focusTitle={focusTitle}
        loading={ready === null}
        tryAgain={tryAgain}
      />
      {ready === null ? (
        <ReaderLoading />
      ) : (
        <ReaderContent item={item} state={ready} actions={actions} tryAgain={tryAgain} now={now} />
      )}
    </>
  );
}
