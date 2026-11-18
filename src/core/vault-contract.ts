import { z } from "zod";

const GithubInputSchema = z.strictObject({
  mode: z.literal("github").optional(),
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

export const VAULT_FOLDER_MAX = 4096;

export const VaultFolderInputSchema = z.strictObject({
  mode: z.literal("folder"),
  folder: z
    .string()
    .trim()
    .max(VAULT_FOLDER_MAX)
    .regex(/^\/[^\\\p{Cc}]*$/u)
    .refine((path) => !path.split("/").some((part) => part === "." || part === ".."))
    .transform((path) => path.replaceAll(/\/{2,}/gu, "/").replace(/\/$/u, "") || "/"),
});

export const VaultInputSchema = z.union([GithubInputSchema, VaultFolderInputSchema]);
export const VaultVerifyInputSchema = z.union([
  GithubInputSchema.extend({ token: GithubInputSchema.shape.token.optional() }),
  VaultFolderInputSchema,
]);
export type VaultVerifyInput = z.infer<typeof VaultVerifyInputSchema>;

const GithubViewSchema = z.object({
  mode: z.literal("github"),
  folderAvailable: z.boolean(),
  repository: z.string(),
  branch: z.string(),
  secretReady: z.boolean(),
  token: z.enum(["none", "saved", "unreadable"]),
});
const FolderViewSchema = z.object({
  mode: z.literal("folder"),
  folderAvailable: z.literal(true),
  folder: z.string(),
  secretReady: z.boolean(),
});
export const VaultViewSchema = z.discriminatedUnion("mode", [GithubViewSchema, FolderViewSchema]);

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
    "folder-unavailable",
    "folder-missing",
    "folder-permission",
    "vault-busy",
  ]),
});

export const VaultResultSchema = z.union([
  VaultViewSchema,
  VaultRefusalSchema,
  z.object({ kind: z.literal("verified") }),
]);

export type GithubVaultInput = z.infer<typeof GithubInputSchema>;
export type VaultInput = z.infer<typeof VaultInputSchema>;
export type VaultView = z.infer<typeof VaultViewSchema>;
export type VaultRefusal = z.infer<typeof VaultRefusalSchema>;

export const VAULT_DEADLINE_MS = 120_000;
export const VAULT_NOTE_LIMIT = 20;

export const VAULT_FILE_BYTES = 8 * 1024 * 1024;
export const GITHUB_FILE_BYTES = 100 * 1024 * 1024;
