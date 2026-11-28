import { z } from "zod";

import { groupedNumber } from "./format.ts";

export const SECRET_INPUT_MAX = 4096;

export const HEADER_SAFE_SECRET = /^[\u0021-\u007E]+$/u;

const HEADER_SECRET_RULE = `must be 1 to ${groupedNumber(SECRET_INPUT_MAX)} printable ASCII characters, no space`;

export const HeaderSecretSchema = z
  .string()
  .max(SECRET_INPUT_MAX)
  .regex(HEADER_SAFE_SECRET, { error: HEADER_SECRET_RULE });
