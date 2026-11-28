import { groupedNumber } from "../../src/core/contract/format.ts";
import type { ItemDetail } from "../../src/core/contract/item-detail-wire.ts";
import type { Item } from "../../src/core/contract/item-wire.ts";
import { spellingOf } from "../../src/core/contract/link-place.ts";
import { repositoryRef } from "../../src/core/contract/repository-ref.ts";
import { DescriptionRow } from "./DescriptionRow.tsx";
import { GITHUB_TOPICS_LABEL, NONE_STATED, REPOSITORY_LABELS } from "./reader-text.ts";
import { ageLabel } from "./saved-label.ts";

export function RepositoryBlock({
  item,
  repository,
  now,
}: Readonly<{
  item: Item;
  repository: NonNullable<ItemDetail["repository"]>;
  now: number;
}>) {
  const { owner, name } = repositoryRef(spellingOf(item));

  return (
    <div className="repo">
      <p className="repo-name">
        <span>{owner} / </span>
        <strong>{name}</strong>
      </p>
      {repository.description === null ? null : <p dir="auto">{repository.description}</p>}
      <dl className="repo-stats">
        <DescriptionRow name={REPOSITORY_LABELS.stars} value={groupedNumber(repository.stars)} />
        <DescriptionRow
          name={REPOSITORY_LABELS.language}
          value={repository.language ?? NONE_STATED}
        />
        <DescriptionRow
          name={REPOSITORY_LABELS.license}
          value={repository.license ?? NONE_STATED}
        />
        <DescriptionRow
          name={REPOSITORY_LABELS.pushedAt}
          value={repository.pushedAt === null ? NONE_STATED : ageLabel(repository.pushedAt, now)}
        />
      </dl>
      {repository.topics.length === 0 ? null : (
        <p className="gh-topics" dir="auto">
          <span className="gh-topics-l">{GITHUB_TOPICS_LABEL}</span> {repository.topics.join(", ")}
        </p>
      )}
    </div>
  );
}
