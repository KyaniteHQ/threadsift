import { z } from "zod";

const SENT_SUBJECT_FIELDS = {
  id: z.number().int().positive(),
  name: z.string(),
  items: z.number().int().min(0),
};

const TagSubjectSchema = z
  .object({ ...SENT_SUBJECT_FIELDS, topics: z.array(z.string()).readonly() })
  .readonly();

const TopicSubjectSchema = z
  .object({ ...SENT_SUBJECT_FIELDS, tags: z.array(z.string()).readonly() })
  .readonly();

const SentSubjectSchema = z.union([TagSubjectSchema, TopicSubjectSchema]);

const SentPairSchema = z.object({ low: SentSubjectSchema, high: SentSubjectSchema }).readonly();

export const SentPairsSchema = z.array(SentPairSchema).readonly();

export type TagSubject = z.infer<typeof TagSubjectSchema>;

export type TopicSubject = z.infer<typeof TopicSubjectSchema>;

export type SentSubject = z.infer<typeof SentSubjectSchema>;

export type SentPair = z.infer<typeof SentPairSchema>;

export type Sent = z.infer<typeof SentPairsSchema>;
