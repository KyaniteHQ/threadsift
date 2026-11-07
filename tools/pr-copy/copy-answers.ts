import { z } from "zod";

const Text = z.string().nullable();

const ItemStateSchema = z.object({
  id: z.number().int(),
  status: z.string(),
  source: z.string(),
  kind: z.string(),
  originalUrl: z.string(),
  title: Text,
  fetch: Text,
  reason: Text,
  retry: Text,
  digestOutcome: z.string(),
  digestTitle: Text,
  digestTopic: Text,
});

export type Item = z.infer<typeof ItemStateSchema>;

export const PastedAnswerSchema = z.object({ item: z.object({ id: z.number().int() }) });

export const ItemAnswerSchema = z.object({ item: ItemStateSchema });

export const ItemListAnswerSchema = z.object({ items: z.array(ItemStateSchema) });

export const ItemDetailAnswerSchema = z.object({
  item: ItemStateSchema.extend({ postText: Text }),
});

export const ProviderChoiceSchema = z.object({ settings: z.json() });
