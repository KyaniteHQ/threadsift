import { z } from "zod";

export const VaultInputSchema = z.object({
  repository: z
    .string()
    .trim()
    .max(240)
    .regex(/^[\w-]+\/[\w.-]+$/u)
    .refine((name) => ![".", ".."].includes(name.split("/")[1] ?? "")),
  branch: z
    .string()
    .trim()
    .min(1)
    .max(240)
    .refine(
      (name) =>
        !/[\s~^:?*[\\\p{Cc}]/u.test(name) &&
        !name.includes("..") &&
        !name.includes("@{") &&
        !name
          .split("/")
          .some((part) => part === "" || part.startsWith(".") || part.endsWith(".lock")) &&
        !name.endsWith(".") &&
        name !== "@",
    ),
  token: z
    .string()
    .trim()
    .min(1)
    .max(4096)
    .regex(/^[\u0021-\u007E]+$/u),
});

export const VaultVerifyInputSchema = VaultInputSchema.extend({
  token: VaultInputSchema.shape.token.optional(),
});
export type VaultVerifyInput = z.infer<typeof VaultVerifyInputSchema>;

const VaultLocationSchema = z.object({
  repository: z.string(),
  branch: z.string(),
  secretReady: z.boolean(),
});
export const VaultViewSchema = z.discriminatedUnion("token", [
  VaultLocationSchema.extend({ token: z.literal("none") }),
  VaultLocationSchema.extend({ token: z.literal("saved") }),
  VaultLocationSchema.extend({ token: z.literal("unreadable") }),
]);

export const VaultRefusalSchema = z.object({
  kind: z.literal("refused"),
  reason: z.enum([
    "secret-missing",
    "not-configured",
    "wrong-token",
    "not-found",
    "permission",
    "rate-limited",
    "unreachable",
    "github-error",
    "timeout",
  ]),
});

export const VaultResultSchema = z.union([
  VaultViewSchema,
  VaultRefusalSchema,
  z.object({ kind: z.literal("verified") }),
]);

export type VaultInput = z.infer<typeof VaultInputSchema>;
export type VaultView = z.infer<typeof VaultViewSchema>;
export type VaultRefusal = z.infer<typeof VaultRefusalSchema>;

export const VAULT_DEADLINE_MS = 120_000;
export const VAULT_NOTE_LIMIT = 20;

export const VAULT_FILE_BYTES = 8 * 1024 * 1024;
export const GITHUB_FILE_BYTES = 100 * 1024 * 1024;
