import { type ReactNode, memo } from "react";

import { itemPath } from "../../src/core/contract/item-path.ts";
import type { LogEntry } from "../../src/core/contract/log-contract.ts";
import { topicPath } from "../../src/core/contract/topic-path.ts";
import { InternalLink } from "./InternalLink.tsx";
import { keyed } from "./keyed.ts";
import { localTime } from "./log-date.ts";
import { LOG_CHANGES, addedRemoved, logItemsLabel, mergeLabel } from "./log-text.ts";
import { tagHue } from "./tag-hue.ts";
import { topicLinkLabel } from "./topic-text.ts";

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

function Tags({ tags }: Readonly<{ tags: readonly string[] }>) {
  if (tags.length === 0) return null;

  return (
    <span className="tags">
      {keyed(tags).map(({ key, text }) => (
        <span key={key} className="tag" data-tag={tagHue(text)}>
          <i className="tag-dot" />
          <bdi dir="auto">{text}</bdi>
        </span>
      ))}
    </span>
  );
}

interface Cells {
  readonly subject: ReactNode;
  readonly details: ReactNode;
  readonly linked: boolean;
}

function cellsOf(entry: Readonly<LogEntry>): Cells {
  switch (entry.action) {
    case "ingest":
    case "digest":
      return {
        subject: <ItemLink item={entry.item} />,
        details: (
          <span className="lg-filed">
            <TopicRef topic={entry.topic} />
            <Tags tags={entry.tags} />
          </span>
        ),
        linked: true,
      };
    case "topic":
      return { subject: <TopicRef topic={entry.topic} />, details: null, linked: true };
    case "overview":
      return {
        subject: <TopicRef topic={entry.topic} />,
        details: addedRemoved(entry.added, entry.removed),
        linked: true,
      };
    case "related":
      return {
        subject: <ItemLink item={entry.item} />,
        details: logItemsLabel(entry.picks),
        linked: true,
      };
    case "merge":
    case "merge-topic":
      return {
        subject: <bdi dir="auto">{mergeLabel(entry.from, entry.into)}</bdi>,
        details: logItemsLabel(entry.items),
        linked: false,
      };
    case "vault-file-skipped":
    case "vault-file-conflict":
      return {
        subject: <code className="lg-path">{entry.path}</code>,
        details: null,
        linked: false,
      };
    default:
      return entry satisfies never;
  }
}

export const LogRow = memo(function LogRow({ entry }: Readonly<{ entry: LogEntry }>) {
  const { subject, details, linked } = cellsOf(entry);

  return (
    <tr className="lg-row">
      <td className="lg-time">
        <time dateTime={new Date(entry.at).toISOString()}>{localTime(entry.at)}</time>
      </td>
      <td className="lg-change">{LOG_CHANGES[entry.action]}</td>
      <td className="lg-subject" tabIndex={linked ? undefined : -1}>
        {subject}
      </td>
      <td className="lg-details">{details}</td>
    </tr>
  );
});
