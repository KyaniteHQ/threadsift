import { SECRET_INPUT_MAX } from "../../src/core/contract/secret-input.ts";
import { VAULT_FOLDER_MAX, VAULT_NAME_MAX } from "../../src/core/contract/vault-contract.ts";

const FIELD = {
  type: "text",
  autoComplete: "off",
  required: true,
  maxLength: VAULT_NAME_MAX,
} as const;

export const REPOSITORY = { ...FIELD, name: "repository" };

export const BRANCH = { ...FIELD, name: "branch" };

export const FOLDER = { ...FIELD, name: "folder", maxLength: VAULT_FOLDER_MAX };

export const TOKEN = {
  name: "token",
  type: "password",
  autoComplete: "off",
  required: true,
  maxLength: SECRET_INPUT_MAX,
} as const;
