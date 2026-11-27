import { z } from "zod";

const COMMENT_FULLNAME_PREFIX = "t1_";

const SENT_PREFIX_PATTERN = "[tT]1_";

const BARE_ID_PATTERN = "[A-Za-z\\d]+";

export const COMMENT_ID_MAX = 29;

const SENT_ID_MAX = COMMENT_FULLNAME_PREFIX.length + COMMENT_ID_MAX;

export const CommentId = z
  .string()
  .max(COMMENT_ID_MAX)
  .regex(new RegExp(`^${BARE_ID_PATTERN}$`, "u"))
  .toLowerCase();

export function commentFullname(id: string): string {
  return `${COMMENT_FULLNAME_PREFIX}${id}`;
}

export function idOfCommentFullname(fullname: string): string | null {
  return fullname.startsWith(COMMENT_FULLNAME_PREFIX)
    ? fullname.slice(COMMENT_FULLNAME_PREFIX.length)
    : null;
}

const SENT_FULLNAME = new RegExp(`^${SENT_PREFIX_PATTERN}(${BARE_ID_PATTERN})$`, "u");

function withoutFullnamePrefix(id: string): string {
  const bare = SENT_FULLNAME.exec(id)?.[1];

  return bare !== undefined && CommentId.safeParse(bare).success ? bare : id;
}

export const SentCommentId = z
  .string()
  .max(SENT_ID_MAX)
  .regex(new RegExp(`^(?:${SENT_PREFIX_PATTERN})?${BARE_ID_PATTERN}$`, "u"))
  .transform(withoutFullnamePrefix)
  .pipe(CommentId);

function canonicalOrSent(id: string): string {
  const bare = withoutFullnamePrefix(id);
  const parsed = CommentId.safeParse(bare);

  return parsed.success ? parsed.data : bare;
}

export const ModelCommentId = z
  .string()
  .max(SENT_ID_MAX)
  .transform(canonicalOrSent)
  .pipe(z.string().max(SENT_ID_MAX));
