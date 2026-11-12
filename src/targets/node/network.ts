import { type LookupAddress, lookup } from "node:dns";
import { type IncomingMessage, request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import type { LookupFunction, TcpNetConnectOpts } from "node:net";
import { type Readable, type Transform, pipeline } from "node:stream";
import { createBrotliDecompress, createGunzip, createInflate } from "node:zlib";

import { isGlobalAddress } from "../../core/addresses.ts";
import {
  HOP_DEADLINE_MS,
  type Network,
  type NetworkResponse,
  REQUEST_HEADERS,
  type RequestHeaders,
  NetworkFailure,
} from "../../core/ports.ts";
import { assertPublicHost } from "../../core/public-host.ts";

const ACCEPT_ENCODING = "gzip, deflate, br";
const IDENTITY = "identity";

const CONNECT_OPTIONS: Pick<TcpNetConnectOpts, "autoSelectFamilyAttemptTimeout"> = {
  autoSelectFamilyAttemptTimeout: HOP_DEADLINE_MS,
};

const DECODERS: ReadonlyMap<string, () => Transform> = new Map([
  ["gzip", createGunzip],
  ["deflate", createInflate],
  ["br", createBrotliDecompress],
]);

const globalAddressesOnly: LookupFunction = (hostname, options, callback) => {
  lookup(hostname, { ...options, all: true }, (error, resolved) => {
    if (error !== null) {
      callback(error, []);

      return;
    }

    const addresses = resolved.filter(({ address }) => isGlobalAddress(address));
    const [first] = addresses;

    if (first === undefined) {
      callback(new NetworkFailure("refused", `${hostname} has no globally reachable address`), []);
    } else if (options.all === true) {
      callback(null, addresses);
    } else {
      callback(null, first.address, first.family);
    }
  });
};

function lookedUp(hostname: string, signal: AbortSignal): Promise<readonly LookupAddress[] | null> {
  return new Promise((resolve) => {
    const abandon = () => {
      resolve(null);
    };

    signal.addEventListener("abort", abandon, { once: true });

    lookup(hostname, { all: true }, (error, resolved) => {
      signal.removeEventListener("abort", abandon);
      resolve(error === null ? resolved : null);
    });
  });
}

function firstHeader(value: string | readonly string[] | undefined): string | null {
  return [value].flat()[0] ?? null;
}

function encodingOf(response: IncomingMessage): string {
  return (response.headers["content-encoding"] ?? IDENTITY).trim().toLowerCase();
}

function decodedBody(response: IncomingMessage, encoding: string): Readable {
  const decoder = DECODERS.get(encoding)?.();

  return decoder === undefined ? response : pipeline(response, decoder, () => {});
}

function exchange(
  method: "GET" | "POST",
  url: string,
  signal: AbortSignal,
  headers: RequestHeaders,
  body?: string,
): Promise<NetworkResponse> {
  return new Promise<NetworkResponse>((resolve, reject) => {
    const send = new URL(url).protocol === "https:" ? httpsRequest : httpRequest;

    const request = send(
      url,
      {
        method,
        headers: { ...REQUEST_HEADERS, "accept-encoding": ACCEPT_ENCODING, ...headers },
        lookup: globalAddressesOnly,
        ...CONNECT_OPTIONS,
        signal,
        agent: false,
      },
      (response) => {
        const encoding = encodingOf(response);

        if (encoding !== IDENTITY && !DECODERS.has(encoding)) {
          response.destroy();
          reject(new Error(`unsupported content-encoding ${encoding}`));

          return;
        }

        resolve({
          status: response.statusCode ?? 0,
          location: response.headers.location ?? null,
          contentType: response.headers["content-type"] ?? null,
          rateLimit: {
            retryAfter: firstHeader(response.headers["retry-after"]),
            remaining: firstHeader(response.headers["x-ratelimit-remaining"]),
            reset: firstHeader(response.headers["x-ratelimit-reset"]),
          },
          body: decodedBody(response, encoding),
        });
      },
    );

    request.on("error", (error: NodeJS.ErrnoException) => {
      reject(error.code === "ETIMEDOUT" ? new NetworkFailure("timeout", error.message) : error);
    });
    request.end(body);
  });
}

export const nodeNetwork: Network = {
  reachable: async (url, signal) => {
    const addresses = await lookedUp(new URL(url).hostname.replaceAll(/^\[|\]$/gu, ""), signal);

    return addresses === null || addresses.some(({ address }) => isGlobalAddress(address));
  },
  get: (url, signal, headers) => exchange("GET", url, signal, headers),
  post: async (url, body, signal, headers) => {
    assertPublicHost(url);

    const response = await exchange(
      "POST",
      url,
      signal,
      { ...headers, "accept-encoding": IDENTITY },
      body,
    );

    return response;
  },
};
