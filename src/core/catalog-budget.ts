import { utf8Length } from "./encoding.ts";

const DIGEST_CATALOG_BYTES = 4500;

const CATALOG_OVERHEAD_BYTES = utf8Length('{"topics":[],"tags":[]}');

export const CATALOG_LIST_BYTES = Math.floor((DIGEST_CATALOG_BYTES - CATALOG_OVERHEAD_BYTES) / 2);

export const CATALOG_NAME_LIMIT = Math.floor(CATALOG_LIST_BYTES / 4);
