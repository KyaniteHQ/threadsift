import { z } from "zod";

export const RedditSettingsSchema = z.object({ archiveFill: z.boolean() });

export type RedditSettings = z.infer<typeof RedditSettingsSchema>;
