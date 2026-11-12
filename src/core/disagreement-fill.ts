import { utf8Length } from "./digest-prompt.ts";
import { DISAGREEMENT_INPUT_BYTES, type SentTopic } from "./disagreement-task.ts";
import { pairKey } from "./proposal-candidates.ts";

const MIN_ITEMS = 2;

function decidedOf(topic: Readonly<SentTopic>, decided: Readonly<ReadonlySet<string>>) {
  return topic.items.flatMap((first, index) =>
    topic.items
      .slice(index + 1)
      .filter((second) => decided.has(pairKey(first.id, second.id)))
      .map((second) => [Math.min(first.id, second.id), Math.max(first.id, second.id)]),
  );
}

function inputJson(
  topics: readonly Readonly<SentTopic>[],
  decided: Readonly<ReadonlySet<string>>,
): string {
  return JSON.stringify({
    topics: topics.map(({ id, name, items }) => ({
      id,
      name,
      items: items.map((item) => ({ id: item.id, title: item.title, summary: item.summary })),
    })),
    decided: topics.flatMap((topic) => decidedOf(topic, decided)),
  });
}

function fitted(
  sent: readonly Readonly<SentTopic>[],
  topic: Readonly<SentTopic>,
  decided: Readonly<ReadonlySet<string>>,
): SentTopic | null {
  for (let count = topic.items.length; count >= MIN_ITEMS; count -= 1) {
    const shortened = { ...topic, items: topic.items.slice(0, count) };

    if (utf8Length(inputJson([...sent, shortened], decided)) <= DISAGREEMENT_INPUT_BYTES)
      return shortened;
  }

  return null;
}

export function fillDisagreementInput(
  topics: readonly Readonly<SentTopic>[],
  decided: Readonly<ReadonlySet<string>>,
) {
  const sent: SentTopic[] = [];

  for (const topic of topics) {
    const kept = fitted(sent, topic, decided);

    if (kept !== null) sent.push(kept);
  }

  return { input: inputJson(sent, decided), sent };
}
