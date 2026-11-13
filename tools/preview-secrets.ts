import { randomBytes } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { z } from "zod";

import { type Wrangler, previewResourceExists } from "./preview-cloudflare.ts";

export const REQUIRED_SECRETS = ["THREADSIFT_SECRET_KEY", "SETUP_CODE"] as const;

const initialValues = {
  THREADSIFT_SECRET_KEY: () => randomBytes(32).toString("hex"),
  SETUP_CODE: () => z.string().min(16).parse(process.env["PREVIEW_SETUP_CODE"]),
};

async function missingSecrets(
  name: string,
  wrangler: Wrangler,
): Promise<Readonly<Record<string, string>>> {
  const present = (await previewResourceExists("worker", name))
    ? z
        .array(z.object({ name: z.string() }))
        .parse(JSON.parse(wrangler(["secret", "list"])))
        .map((secret) => secret.name)
    : [];

  return Object.fromEntries(
    REQUIRED_SECRETS.flatMap((secret) =>
      present.includes(secret) ? [] : [[secret, initialValues[secret]()]],
    ),
  );
}

export async function deployWithSecrets(name: string, wrangler: Wrangler): Promise<void> {
  const missing = await missingSecrets(name, wrangler);

  if (Object.keys(missing).length === 0) {
    wrangler(["deploy", "--keep-vars"]);

    return;
  }

  const directory = mkdtempSync(join(tmpdir(), "preview-secrets-"));

  try {
    const secretsFile = join(directory, "secrets.json");

    writeFileSync(secretsFile, JSON.stringify(missing), { mode: 0o600 });
    wrangler(["deploy", "--keep-vars", "--secrets-file", secretsFile]);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}
