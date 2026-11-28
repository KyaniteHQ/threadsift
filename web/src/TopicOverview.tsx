import { itemPath } from "../../src/core/contract/item-path.ts";
import {
  type Overview,
  citationId,
  overviewLines,
  overviewTokens,
} from "../../src/core/contract/topic-overview-contract.ts";
import { InternalLink } from "./InternalLink.tsx";
import { keyed } from "./keyed.ts";
import { PlaceLink } from "./PlaceLink.tsx";
import { AlertRegion } from "./RetryRegions.tsx";
import { TOPIC_PAGE, builtFromLabel, citationLabel } from "./topic-text.ts";

type Cited = Overview["cited"][number];

function Citation({ source }: Readonly<{ source: Cited }>) {
  return (
    <InternalLink
      className="tp-cite"
      to={itemPath(source.id)}
      title={source.title}
      aria-label={citationLabel(source.title)}
    >
      <bdi dir="auto">{source.title}</bdi>
    </InternalLink>
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
  return (
    <>
      <output className="rd-note">
        {overview.state === "pending" ? TOPIC_PAGE.overviewPending : null}
      </output>
      <AlertRegion
        className="tp-status"
        text={overview.state === "failed" ? TOPIC_PAGE.overviewFailed : null}
        retry={write}
      />
      {overview.state === "pending" || overview.state === "failed" ? null : (
        <Unwritten overview={overview} write={write} />
      )}
    </>
  );
}

function Unwritten({ overview, write }: Readonly<{ overview: Overview; write: () => void }>) {
  if (overview.text !== null) return null;

  if (!overview.provider) {
    return (
      <div className="tp-status">
        <p className="rd-note">{TOPIC_PAGE.noProvider}</p>
        <PlaceLink to="ai-settings" />
      </div>
    );
  }

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
