export interface FilePage {
  readonly keys: readonly string[];
  readonly cursor: string | null;
}

export interface FileStore {
  readonly put: (key: string, bytes: Uint8Array) => Promise<void>;
  readonly get: (key: string) => Promise<ReadableStream<Uint8Array> | null>;
  readonly delete: (keys: readonly string[]) => Promise<void>;
  readonly list: (prefix: string, cursor: string | null, limit: number) => Promise<FilePage>;
}
