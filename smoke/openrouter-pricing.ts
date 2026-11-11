import { type APIRequestContext, expect } from "@playwright/test";
import { z } from "zod";

const ZERO_USD = z.string().regex(/^0+(?:\.0+)?(?:e[+-]?\d+)?$/iu);

const FREE_PRICING = z
  .object({
    prompt: ZERO_USD,
    completion: ZERO_USD,
    discount: z.number().min(0).max(1).optional(),
    overrides: z.array(z.never()).optional(),
  })
  .catchall(ZERO_USD);

const CATALOG = z.object({
  data: z.array(z.object({ id: z.string(), pricing: z.unknown(), architecture: z.unknown() })),
});

const FREE_MODEL = z.object({
  pricing: FREE_PRICING,
  architecture: z.object({ output_modalities: z.tuple([z.literal("text")]) }),
});

export async function checkFreeModel(request: APIRequestContext, modelId: string): Promise<void> {
  const catalogResponse = await request.get("https://openrouter.ai/api/v1/models");

  expect(catalogResponse.status(), "OpenRouter's model catalog is available").toBe(200);

  const { data } = CATALOG.parse(await catalogResponse.json());
  const model = data.find(({ id }) => id === modelId);

  expect(model, `OpenRouter lists ${modelId}`).toBeDefined();
  expect(
    FREE_MODEL.safeParse(model).success,
    `${modelId} has only text output and its published prices are all $0`,
  ).toBe(true);

  const path = modelId
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");

  const endpointsResponse = await request.get(
    `https://openrouter.ai/api/v1/models/${path}/endpoints`,
  );

  expect(endpointsResponse.status(), `OpenRouter lists endpoints for ${modelId}`).toBe(200);

  const endpoints = z
    .object({
      data: z.object({
        id: z.literal(modelId),
        endpoints: z.array(z.object({ pricing: FREE_PRICING })),
      }),
    })
    .safeParse(await endpointsResponse.json());

  expect(endpoints.success, `every endpoint of ${modelId} has published prices of $0`).toBe(true);

  if (!endpoints.success) return;

  expect(
    endpoints.data.data.endpoints.length > 0 || modelId === "openrouter/free",
    `${modelId} has an endpoint or is OpenRouter's free router`,
  ).toBe(true);
}
