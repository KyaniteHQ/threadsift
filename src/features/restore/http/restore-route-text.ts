import { byteSize } from "../../../core/contract/format.ts";
import { MAX_ATTEMPTS } from "../../../core/contract/job-contract.ts";
import {
  COPY_RESTORE_PHASES,
  RESTORE_ANCHOR_BYTES,
  RESTORE_REFUSALS,
  RUN_COUNTS,
  type RunningPhase,
} from "../../../core/contract/restore-contract.ts";
import { codeList } from "../../../http/openapi.ts";

const PHASE_WORK = {
  check:
    "reads the whole zip first (a refusal shows in `GET /api/restore` as `failed` with a `failure` code, deletes the parts and writes nothing to the library)",
  tables:
    "restores the records in foreign key order, one bounded unit after another, and keeps the ids of the zip",
  files: "puts the stored files back",
  search: "rebuilds the search index",
  highlights: "anchors each Highlight again in the restored text",
  finish: "sets each table's id counter",
} satisfies Readonly<Record<RunningPhase, string>>;

const COUNT_MEANING = {
  restored: "the rows restored, for each table",
  dropped:
    "the rows left out, for each table, because a row had no parent row in the zip or repeated the key of an earlier row",
  files: "the stored files put back",
  missingFiles: "the file names that rows hold and the zip has no usable entry for",
  keptHighlights: `the Highlights that keep the status they were exported with, because the text to anchor them in was missing or above ${byteSize(RESTORE_ANCHOR_BYTES)}`,
} satisfies Readonly<Record<keyof typeof RUN_COUNTS, string>>;

const PHASE_NAMES = codeList(COPY_RESTORE_PHASES);

const REFUSAL_NAMES = codeList(RESTORE_REFUSALS);

export const LEAK =
  " A leaked agent token must not write a whole library, so no scope opens this route.";

const PHASES = `${PHASE_NAMES} in this order. ${COPY_RESTORE_PHASES.map((phase) => `\`${phase}\` ${PHASE_WORK[phase]}.`).join(" ")}`;

const COUNT_ORDER = Object.keys(RUN_COUNTS);

const COUNTS = Object.entries(COUNT_MEANING)
  .toSorted(([first], [second]) => COUNT_ORDER.indexOf(first) - COUNT_ORDER.indexOf(second))
  .map(([name, meaning]) => `\`${name}\` (${meaning})`)
  .join(", ");

export const LIBRARY_NOT_EMPTY =
  "The library holds Items, Topics, Tags, Log entries, Proposals, Pins or Import cursors, so nothing can be restored into it.";

export const OPEN =
  "Another restore is waiting for its upload or holds the library: it is running, or it failed after it wrote records.";

export const PAST_UPLOAD = {
  error: "The restore is past its upload",
  code: "not-uploading" as const,
};

export const FINISHED = {
  error: "The restore is done, so there is nothing to cancel",
  code: "finished" as const,
};

export const NOT_RESUMABLE = {
  error: "The restore did not give up, or its cancel is running",
  code: "not-resumable" as const,
};

export const SUPERSEDED = {
  error: "A newer restore exists, so only that one can be cancelled or resumed",
  code: "superseded" as const,
};

export const STATUS_DESCRIPTION = `The newest restore, or \`{ "state": "none" }\`. \`libraryEmpty\` is true when the library holds no Item, Topic, Tag, Log entry, Proposal, Pin or Import cursor; a restore can start only then, and only while no other restore is open, which means it waits for its upload or holds the library. \`uploading\` lists the \`received\` parts, so a client that reloaded sends the missing ones. \`running\` carries the \`phase\` (${PHASE_NAMES}) and the counts ${COUNTS}. \`cancelling\` has no counts. \`done\` carries the same counts. \`failed\` carries a \`failure\` word: a refusal code (${REFUSAL_NAMES}), or \`gave-up\` (a unit failed ${String(MAX_ATTEMPTS)} times). \`holdsLibrary\` is true while the failed run still holds the library: after \`gave-up\`, or after a refusal that came once records were written; the library then takes no Paste and no second upload until the run is resumed or cancelled. \`cancelFailed\` is true when the failed run was a cancel. \`resumable\` is true for \`gave-up\` of a run that was not a cancel, while every part of the zip is still stored, and a refusal keeps no part. \`cancelled\` has no counts.`;

export const START_DESCRIPTION = `The restore was waiting for its start, the library is still empty and every part has arrived, so it is \`running\` in its \`check\` phase. Jobs go through the phases ${PHASES} \`POST /api/items\` and \`POST /api/items/batch\` answer 503 while it holds the library: while it runs, and while it is \`failed\` with \`gave-up\` or failed after it wrote records, until it is resumed or cancelled.`;

export const PARTS_MISSING = {
  error: "Some parts of the upload have not arrived",
  code: "incomplete-upload" as const,
};

export const PARTS_GONE = {
  error: "Some parts of the upload are gone",
  code: "incomplete-upload" as const,
};

export const WRONG_PARTS = "`parts` is not `bytes` divided by `partBytes`, rounded up.";
