import { randomBytes } from "node:crypto";

const keys = {
  THREADSIFT_WRONG_AI_KEY: randomBytes(32).toString("hex"),
  THREADSIFT_WRONG_GITHUB_TOKEN: `github_pat_${randomBytes(24).toString("hex")}`,
};

for (const [name, value] of Object.entries(keys)) process.stdout.write(`${name}=${value}\n`);
