import { AiAddressRefused } from "../../core/ai-url.ts";

export function aiTransport(request: typeof fetch): typeof fetch {
  return async (input, init) => {
    const outgoing = new Request(input, init);

    const response = await request(outgoing, { redirect: "manual" });

    if (response.status >= 300 && response.status < 400) {
      await response.body?.cancel();
      throw new AiAddressRefused();
    }

    return response;
  };
}
