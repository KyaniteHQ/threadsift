import type { AiExecutor } from "../../core/ports.ts";
import { sealedSecrets } from "../../core/sealed-secret.ts";
import { aiNetwork } from "./ai-transport.ts";

interface AiRuntimeOptions {
  readonly publicOnly: boolean;
  readonly secretKey: string | undefined;
  readonly request: typeof fetch;
}

export async function aiRuntime({ publicOnly, secretKey, request }: AiRuntimeOptions) {
  const ai = aiNetwork(publicOnly, request);

  const executor: AiExecutor = {
    name: "http",
    run: async (task, signal) => {
      const { runHttp } = await import("./ai-executor.ts");

      return runHttp(ai, task, signal);
    },
  };

  return { ai, executor, secrets: await sealedSecrets(secretKey) };
}
