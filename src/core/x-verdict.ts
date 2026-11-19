export type Judgement = "verified" | "tail-unverified" | "rejected";

export type StoredJudgement =
  | Judgement
  | "verified-without-recipients"
  | "tail-unverified-without-recipients";

export type Judged = Readonly<Record<string, StoredJudgement>>;
