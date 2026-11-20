import { z } from "zod";

export const SECRET_INPUT_MAX = 4096;

export const HEADER_SAFE_SECRET = /^[\u0021-\u007E]+$/u;

const NO_SPACE_OR_CONTROL = /^[^\s\p{Cc}]+$/u;

export const SecretInputSchema = z.string().max(SECRET_INPUT_MAX).regex(NO_SPACE_OR_CONTROL);
