import { groupedNumber } from "../../src/core/format.ts";
import { spellingOf } from "../../src/core/link-place.ts";
import { repositoryRef } from "../../src/core/repository-ref.ts";
import type { Item, ItemDetail } from "../../src/http/schemas.ts";
import { GITHUB_TOPICS_LABEL, NONE_STATED, REPOSITORY_LABELS } from "./reader-text.ts";
import { ageLabel } from "./saved-label.ts";

function Stat({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div>
      <dt className="label">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

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
        <Stat label={REPOSITORY_LABELS.stars} value={groupedNumber(repository.stars)} />
        <Stat label={REPOSITORY_LABELS.language} value={repository.language ?? NONE_STATED} />
        <Stat label={REPOSITORY_LABELS.license} value={repository.license ?? NONE_STATED} />
        <Stat
          label={REPOSITORY_LABELS.pushedAt}
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
