import { z } from "zod";

export const SCRIPT_CALL = "~/threadsift/threadsift.sh";

export const OpenApiSchema = z.object({
  paths: z.record(
    z.string(),
    z.record(z.string(), z.object({ responses: z.record(z.string(), z.unknown()) })),
  ),
});

export type OpenApi = z.infer<typeof OpenApiSchema>;
