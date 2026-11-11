import { type ReactNode, memo, useCallback } from "react";

import { itemPath } from "../../src/core/item-path.ts";
import type { LogEntry } from "../../src/core/log-contract.ts";
import { topicPath } from "../../src/core/topic-path.ts";
import { localDate, localTime } from "./log-date.ts";
import { LOG_WORDS, addedRemoved, picksLabel } from "./log-text.ts";
import { LogLink } from "./LogLink.tsx";
import type { Pages } from "./routing.ts";
import { topicLinkLabel } from "./topic-text.ts";

function Separator() {
  return (
    <span className="lg-sep" aria-hidden="true">
      {" | "}
    </span>
  );
}

function Parts({ children }: Readonly<{ children: readonly ReactNode[] }>) {
  return children.map((part, at) => (
    // oxlint-disable-next-line react/no-array-index-key -- the parts of one line never reorder.
    <span key={at}>
      {at === 0 ? null : <Separator />}
      {part}
    </span>
  ));
}

function ItemLink({
  item,
  pages,
}: Readonly<{ item: { readonly id: number; readonly title: string }; pages: Pages }>) {
  const { id } = item;

  const open = useCallback(() => {
    pages.item(id);
  }, [pages, id]);

  return <LogLink href={itemPath(id)} open={open} text={item.title} />;
}

function TopicRef({
  topic,
  pages,
}: Readonly<{ topic: { readonly key: string; readonly name: string }; pages: Pages }>) {
  const { key } = topic;

  const open = useCallback(() => {
    pages.topic(key);
  }, [pages, key]);

  return (
    <LogLink
      href={topicPath(key)}
      open={open}
      label={topicLinkLabel(topic.name)}
      text={topic.name}
    />
  );
}

function body(entry: Readonly<LogEntry>, pages: Pages): readonly ReactNode[] {
  switch (entry.action) {
    case "ingest":
    case "digest":
      return [
        entry.action,
        <ItemLink key="item" item={entry.item} pages={pages} />,
        <span key="topic">
          <span className="lg-word">{LOG_WORDS.topic} </span>
          <TopicRef topic={entry.topic} pages={pages} />
        </span>,
        ...(entry.tags.length === 0
          ? []
          : [
              <span key="tags" className="lg-tags">
                {LOG_WORDS.tags} {entry.tags.join(", ")}
              </span>,
            ]),
      ];
    case "topic":
      return [entry.action, <TopicRef key="topic" topic={entry.topic} pages={pages} />];
    case "overview":
      return [
        entry.action,
        <TopicRef key="topic" topic={entry.topic} pages={pages} />,
        addedRemoved(entry.added, entry.removed),
      ];
    case "related":
      return [
        entry.action,
        <ItemLink key="item" item={entry.item} pages={pages} />,
        picksLabel(entry.picks),
      ];
    default:
      return entry satisfies never;
  }
}

export const LogRow = memo(function LogRow({
  entry,
  pages,
}: Readonly<{ entry: LogEntry; pages: Pages }>) {
  return (
    <li>
      <article className="lg-row">
        <p className="lg-line">
          <time
            className="lg-date"
            dateTime={new Date(entry.at).toISOString()}
            title={localTime(entry.at)}
          >
            [{localDate(entry.at)}]
          </time>{" "}
          <Parts>{body(entry, pages)}</Parts>
        </p>
      </article>
    </li>
  );
});
