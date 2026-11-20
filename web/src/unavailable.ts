import { UnavailableResponseSchema } from "../../src/core/contract/error-wire.ts";
import { parsedBody } from "./calls.ts";

export async function isRestoring(response: Response): Promise<boolean> {
  if (response.status !== 503) return false;

  try {
    await parsedBody(response, UnavailableResponseSchema);

    return true;
  } catch {
    return false;
  }
}
