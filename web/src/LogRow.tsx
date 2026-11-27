import { type ReactNode, memo } from "react";

import { itemPath } from "../../src/core/contract/item-path.ts";
import { LOG } from "../../src/core/contract/log-actions.ts";
import type { LogEntry } from "../../src/core/contract/log-contract.ts";
import { topicPath } from "../../src/core/contract/topic-path.ts";
import { InternalLink } from "./InternalLink.tsx";
import { localStamp } from "./log-date.ts";
import { LOG_WORDS, addedRemoved, logItemsLabel, mergeLabel } from "./log-text.ts";
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

function ItemLink({ item }: Readonly<{ item: { readonly id: number; readonly title: string } }>) {
  return (
    <InternalLink className="lg-link" to={itemPath(item.id)}>
      <bdi dir="auto">{item.title}</bdi>
    </InternalLink>
  );
}

function TopicRef({ topic }: Readonly<{ topic: { readonly key: string; readonly name: string } }>) {
  return (
    <InternalLink
      className="lg-link"
      to={topicPath(topic.key)}
      aria-label={topicLinkLabel(topic.name)}
    >
      <bdi dir="auto">{topic.name}</bdi>
    </InternalLink>
  );
}

function itemPart(item: { readonly id: number; readonly title: string }): Part {
  return { key: "item", node: <ItemLink item={item} /> };
}

function topicPart(topic: { readonly key: string; readonly name: string }): Part {
  return { key: "topic", node: <TopicRef topic={topic} /> };
}

function digestedParts(entry: Readonly<Extract<LogEntry, { tags: unknown }>>) {
  const labelled: Part = {
    key: "topic",
    node: (
      <>
        {LOG_WORDS.topic} <TopicRef topic={entry.topic} />
      </>
    ),
  };

  const tags: Part = {
    key: "tags",
    node: (
      <>
        {LOG_WORDS.tags} {entry.tags.join(", ")}
      </>
    ),
  };

  return [itemPart(entry.item), labelled, ...(entry.tags.length === 0 ? [] : [tags])];
}

function mergeParts(
  word: string,
  entry: Readonly<Extract<LogEntry, { from: unknown }>>,
): readonly Part[] {
  return [
    { key: "action", node: "merge" },
    {
      key: "names",
      node: (
        <>
          {word} {mergeLabel(entry.from, entry.into)}
        </>
      ),
    },
    { key: "items", node: logItemsLabel(entry.items) },
  ];
}

function body(entry: Readonly<LogEntry>): readonly Part[] {
  const action: Part = { key: "action", node: entry.action };

  switch (entry.action) {
    case "ingest":
    case "digest":
      return [action, ...digestedParts(entry)];
    case "topic":
      return [action, topicPart(entry.topic)];
    case "overview":
      return [
        action,
        topicPart(entry.topic),
        { key: "counts", node: addedRemoved(entry.added, entry.removed) },
      ];
    case "related":
      return [action, itemPart(entry.item), { key: "picks", node: logItemsLabel(entry.picks) }];
    case "merge":
      return mergeParts(LOG_WORDS.tag, entry);
    case "merge-topic":
      return mergeParts(LOG_WORDS.topic, entry);
    case "vault-file-skipped":
    case "vault-file-conflict":
      return [
        { key: "action", node: LOG[entry.action].word },
        { key: "path", node: entry.path },
      ];
    default:
      return entry satisfies never;
  }
}

export const LogRow = memo(function LogRow({ entry }: Readonly<{ entry: LogEntry }>) {
  return (
    <li>
      <article className="rl-row">
        <p className="rl-sum lg-line">
          <time className="lg-date" dateTime={new Date(entry.at).toISOString()}>
            [{localStamp(entry.at)}]
          </time>{" "}
          <Parts>{body(entry)}</Parts>
        </p>
      </article>
    </li>
  );
});
