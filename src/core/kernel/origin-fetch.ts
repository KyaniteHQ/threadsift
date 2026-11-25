import { readPrefix } from "./capped.ts";
import { bestEffort } from "./failure-log.ts";

const CLOUDFLARE_ORIGIN_ERROR_STATUS = 530;
const CLOUDFLARE_ERROR_PAGE = /^error code: 1[0-9]{3}\s*$/u;
const ERROR_PAGE_BYTES = 64;

const PEEK_NOT_CANCELLED = { event: "origin-error-peek-not-cancelled", fields: {} } as const;

async function wholeShortBody(body: ReadableStream<Uint8Array> | null): Promise<string | null> {
  if (body === null) {
    return "";
  }

  const prefix = await readPrefix(body.values({ preventCancel: true }), ERROR_PAGE_BYTES);
  void bestEffort(PEEK_NOT_CANCELLED, () => body.cancel());

  return prefix.length < ERROR_PAGE_BYTES ? new TextDecoder().decode(prefix) : null;
}

async function refuseUnreachableOrigin(url: string, response: Response): Promise<void> {
  if (response.status !== CLOUDFLARE_ORIGIN_ERROR_STATUS) {
    return;
  }

  const page = await wholeShortBody(response.clone().body);

  if (page !== null && CLOUDFLARE_ERROR_PAGE.test(page)) {
    await response.body?.cancel();

    throw new Error(`Cloudflare could not reach ${url}: ${page.trim()}`);
  }
}

export const originFetch: typeof fetch = async (input, init) => {
  const request = new Request(input, init);
  const response = await fetch(request, { redirect: "manual" });
  await refuseUnreachableOrigin(request.url, response);

  return response;
};
