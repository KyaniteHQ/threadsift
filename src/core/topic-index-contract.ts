import { z } from "zod";

const IndexTopicSchema = z
  .object({
    key: z.string(),
    name: z.string(),
    itemCount: z.number().int().min(0),
    overviewLine: z.string().nullable(),
  })
  .readonly();

export type IndexTopic = z.infer<typeof IndexTopicSchema>;

export const TopicIndexSchema = z
  .object({
    topics: z.array(IndexTopicSchema).readonly(),
    total: z.number().int().min(0),
    next: z.string().nullable(),
  })
  .readonly();

export type TopicIndex = z.infer<typeof TopicIndexSchema>;
