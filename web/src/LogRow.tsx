import { type ReactNode, memo, useCallback } from "react";

import { itemPath } from "../../src/core/item-path.ts";
import type { LogEntry } from "../../src/core/log-contract.ts";
import { topicPath } from "../../src/core/topic-path.ts";
import { localDate, localTime } from "./log-date.ts";
import { LOG_WORDS, addedRemoved, itemsLabel, mergeLabel, picksLabel } from "./log-text.ts";
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

interface Part {
  readonly key: string;
  readonly node: ReactNode;
}

function Parts({ children }: Readonly<{ children: readonly Part[] }>) {
  return children.map(({ key, node }, at) => (
    <span key={key}>
      {at === 0 ? null : <Separator />}
      {node}
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

function itemPart(item: { readonly id: number; readonly title: string }, pages: Pages): Part {
  return { key: "item", node: <ItemLink item={item} pages={pages} /> };
}

function topicPart(topic: { readonly key: string; readonly name: string }, pages: Pages): Part {
  return { key: "topic", node: <TopicRef topic={topic} pages={pages} /> };
}

function digestedParts(entry: Readonly<Extract<LogEntry, { tags: unknown }>>, pages: Pages) {
  const labelled: Part = {
    key: "topic",
    node: (
      <>
        <span className="lg-word">{LOG_WORDS.topic} </span>
        <TopicRef topic={entry.topic} pages={pages} />
      </>
    ),
  };

  const tags: Part = {
    key: "tags",
    node: (
      <span className="lg-tags">
        {LOG_WORDS.tags} {entry.tags.join(", ")}
      </span>
    ),
  };

  return [itemPart(entry.item, pages), labelled, ...(entry.tags.length === 0 ? [] : [tags])];
}

function mergeParts(
  word: string,
  entry: Readonly<Extract<LogEntry, { from: unknown }>>,
): readonly Part[] {
  return [
    { key: "action", node: "merge" },
    {
      key: "tags",
      node: (
        <span className="lg-tags">
          {word} {mergeLabel(entry.from, entry.into)}
        </span>
      ),
    },
    { key: "items", node: itemsLabel(entry.items) },
  ];
}

function body(entry: Readonly<LogEntry>, pages: Pages): readonly Part[] {
  const action: Part = { key: "action", node: entry.action };

  switch (entry.action) {
    case "ingest":
    case "digest":
      return [action, ...digestedParts(entry, pages)];
    case "topic":
      return [action, topicPart(entry.topic, pages)];
    case "overview":
      return [
        action,
        topicPart(entry.topic, pages),
        { key: "counts", node: addedRemoved(entry.added, entry.removed) },
      ];
    case "related":
      return [action, itemPart(entry.item, pages), { key: "picks", node: picksLabel(entry.picks) }];
    case "merge":
      return mergeParts(LOG_WORDS.tag, entry);
    case "merge-topic":
      return mergeParts(LOG_WORDS.topic, entry);
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
      <article className="rl-row">
        <p className="rl-sum lg-line">
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
