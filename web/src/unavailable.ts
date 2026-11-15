import { UnavailableResponseSchema } from "../../src/http/schemas.ts";
import { parsedBody } from "./calls.ts";

export async function unavailableKind(response: Response): Promise<"restoring" | "updating"> {
  try {
    const { code } = await parsedBody(response, UnavailableResponseSchema);

    return code === "restoring" ? "restoring" : "updating";
  } catch {
    return "updating";
  }
}
