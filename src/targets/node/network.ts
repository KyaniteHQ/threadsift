import { lookup } from "node:dns";
import { type IncomingMessage, type RequestOptions, request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { type Readable, type Transform, pipeline } from "node:stream";
import { createBrotliDecompress, createGunzip, createInflate } from "node:zlib";

import { HOP_DEADLINE_MS } from "../../core/contract/request-waits.ts";
import { type Exchange, networkOver } from "../../core/kernel/network-transport.ts";
import {
  type Network,
  NetworkFailure,
  REQUEST_HEADERS,
  type RedditSession,
  type RequestHeaders,
  type WireResponse,
  wireResponseOf,
} from "../../core/kernel/network.ts";
import { publicAddressesOf } from "../../core/kernel/public-host.ts";
import { redditSessionOver } from "../../core/reddit/reddit-session.ts";

const ACCEPT_ENCODING = "gzip, deflate, br";
const IDENTITY = "identity";

const CONNECT_OPTIONS = {
  autoSelectFamilyAttemptTimeout: HOP_DEADLINE_MS,
};

const DECODERS: ReadonlyMap<string, () => Transform> = new Map([
  ["gzip", createGunzip],
  ["deflate", createInflate],
  ["br", createBrotliDecompress],
]);

type AddressLookup = NonNullable<RequestOptions["lookup"]>;

const globalAddressesOnly: AddressLookup = (hostname, options, callback) => {
  lookup(hostname, { ...options, all: true }, (error, resolved) => {
    if (error !== null) {
      callback(error, []);

      return;
    }

    const verdict = publicAddressesOf(hostname, resolved);

    if (verdict.kind === "refused") {
      callback(verdict.failure, []);

      return;
    }

    const [first] = verdict.addresses;

    if (options.all === true) {
      callback(null, verdict.addresses);
    } else {
      callback(null, first.address, first.family);
    }
  });
};

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

function exchange({
  method,
  url,
  headers,
  signal,
  lookup: connectLookup,
  body,
}: Readonly<Exchange<AddressLookup>>): Promise<WireResponse> {
  return new Promise<WireResponse>((resolve, reject) => {
    const send = new URL(url).protocol === "https:" ? httpsRequest : httpRequest;

    const request = send(
      url,
      {
        method,
        headers,
        lookup: connectLookup,
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
          header: (name) => firstHeader(response.headers[name]),
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

const withEncodings = (caller: RequestHeaders): RequestHeaders => ({
  ...REQUEST_HEADERS,
  "accept-encoding": ACCEPT_ENCODING,
  ...caller,
});

export const nodeNetwork: Network = networkOver({
  headers: {
    GET: withEncodings,
    POST: (caller) => ({ ...withEncodings(caller), "accept-encoding": IDENTITY }),
  },
  lookup: globalAddressesOnly,
  send: exchange,
});

export const nodeRedditSession: RedditSession = redditSessionOver(
  async ({ host, path, headers }, signal) =>
    wireResponseOf(await fetch(`https://${host}${path}`, { headers, redirect: "manual", signal })),
);
