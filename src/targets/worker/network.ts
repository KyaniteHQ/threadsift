import { bestEffort } from "../../core/kernel/failure-log.ts";
import { networkOver } from "../../core/kernel/network-transport.ts";
import {
  type Network,
  REQUEST_HEADERS,
  wireResponseOf,
  withCallerHeaders,
} from "../../core/kernel/network.ts";

const CLOUDFLARE_ORIGIN_ERROR_STATUS = 530;
const CLOUDFLARE_ERROR_PAGE = /^error code: 1[0-9]{3}\s*$/u;
const ERROR_PAGE_BYTES = 64;

const PEEK_NOT_CANCELLED = { event: "origin-error-peek-not-cancelled", fields: {} } as const;

async function firstBytes(body: ReadableStream<Uint8Array> | null): Promise<string> {
  if (body === null) {
    return "";
  }

  const reader = body.getReader();

  const prefixFrom = async (taken: Uint8Array): Promise<Uint8Array> => {
    if (taken.length >= ERROR_PAGE_BYTES) return taken;

    const { done, value } = await reader.read();

    if (done) return taken;

    return prefixFrom(
      new Uint8Array([...taken, ...value.subarray(0, ERROR_PAGE_BYTES - taken.length)]),
    );
  };

  const prefix = await prefixFrom(new Uint8Array(0));
  void bestEffort(PEEK_NOT_CANCELLED, () => reader.cancel());

  return new TextDecoder().decode(prefix);
}

async function refuseUnreachableOrigin(url: string, response: Response): Promise<void> {
  if (response.status !== CLOUDFLARE_ORIGIN_ERROR_STATUS) {
    return;
  }

  const page = await firstBytes(response.clone().body);

  if (CLOUDFLARE_ERROR_PAGE.test(page)) {
    await response.body?.cancel();

    throw new Error(`Cloudflare could not reach ${url}: ${page.trim()}`);
  }
}

export const workerFetch: typeof fetch = async (input, init) => {
  const request = new Request(input, init);
  const response = await fetch(request, { redirect: "manual" });
  await refuseUnreachableOrigin(request.url, response);

  return response;
};

export const workerNetwork: Network = networkOver({
  getHeaders: (caller) => withCallerHeaders(REQUEST_HEADERS, caller),
  lookup: null,
  send: async ({ method, url, headers, signal, body }) => {
    const init: RequestInit = { method, headers, signal };

    if (body !== undefined) init.body = body;

    return wireResponseOf(await workerFetch(url, init));
  },
});
