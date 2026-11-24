import { AI_INPUT_BYTES } from "../../../core/contract/ai-contract.ts";
import { utf8Length } from "../../../core/contract/encoding.ts";
import { packWithinInputCap } from "../../ai/core/ai-input-packing.ts";
import type { SentTopic } from "./disagreement-task.ts";
import { pairKey } from "./proposal-candidates.ts";

type DecidedPair = readonly [number, number];

const MIN_ITEMS = 2;

const SMALLEST_ITEM = { id: 0, title: "", summary: "" };

const SMALLEST_TOPIC_BYTES = utf8Length(
  JSON.stringify({ id: 0, name: "", items: [SMALLEST_ITEM, SMALLEST_ITEM] }),
);

function decidedOf(
  topic: Readonly<SentTopic>,
  decided: Readonly<ReadonlySet<string>>,
): DecidedPair[] {
  return topic.items.flatMap((first, index) =>
    topic.items
      .slice(index + 1)
      .filter((second) => decided.has(pairKey(first.id, second.id)))
      .map((second): DecidedPair => [Math.min(first.id, second.id), Math.max(first.id, second.id)]),
  );
}

function wireTopic({ id, name, items }: Readonly<SentTopic>) {
  return {
    id,
    name,
    items: items.map((item) => ({ id: item.id, title: item.title, summary: item.summary })),
  };
}

export interface DisagreementFill {
  readonly sent: readonly Readonly<SentTopic>[];
  readonly topicsJson: string;
  readonly pairsJson: string;
}

export const EMPTY_FILL: DisagreementFill = { sent: [], topicsJson: "", pairsJson: "" };

export function disagreementInput({
  topicsJson,
  pairsJson,
}: Readonly<Pick<DisagreementFill, "topicsJson" | "pairsJson">>): string {
  return `{"topics":[${topicsJson}],"decided":[${pairsJson}]}`;
}

function joined(held: string, added: readonly string[]): string {
  return [...(held === "" ? [] : [held]), ...added].join(",");
}

function withTopic(
  fill: Readonly<DisagreementFill>,
  topic: Readonly<SentTopic>,
  pairs: readonly DecidedPair[],
): DisagreementFill {
  return {
    sent: [...fill.sent, topic],
    topicsJson: joined(fill.topicsJson, [JSON.stringify(wireTopic(topic))]),
    pairsJson: joined(
      fill.pairsJson,
      pairs.map((pair) => JSON.stringify(pair)),
    ),
  };
}

function shortenings(topic: Readonly<SentTopic>): SentTopic[] {
  return Array.from({ length: Math.max(0, topic.items.length - MIN_ITEMS + 1) }, (_, cut) => ({
    ...topic,
    items: topic.items.slice(0, topic.items.length - cut),
  }));
}

export function extendFill(
  fill: Readonly<DisagreementFill>,
  topics: readonly Readonly<SentTopic>[],
  decided: Readonly<ReadonlySet<string>>,
): DisagreementFill {
  return packWithinInputCap(fill, topics, {
    variants: shortenings,
    add: (packed, topic) => withTopic(packed, topic, decidedOf(topic, decided)),
    bytes: (packed) => utf8Length(disagreementInput(packed)),
    stopAtFirstMiss: false,
  });
}

export function hasNoRoomForAnother(fill: Readonly<DisagreementFill>): boolean {
  return utf8Length(disagreementInput(fill)) + SMALLEST_TOPIC_BYTES > AI_INPUT_BYTES;
}
