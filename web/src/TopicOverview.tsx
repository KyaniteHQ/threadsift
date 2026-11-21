import { itemPath } from "../../src/core/contract/item-path.ts";
import {
  type Overview,
  citationId,
  overviewLines,
  overviewTokens,
} from "../../src/core/contract/topic-overview-contract.ts";
import { keyed } from "./keyed.ts";
import { useNavigateLink } from "./navigate-context.ts";
import { RETRY_LABEL } from "./text.ts";
import { TOPIC_PAGE, builtFromLabel, citationLabel } from "./topic-text.ts";

type Cited = Overview["cited"][number];

function Citation({ source }: Readonly<{ source: Cited }>) {
  const to = itemPath(source.id);

  const open = useNavigateLink(to);

  return (
    <a
      className="tp-cite"
      href={to}
      title={source.title}
      aria-label={citationLabel(source.title)}
      onClick={open}
    >
      <bdi dir="auto">{source.title}</bdi>
    </a>
  );
}

function Line({
  line,
  cited,
}: Readonly<{
  line: string;
  cited: Overview["cited"];
}>) {
  return (
    <p className="tp-line" dir="auto">
      {keyed(overviewTokens(line)).map(({ key, text }) => {
        const id = citationId(text);

        if (id === null) return text;

        const source = cited.find((candidate) => candidate.id === id);

        return source === undefined ? null : <Citation key={key} source={source} />;
      })}
    </p>
  );
}

function Lines({ overview }: Readonly<{ overview: Overview }>) {
  return keyed(overviewLines(overview.text ?? "")).map(({ key, text }) => (
    <Line key={key} line={text} cited={overview.cited} />
  ));
}

function Status({ overview, write }: Readonly<{ overview: Overview; write: () => void }>) {
  if (overview.state === "pending") {
    return <output className="rd-note">{TOPIC_PAGE.overviewPending}</output>;
  }

  if (overview.state === "failed") {
    return (
      <div className="tp-status" role="alert">
        <p className="rd-note">{TOPIC_PAGE.overviewFailed}</p>
        <button type="button" className="btn" onClick={write}>
          {RETRY_LABEL}
        </button>
      </div>
    );
  }

  if (overview.text !== null) return null;

  if (!overview.provider) return <p className="rd-note">{TOPIC_PAGE.noProvider}</p>;

  return (
    <div className="tp-status">
      <p className="rd-note">{TOPIC_PAGE.overviewNone}</p>
      <button type="button" className="btn" onClick={write}>
        {TOPIC_PAGE.writeOverview}
      </button>
    </div>
  );
}

export function TopicOverview({
  overview,
  itemCount,
  write,
}: Readonly<{
  overview: Overview;
  itemCount: number;
  write: () => void;
}>) {
  return (
    <section className="rd-agent tp-overview">
      <h2 className="label">{TOPIC_PAGE.overviewHeading}</h2>
      {overview.text === null ? null : <Lines overview={overview} />}
      <Status overview={overview} write={write} />
      {overview.text === null ? null : (
        <p className="rd-note">{builtFromLabel(overview.builtFrom, itemCount)}</p>
      )}
    </section>
  );
}
