import { z } from "zod";

export const CANONICAL_NUMBER_SOURCE = String.raw`[1-9]\d{0,15}`;

const CANONICAL_NUMBER = new RegExp(`^${CANONICAL_NUMBER_SOURCE}$`, "u");

export const CANONICAL_NUMBER_RULE = `a whole number written in decimal digits, from 1 to ${String(Number.MAX_SAFE_INTEGER)}, with no sign, no leading zero and no other character`;

const REFUSAL = { error: `must be ${CANONICAL_NUMBER_RULE}` };

export const CanonicalNumberSchema = z.int(REFUSAL).positive(REFUSAL);

export const CanonicalNumberTextSchema = z
  .string(REFUSAL)
  .regex(CANONICAL_NUMBER, REFUSAL)
  .transform(Number)
  .pipe(CanonicalNumberSchema)
  .meta({
    description: `The value must be ${CANONICAL_NUMBER_RULE}. A caller that passes the access check and sends any other text gets 400.`,
  });
