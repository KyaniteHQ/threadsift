import { useCallback } from "react";

import type { Item } from "../../src/core/contract/item-wire.ts";
import { Icon } from "./Icon.tsx";
import { InternalLink } from "./InternalLink.tsx";
import { Byline } from "./ItemRowLines.tsx";
import { offersFetchRetry, rejectsToken } from "./paste-card.ts";
import { SETTINGS_PATH } from "./routing.ts";
import {
  CARD_TITLES,
  DIGEST_UPDATE_FAILED,
  DIGEST_FAILED,
  NOTICES,
  RETRY_LABEL,
  TOKEN_REFUSED,
  failureTitleOf,
} from "./text.ts";
import { WaitText } from "./WaitText.tsx";

export type RowIds = Readonly<{
  title: string;
  meta: string;
  byline: string;
  open: string;
  read: string;
  retry: string;
}>;

export function rowIds(base: string): RowIds {
  return {
    title: `${base}-title`,
    meta: `${base}-meta`,
    byline: `${base}-byline`,
    open: `${base}-open`,
    read: `${base}-read`,
    retry: `${base}-retry`,
  };
}

export function controlName(own: string, ids: RowIds): string {
  return [own, ids.title, ids.meta, ids.byline].join(" ");
}

export function linkName(ids: RowIds): string {
  return [ids.open, ids.meta, ids.byline].join(" ");
}

function showsSkeleton(item: Readonly<Item>): boolean {
  return item.status === "processing" && item.title === null && item.wait === null;
}

function Failed({
  item,
  ids,
  tryAgain,
}: Readonly<{
  item: Exclude<Item, { retry: null }>;
  ids: RowIds;
  tryAgain: (item: Item) => void;
}>) {
  const retry = useCallback(() => {
    tryAgain(item);
  }, [item, tryAgain]);

  return (
    <div className="it-fail">
      <p>
        <Icon name="warn" className="ic ic-s tone-warn" />
        {item.status === "failed"
          ? failureTitleOf(item)
          : offersFetchRetry(item)
            ? NOTICES[item.xNote]
            : item.digestTitle === null
              ? DIGEST_FAILED
              : DIGEST_UPDATE_FAILED}
      </p>
      <button
        type="button"
        id={ids.retry}
        className="btn"
        aria-labelledby={controlName(ids.retry, ids)}
        onClick={retry}
      >
        {RETRY_LABEL}
      </button>
    </div>
  );
}

function TokenRefused() {
  return (
    <div className="it-fail">
      <p>
        <Icon name="warn" className="ic ic-s tone-warn" />
        {TOKEN_REFUSED.message}
      </p>
      <InternalLink className="btn" to={SETTINGS_PATH}>
        {TOKEN_REFUSED.link}
      </InternalLink>
    </div>
  );
}

function Waiting({ wait }: Readonly<{ wait: NonNullable<Item["wait"]> }>) {
  return (
    <div className="it-fail">
      <p>
        <Icon name="refresh" className="ic ic-s tone-acc" />
        <WaitText wait={wait} />
      </p>
    </div>
  );
}

function Skeleton() {
  return (
    <>
      <div className="skel" aria-hidden="true">
        <i />
      </div>
      <span className="vh">{CARD_TITLES.reading}</span>
    </>
  );
}

export function Status({
  item,
  now,
  ids,
  tryAgain,
}: Readonly<{ item: Item; now: number; ids: RowIds; tryAgain: (item: Item) => void }>) {
  const byline = <Byline item={item} now={now} id={ids.byline} />;

  if (showsSkeleton(item)) {
    return (
      <>
        <div className="it-end">{byline}</div>
        <Skeleton />
      </>
    );
  }

  return (
    <div className="it-end">
      {byline}
      {rejectsToken(item) ? <TokenRefused /> : null}
      {item.wait === null ? null : <Waiting wait={item.wait} />}
      {item.retry === null ? null : <Failed item={item} ids={ids} tryAgain={tryAgain} />}
    </div>
  );
}
