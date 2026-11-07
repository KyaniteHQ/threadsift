import { ZodError } from "zod";

import { CopyDecodeError } from "./copy-decode-error.ts";
import { routeTemplate } from "./routes.ts";

const NOTE_LIMIT = 200;

export class CopyAnswerError extends Error {
  readonly path: string;
  readonly status: number;
  readonly answer: string;
  readonly at: number;

  constructor(path: string, status: number, answer: string) {
    const route = routeTemplate(path);
    super(`${route} answered ${String(status)}`);
    this.path = route;
    this.status = status;
    this.answer = answer;
    this.at = Date.now();
  }
}

export function publicMessage(error: Readonly<Error>): string {
  if (error instanceof CopyAnswerError || error instanceof CopyDecodeError) return error.message;

  if (error instanceof SyntaxError) return "an answer was not valid JSON";

  if (error instanceof ZodError) {
    return `an answer did not match its schema at ${error.issues[0]?.path.join(".") ?? ""}`;
  }

  return error.message.slice(0, NOTE_LIMIT);
}
