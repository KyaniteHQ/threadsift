import {
  type Network,
  type RequestHeaders,
  type WireResponse,
  networkResponseOf,
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

interface Transport<Lookup> {
  readonly headers: Readonly<Record<Method, (caller: RequestHeaders) => RequestHeaders>>;
  readonly lookup: Lookup;
  readonly send: (exchange: Readonly<Exchange<Lookup>>) => Promise<WireResponse>;
}

export function networkOver<Lookup>({
  headers,
  lookup,
  send,
}: Readonly<Transport<Lookup>>): Network {
  return {
    get: async (url, signal, caller) => {
      const wire = await send({ method: "GET", url, headers: headers.GET(caller), signal, lookup });

      return networkResponseOf(wire);
    },
    post: async (url, body, signal, caller) => {
      assertPublicHost(url);

      const wire = await send({
        method: "POST",
        url,
        headers: headers.POST(caller),
        signal,
        lookup,
        body,
      });

      return networkResponseOf(wire);
    },
  };
}
