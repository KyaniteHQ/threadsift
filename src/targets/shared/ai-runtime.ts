import { allowedAiUrl } from "../../core/ai-url.ts";
import type { AiRuntime } from "../../core/ports.ts";
import { sealedSecrets } from "../../core/sealed-secret.ts";

interface AiRuntimeOptions {
  readonly publicOnly: boolean;
  readonly secretKey: string | undefined;
  readonly request: typeof fetch;
}

export async function aiRuntime({
  publicOnly,
  secretKey,
  request,
}: AiRuntimeOptions): Promise<AiRuntime> {
  return {
    name: "http",
    publicOnly,
    allowsUrl: (url) => allowedAiUrl(url, publicOnly),
    secrets: await sealedSecrets(secretKey),
    run: async (task, signal) => {
      const { runHttp } = await import("./ai-executor.ts");

      return runHttp(request, task, signal);
    },
  };
}
