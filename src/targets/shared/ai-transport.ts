import type { OpenAICompatibleProviderSettings } from "@ai-sdk/openai-compatible";

type FetchFunction = NonNullable<OpenAICompatibleProviderSettings["fetch"]>;

import { AiAddressRefused, allowedAiUrl } from "../../core/ai-url.ts";

export function aiTransport(publicOnly: boolean): FetchFunction {
  return async (input, init) => {
    const request = new Request(input, init);

    if (!allowedAiUrl(request.url, publicOnly)) {
      throw new AiAddressRefused();
    }

    const response = await fetch(request, { redirect: "manual" });

    if (response.status >= 300 && response.status < 400) {
      await response.body?.cancel();

      throw new AiAddressRefused();
    }

    return response;
  };
}
