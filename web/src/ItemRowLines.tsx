import type { Item } from "../../src/core/contract/item-wire.ts";
import { Icon } from "./Icon.tsx";
import { bylineHandle, keptBarStyle, stripParts } from "./kept-strip.ts";
import { keyed } from "./keyed.ts";
import { SavedTime } from "./SavedTime.tsx";
import { starsLabel } from "./text.ts";

export function Byline({ item, now, id }: Readonly<{ item: Item; now: number; id: string }>) {
  const handle = bylineHandle(item);

  return (
    <p id={id} className="it-byline">
      {handle === "" ? null : (
        <span>
          <bdi dir="auto">{handle}</bdi>
        </span>
      )}
      <SavedTime savedAt={item.savedAt} now={now} />
      {item.digestTopic === null ? null : (
        <span>
          <bdi dir="auto">{item.digestTopic}</bdi>
        </span>
      )}
      {item.stars === null ? null : <span>{starsLabel(item.stars)}</span>}
    </p>
  );
}

export function KeptBar({ item }: Readonly<{ item: Item }>) {
  return <span className="it-share" style={keptBarStyle(item)} aria-hidden="true" />;
}

export function KeptStrip({ item, id }: Readonly<{ item: Item; id: string }>) {
  return (
    <p id={id} className="it-src">
      {item.status === "processing" ? <Icon name="spin" className="ic ic-s proc-ic spin" /> : null}
      {keyed(stripParts(item)).map(({ key, text }) => (
        <span key={key}>{text}</span>
      ))}
    </p>
  );
}
