import { useCallback } from "react";

import { whereOf } from "../../src/core/links.ts";
import type { Item } from "../../src/http/schemas.ts";
import { Icon } from "./Icon.tsx";
import { SETTINGS_PATH } from "./routing.ts";
import { savedLabel } from "./saved-label.ts";
import {
  CARD_TITLES,
  DIGEST_NOT_UPDATED,
  FAILURE_TITLES,
  NO_DIGEST,
  RETRY_LABEL,
  SOURCE_LABELS,
  TOKEN_REFUSED,
  starsLabel,
} from "./text.ts";
import { WaitText } from "./WaitText.tsx";

function rejectsToken(item: Readonly<Item>): boolean {
  return item.status === "ready" && item.fetch === "github-token";
}

function showsSkeleton(item: Readonly<Item>): boolean {
  return item.status === "processing" && item.title === null && item.wait === null;
}

function Failed({
  item,
  describedBy,
  tryAgain,
}: Readonly<{
  item: Exclude<Item, { retry: null }>;
  describedBy: string;
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
          ? FAILURE_TITLES[item.reason]
          : item.digestTitle === null
            ? NO_DIGEST
            : DIGEST_NOT_UPDATED}
      </p>
      <button type="button" className="btn" aria-describedby={describedBy} onClick={retry}>
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
        {TOKEN_REFUSED.row}
      </p>
      <a className="btn" href={SETTINGS_PATH}>
        {TOKEN_REFUSED.link}
      </a>
    </div>
  );
}

function Waiting({ wait }: Readonly<{ wait: NonNullable<Item["wait"]> }>) {
  return (
    <div className="it-fail">
      <p>
        <Icon name="refresh" className="ic ic-s tone-acc" />
        <WaitText retryAt={wait.retryAt} />
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

function Foot({ item }: Readonly<{ item: Item }>) {
  if (item.digestTopic === null && item.stars === null) {
    return null;
  }

  return (
    <p className="it-foot">
      {item.digestTopic === null ? null : (
        <bdi className="it-topic" dir="auto">
          {item.digestTopic}
        </bdi>
      )}
      {item.stars === null ? null : <span>{starsLabel(item.stars)}</span>}
    </p>
  );
}

export function Status({
  item,
  describedBy,
  tryAgain,
}: Readonly<{ item: Item; describedBy: string; tryAgain: (item: Item) => void }>) {
  if (showsSkeleton(item)) {
    return <Skeleton />;
  }

  return (
    <div className="it-end">
      <Foot item={item} />
      {rejectsToken(item) ? <TokenRefused /> : null}
      {item.wait === null ? null : <Waiting wait={item.wait} />}
      {item.retry === null ? null : (
        <Failed item={item} describedBy={describedBy} tryAgain={tryAgain} />
      )}
    </div>
  );
}

export function Meta({ item, now }: Readonly<{ item: Item; now: number }>) {
  return (
    <p className="it-meta">
      {item.status === "processing" ? <Icon name="spin" className="ic ic-s proc-ic spin" /> : null}
      <span className="src">{SOURCE_LABELS[item.source]}</span>
      <span>{whereOf(item)}</span>
      <time className="it-date" dateTime={new Date(item.savedAt).toISOString()}>
        {savedLabel(item.savedAt, now)}
      </time>
    </p>
  );
}
