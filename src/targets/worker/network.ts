import { type Network, REQUEST_HEADERS } from "../../core/ports.ts";
import { aiTransport } from "../shared/ai-transport.ts";

const CLOUDFLARE_ORIGIN_ERROR_STATUS = 530;
const CLOUDFLARE_ERROR_PAGE = /^error code: 1[0-9]{3}\s*$/u;
const ERROR_PAGE_BYTES = 64;

async function* chunksOf(body: ReadableStream<Uint8Array> | null): AsyncGenerator<Uint8Array> {
  if (body !== null) {
    yield* body;
  }
}

async function firstChunk(body: ReadableStream<Uint8Array> | null): Promise<string> {
  if (body === null) {
    return "";
  }

  const reader = body.getReader();
  const { value } = await reader.read();
  await reader.cancel();

  return new TextDecoder().decode(value?.subarray(0, ERROR_PAGE_BYTES));
}

async function refuseUnreachableOrigin(url: string, response: Response): Promise<void> {
  if (response.status !== CLOUDFLARE_ORIGIN_ERROR_STATUS) {
    return;
  }

  const page = await firstChunk(response.body);

  if (CLOUDFLARE_ERROR_PAGE.test(page)) {
    throw new Error(`Cloudflare could not reach ${url}: ${page.trim()}`);
  }
}

export const workerNetwork: Network = {
  get: async (url, signal) => {
    const response = await fetch(url, { redirect: "manual", signal, headers: REQUEST_HEADERS });
    await refuseUnreachableOrigin(url, response);

    return {
      status: response.status,
      location: response.headers.get("location"),
      contentType: response.headers.get("content-type"),
      body: chunksOf(response.bodyUsed ? null : response.body),
    };
  },
};

export const workerAi = { publicOnly: true, fetch: aiTransport(true) } as const;
