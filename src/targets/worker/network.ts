import { type Network, REQUEST_HEADERS } from "../../core/ports.ts";

async function* chunksOf(body: ReadableStream<Uint8Array> | null): AsyncGenerator<Uint8Array> {
  if (body !== null) {
    yield* body;
  }
}

export const workerNetwork: Network = {
  get: async (url, signal) => {
    const response = await fetch(url, { redirect: "manual", signal, headers: REQUEST_HEADERS });

    return {
      status: response.status,
      location: response.headers.get("location"),
      contentType: response.headers.get("content-type"),
      body: chunksOf(response.body),
    };
  },
};
