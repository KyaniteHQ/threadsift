import { AiAddressRefused, allowedAiUrl } from "../../core/ai-url.ts";
import type { AiNetwork } from "../../core/ports.ts";

function aiTransport(allows: (url: string) => boolean, request: typeof fetch): typeof fetch {
  return async (input, init) => {
    const outgoing = new Request(input, init);

    if (!allows(outgoing.url)) throw new AiAddressRefused();
    const response = await request(outgoing, { redirect: "manual" });

    if (response.status >= 300 && response.status < 400) {
      await response.body?.cancel();
      throw new AiAddressRefused();
    }

    return response;
  };
}

export function aiNetwork(publicOnly: boolean, request: typeof fetch): AiNetwork {
  const allows = (url: string): boolean => allowedAiUrl(url, publicOnly);

  return { publicOnly, allows, fetch: aiTransport(allows, request) };
}
