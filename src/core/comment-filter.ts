export const DELETED_BODY = "[deleted]";

const REMOVED_BODIES: ReadonlySet<string> = new Set([DELETED_BODY, "[removed]"]);

const BOT_ACCOUNTS: ReadonlySet<string> = new Set(["automoderator"]);

const AGREEMENT_ONLY =
  /^[\p{P}\p{S}\s]*(?:\+1|this|same|thanks|thank\s+you|lol|lmao)[\p{P}\p{S}\s]*$/iu;

export function isRemovedBody(body: string): boolean {
  const trimmed = body.trim();

  return trimmed === "" || REMOVED_BODIES.has(trimmed);
}

export function isPlainCodeDrop(author: string, body: string): boolean {
  return isRemovedBody(body) || BOT_ACCOUNTS.has(author.toLowerCase()) || AGREEMENT_ONLY.test(body);
}
