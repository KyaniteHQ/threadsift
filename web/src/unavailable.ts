import { UnavailableResponseSchema } from "../../src/core/contract/error-wire.ts";
import { type Method, type OkCall, callOk, parsedBody, unexpected } from "./calls.ts";

export const RESTORING = { kind: "restoring" } as const;

export type Restoring = typeof RESTORING;

export function isRestoring(answer: string | Readonly<object>): answer is Restoring {
  return answer === RESTORING;
}

async function refusedWhileRestoring(response: Response): Promise<boolean> {
  if (response.status !== 503) return false;

  try {
    await parsedBody(response.clone(), UnavailableResponseSchema);

    return true;
  } catch {
    return false;
  }
}

export async function unlessRestoring(response: Response): Promise<Response | Restoring> {
  return (await refusedWhileRestoring(response)) ? RESTORING : response;
}

export async function callUnlessRestoring(
  method: Method,
  path: string,
  options: Readonly<OkCall> = {},
): Promise<Response | Restoring> {
  const { tolerates = [] } = options;
  const answer = await unlessRestoring(
    await callOk(method, path, { ...options, tolerates: [...tolerates, 503] }),
  );

  if (isRestoring(answer) || answer.status !== 503) return answer;

  throw unexpected(method, path, 503);
}
