import { networkOver } from "../../core/kernel/network-transport.ts";
import {
  type Network,
  REQUEST_HEADERS,
  wireResponseOf,
  withCallerHeaders,
} from "../../core/kernel/network.ts";
import { originFetch } from "../../core/kernel/origin-fetch.ts";

export const workerNetwork: Network = networkOver({
  getHeaders: (caller) => withCallerHeaders(REQUEST_HEADERS, caller),
  lookup: null,
  send: async ({ method, url, headers, signal, body }) => {
    const init: RequestInit = { method, headers, signal };

    if (body !== undefined) init.body = body;

    return wireResponseOf(await originFetch(url, init));
  },
});
