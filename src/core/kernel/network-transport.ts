import {
  type Network,
  NO_COMPRESSION,
  REQUEST_HEADERS,
  type RequestHeaders,
  type WireResponse,
  networkResponseOf,
  withCallerHeaders,
} from "./network.ts";
import { assertPublicHost } from "./public-host.ts";

type Method = "GET" | "POST";

export interface Exchange<Lookup> {
  readonly method: Method;
  readonly url: string;
  readonly headers: RequestHeaders;
  readonly signal: AbortSignal;
  readonly lookup: Lookup;
  readonly body?: string;
}

const POST_HEADERS: RequestHeaders = { ...REQUEST_HEADERS, ...NO_COMPRESSION };

interface Transport<Lookup> {
  readonly getHeaders: (caller: RequestHeaders) => RequestHeaders;
  readonly lookup: Lookup;
  readonly send: (exchange: Readonly<Exchange<Lookup>>) => Promise<WireResponse>;
}

export function networkOver<Lookup>({
  getHeaders,
  lookup,
  send,
}: Readonly<Transport<Lookup>>): Network {
  return {
    get: async (url, signal, caller) => {
      const wire = await send({ method: "GET", url, headers: getHeaders(caller), signal, lookup });

      return networkResponseOf(wire);
    },
    post: async (url, body, signal, caller) => {
      assertPublicHost(url);

      const wire = await send({
        method: "POST",
        url,
        headers: withCallerHeaders(POST_HEADERS, caller),
        signal,
        lookup,
        body,
      });

      return networkResponseOf(wire);
    },
  };
}
