import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import type { ServerResponse } from "node:http";
import { createServer } from "node:https";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { REDDIT_HOST, pageFor, permalinkFor, threadFor } from "./synthetic-threads.ts";

const CHUNK_BYTES = 64 * 1024;

const SLOW_MS = 3000;

export { PAGE_MARKDOWN, REDDIT_HOST, STREAM_LIMIT } from "./synthetic-threads.ts";

export interface Entry {
  readonly t: number;
  readonly path: string;
  readonly postId: string;
  readonly kind: "page" | "thread-json" | "permalink" | "other";
  bytes: number;
  closedEarly: boolean;
  closedAt: number | null;
}

export interface StandIn {
  readonly log: readonly Entry[];
  readonly port: number;
  readonly close: () => Promise<void>;
}

function sendWhole(res: ServerResponse, entry: Entry, text: string): void {
  const buffer = Buffer.from(text);
  res.setHeader("content-length", String(buffer.length));
  entry.bytes = buffer.length;
  res.end(buffer);
}

function sendChunked(res: ServerResponse, entry: Entry, text: string): void {
  const buffer = Buffer.from(text);
  res.setHeader("transfer-encoding", "chunked");
  let offset = 0;

  const next = (): void => {
    if (res.destroyed) return;

    if (offset >= buffer.length) {
      res.end();

      return;
    }

    const piece = buffer.subarray(offset, offset + CHUNK_BYTES);
    offset += piece.length;
    entry.bytes = offset;
    res.write(piece);
    setTimeout(next, 4);
  };

  next();
}

function deliver(res: ServerResponse, entry: Entry, text: string, chunked: boolean): void {
  res.setHeader("content-type", "application/json");

  if (chunked) sendChunked(res, entry, text);
  else sendWhole(res, entry, text);
}

function deliverLater(res: ServerResponse, entry: Entry, text: string): void {
  const timer = setTimeout(() => {
    deliver(res, entry, text, false);
  }, SLOW_MS);

  res.on("close", () => {
    clearTimeout(timer);
  });
}

function pemFiles() {
  const dir = mkdtempSync(join(tmpdir(), "threadsift-stand-in-"));

  try {
    execFileSync(
      "openssl",
      [
        "req",
        "-x509",
        "-newkey",
        "rsa:2048",
        "-nodes",
        "-days",
        "2",
        "-keyout",
        join(dir, "key.pem"),
        "-out",
        join(dir, "cert.pem"),
        "-subj",
        `/CN=${REDDIT_HOST}`,
        "-addext",
        `subjectAltName=DNS:${REDDIT_HOST}`,
      ],
      { stdio: "ignore" },
    );

    return { key: readFileSync(join(dir, "key.pem")), cert: readFileSync(join(dir, "cert.pem")) };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

interface Classified {
  readonly kind: Entry["kind"];
  readonly postId: string;
  readonly commentId: string;
}

function classify(pathname: string): Classified {
  const permalink = /^\/comments\/(?<post>[^/]+)\/_\/(?<id>[^/.]+)\.json$/u.exec(pathname)?.groups;

  if (permalink !== undefined) {
    return { kind: "permalink", postId: permalink["post"] ?? "", commentId: permalink["id"] ?? "" };
  }

  const read = /^\/r\/synthetic\/comments\/(?<post>[^/]+)\/[^/]*\/(?<json>\.json)?$/u.exec(
    pathname,
  )?.groups;

  if (read === undefined) return { kind: "other", postId: "", commentId: "" };

  const kind = read["json"] === undefined ? "page" : "thread-json";

  return { kind, postId: read["post"] ?? "", commentId: "" };
}

function answer(res: ServerResponse, entry: Entry, commentId: string): void {
  const { kind, postId } = entry;

  if (kind === "permalink") {
    const text = permalinkFor(postId, commentId);

    if (postId.includes("slow")) deliverLater(res, entry, text);
    else deliver(res, entry, text, postId.startsWith("stubover"));

    return;
  }

  const found = kind === "thread-json" ? threadFor(postId) : null;

  if (kind === "page") {
    res.setHeader("content-type", "text/html; charset=utf-8");
    res.end(pageFor(postId));
  } else if (found === null) {
    res.statusCode = 404;
    res.end("{}");
  } else {
    deliver(res, entry, found, postId.startsWith("overchunk"));
  }
}

export function startStandIn(port: number): Promise<StandIn> {
  const log: Entry[] = [];
  let served = 0;

  const server = createServer(pemFiles(), (req, res) => {
    const { pathname } = new URL(req.url ?? "/", `https://${REDDIT_HOST}`);
    const { kind, postId, commentId } = classify(pathname);
    served += 1;

    const entry: Entry = {
      t: Date.now(),
      path: req.url ?? "",
      postId,
      kind,
      bytes: 0,
      closedEarly: false,
      closedAt: null,
    };

    log.push(entry);

    res.on("close", () => {
      entry.closedEarly = !res.writableFinished;
      entry.closedAt = Date.now();
    });

    res.setHeader("x-ratelimit-remaining", String(Math.max(0, 100 - served)));
    answer(res, entry, commentId);
  });

  return new Promise((resolve) => {
    server.listen(port, "127.0.0.1", () => {
      resolve({
        log,
        port,
        close: () =>
          new Promise((done) => {
            server.close(() => {
              done();
            });
          }),
      });
    });
  });
}
