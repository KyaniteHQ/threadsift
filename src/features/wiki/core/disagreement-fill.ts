import { fitsAiInput } from "../../../core/contract/ai-contract.ts";
import type { SentTopic } from "./disagreement-task.ts";
import { pairKey } from "./proposal-candidates.ts";

type DecidedPair = readonly [number, number];

interface HeldTopic {
  readonly topic: Readonly<SentTopic>;
  readonly topicJson: string;
  readonly pairsJson: readonly string[];
}

export type DisagreementFill = readonly Readonly<HeldTopic>[];

const MIN_ITEMS = 2;

const SMALLEST_ITEM = { id: 0, title: "", summary: "" };

const SMALLEST_TOPIC = JSON.stringify({ id: 0, name: "", items: [SMALLEST_ITEM, SMALLEST_ITEM] });

export const EMPTY_FILL: DisagreementFill = [];

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

function heldTopic(topic: Readonly<SentTopic>, decided: Readonly<ReadonlySet<string>>): HeldTopic {
  return {
    topic,
    topicJson: JSON.stringify(wireTopic(topic)),
    pairsJson: decidedOf(topic, decided).map((pair) => JSON.stringify(pair)),
  };
}

export function disagreementInput(fill: DisagreementFill): string {
  const topics = fill.map(({ topicJson }) => topicJson).join(",");
  const pairs = fill.flatMap(({ pairsJson }) => pairsJson).join(",");

  return `{"topics":[${topics}],"decided":[${pairs}]}`;
}

export function sentOf(fill: DisagreementFill): readonly Readonly<SentTopic>[] {
  return fill.map(({ topic }) => topic);
}

function withFirstFitting(
  fill: DisagreementFill,
  topic: Readonly<SentTopic>,
  decided: Readonly<ReadonlySet<string>>,
): DisagreementFill {
  for (let count = topic.items.length; count >= MIN_ITEMS; count -= 1) {
    const grown = [...fill, heldTopic({ ...topic, items: topic.items.slice(0, count) }, decided)];

    if (fitsAiInput(disagreementInput(grown))) return grown;
  }

  return fill;
}

export function extendFill(
  fill: DisagreementFill,
  topics: readonly Readonly<SentTopic>[],
  decided: Readonly<ReadonlySet<string>>,
): DisagreementFill {
  let held = fill;

  for (const topic of topics) held = withFirstFitting(held, topic, decided);

  return held;
}

export function hasNoRoomForAnother(fill: DisagreementFill): boolean {
  return !fitsAiInput(disagreementInput(fill) + SMALLEST_TOPIC);
}
