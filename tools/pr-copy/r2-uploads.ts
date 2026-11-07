import { createHash, createHmac } from "node:crypto";

import { parseHTML } from "linkedom";
import { z } from "zod";

import { CloudflareAnswerError, PageSchema, cloudflareCall } from "./cloudflare-api.ts";
import { requiredEnv } from "./env.ts";
import { callTimeout, remaining } from "./timeout.ts";

const REGION = "auto";

const UPLOADS_PER_LIST = "100";

const TokenId = PageSchema.extend({ result: z.object({ id: z.string().min(1) }) });

const Upload = z.object({ key: z.string().min(1), uploadId: z.string().min(1) });

interface Credentials {
  readonly id: string;
  readonly secret: string;
}

const sha256 = (data: string) => createHash("sha256").update(data).digest("hex");

const EMPTY_PAYLOAD = sha256("");

const encode = (text: string) =>
  encodeURIComponent(text).replaceAll(
    /[!'()*]/gu,
    (char) => `%${(char.codePointAt(0) ?? 0).toString(16).toUpperCase()}`,
  );

async function credentials(): Promise<Credentials> {
  const { result } = await cloudflareCall("GET", "tokens/verify", TokenId);

  return { id: result.id, secret: sha256(requiredEnv("CLOUDFLARE_API_TOKEN")) };
}

interface S3Call {
  readonly method: "GET" | "DELETE";
  readonly bucket: string;
  readonly key?: string;
  readonly query: Readonly<Record<string, string>>;
}

interface Target {
  readonly host: string;
  readonly path: string;
  readonly query: string;
}

function targetOf(call: Readonly<S3Call>): Target {
  const path = ["", call.bucket, ...(call.key === undefined ? [] : call.key.split("/"))]
    .map((part) => encode(part))
    .join("/");

  const query = Object.entries(call.query)
    .toSorted(([a], [b]) => a.localeCompare(b))
    .map(([name, value]) => `${encode(name)}=${encode(value)}`)
    .join("&");

  return { host: `${requiredEnv("CLOUDFLARE_ACCOUNT_ID")}.r2.cloudflarestorage.com`, path, query };
}

function authorization(
  login: Readonly<Credentials>,
  method: string,
  target: Readonly<Target>,
  stamp: string,
): string {
  const date = stamp.slice(0, 8);
  const scope = `${date}/${REGION}/s3/aws4_request`;
  const signed = "host;x-amz-content-sha256;x-amz-date";

  const canonical = [
    method,
    target.path,
    target.query,
    `host:${target.host}\nx-amz-content-sha256:${EMPTY_PAYLOAD}\nx-amz-date:${stamp}\n`,
    signed,
    EMPTY_PAYLOAD,
  ].join("\n");

  const key = [date, REGION, "s3", "aws4_request"].reduce(
    (derived, part) => createHmac("sha256", derived).update(part).digest(),
    Buffer.from(`AWS4${login.secret}`),
  );

  const toSign = ["AWS4-HMAC-SHA256", stamp, scope, sha256(canonical)].join("\n");
  const signature = createHmac("sha256", key).update(toSign).digest("hex");

  return `AWS4-HMAC-SHA256 Credential=${login.id}/${scope}, SignedHeaders=${signed}, Signature=${signature}`;
}

async function s3Request(
  login: Readonly<Credentials>,
  call: Readonly<S3Call>,
  deadline: number,
): Promise<string> {
  const target = targetOf(call);
  const stamp = new Date().toISOString().replaceAll(/[:-]|\.\d{3}/gu, "");

  const response = await fetch(`https://${target.host}${target.path}?${target.query}`, {
    method: call.method,
    headers: {
      "x-amz-content-sha256": EMPTY_PAYLOAD,
      "x-amz-date": stamp,
      authorization: authorization(login, call.method, target, stamp),
    },
    signal: callTimeout(deadline),
  });

  if (!response.ok) {
    throw new CloudflareAnswerError(call.method, `r2-s3/${call.bucket}`, response.status);
  }

  return response.text();
}

function parseUploads(xml: string) {
  const { document } = parseHTML(xml);

  return z.array(Upload).parse(
    [...document.querySelectorAll("Upload")].map((upload) => ({
      key: upload.querySelector("Key")?.textContent,
      uploadId: upload.querySelector("UploadId")?.textContent,
    })),
  );
}

async function abortPage(
  login: Readonly<Credentials>,
  bucket: string,
  deadline: number,
): Promise<number> {
  if (remaining(deadline) === 0) {
    throw new Error(`Aborting the uploads in ${bucket} did not finish in time`);
  }

  const listed = await s3Request(
    login,
    { method: "GET", bucket, query: { uploads: "", "max-uploads": UPLOADS_PER_LIST } },
    deadline,
  );

  const uploads = parseUploads(listed);

  if (uploads.length === 0) {
    return 0;
  }

  await Promise.all(
    uploads.map((upload) =>
      s3Request(
        login,
        { method: "DELETE", bucket, key: upload.key, query: { uploadId: upload.uploadId } },
        deadline,
      ),
    ),
  );

  return uploads.length + (await abortPage(login, bucket, deadline));
}

export async function abortIncompleteUploads(bucket: string, deadline: number): Promise<number> {
  return abortPage(await credentials(), bucket, deadline);
}
