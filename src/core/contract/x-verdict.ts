import { z } from "zod";

export type Judgement = "verified" | "tail-unverified" | "rejected";

const STORED_VERDICTS = [
  "verified",
  "tail-unverified",
  "rejected",
  "verified-without-recipients",
  "tail-unverified-without-recipients",
] as const;

type StoredVerdict = (typeof STORED_VERDICTS)[number];

export interface Judged {
  readonly [key: string]: StoredVerdict;
}

interface Reading {
  readonly judgement: Judgement;
  readonly recipientsOmitted: boolean;
}

const READINGS: Readonly<Record<StoredVerdict, Reading>> = {
  verified: { judgement: "verified", recipientsOmitted: false },
  "tail-unverified": { judgement: "tail-unverified", recipientsOmitted: false },
  rejected: { judgement: "rejected", recipientsOmitted: false },
  "verified-without-recipients": { judgement: "verified", recipientsOmitted: true },
  "tail-unverified-without-recipients": { judgement: "tail-unverified", recipientsOmitted: true },
};

export const StoredJudgedSchema = z.record(z.string(), z.enum(STORED_VERDICTS));

interface Subject {
  readonly kind: "post" | "photos";
  readonly id: string;
}

const PHOTOS_PREFIX = "no-photos:";

function keyOf({ kind, id }: Readonly<Subject>): string {
  return kind === "photos" ? `${PHOTOS_PREFIX}${id}` : id;
}

function subjectOf(key: string): Subject {
  return key.startsWith(PHOTOS_PREFIX)
    ? { kind: "photos", id: key.slice(PHOTOS_PREFIX.length) }
    : { kind: "post", id: key };
}

function readingOn(judged: Judged, subject: Readonly<Subject>): Reading | undefined {
  const stored = judged[keyOf(subject)];

  return stored === undefined ? undefined : READINGS[stored];
}

export function judgementOn(judged: Judged, id: string): Judgement | undefined {
  return readingOn(judged, { kind: "post", id })?.judgement;
}

export function recipientsOmittedOn(judged: Judged, id: string): boolean {
  return readingOn(judged, { kind: "post", id })?.recipientsOmitted === true;
}

export function photosRejectedOn(judged: Judged, id: string): boolean {
  return readingOn(judged, { kind: "photos", id })?.judgement === "rejected";
}

export function rejectedPostIds(judged: Judged): readonly string[] {
  return Object.entries(judged).flatMap(([key, stored]) => {
    const subject = subjectOf(key);

    return subject.kind === "post" && READINGS[stored].judgement === "rejected" ? [subject.id] : [];
  });
}

function entry(subject: Readonly<Subject>, stored: StoredVerdict) {
  return [keyOf(subject), stored] as const;
}

export function rejectedJudged(ids: readonly string[]): Judged {
  return Object.fromEntries(ids.map((id) => entry({ kind: "post", id }, "rejected")));
}

function storedVerdict(judgement: Judgement, recipientsOmitted: boolean): StoredVerdict {
  return judgement !== "rejected" && recipientsOmitted
    ? (`${judgement}-without-recipients` as const)
    : judgement;
}

export function judgedBy({
  id,
  judgement,
  recipientsOmitted,
  rejects,
  photoless,
}: Readonly<{
  id: string;
  judgement: Judgement;
  recipientsOmitted: boolean;
  rejects: readonly string[];
  photoless: boolean;
}>): Judged {
  return Object.fromEntries([
    entry({ kind: "post", id }, storedVerdict(judgement, recipientsOmitted)),
    ...rejects.map((reject) => entry({ kind: "post", id: reject }, "rejected")),
    ...(photoless ? [entry({ kind: "photos", id }, "rejected")] : []),
  ]);
}

export function mergedJudged(results: readonly Judged[]): Judged {
  const merged = new Map<string, StoredVerdict>();

  for (const result of results) {
    for (const [key, stored] of Object.entries(result)) {
      if (merged.get(key) !== "rejected") merged.set(key, stored);
    }
  }

  return Object.fromEntries(merged);
}
