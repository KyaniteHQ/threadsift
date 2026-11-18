import type { VaultKind, VaultSubject } from "./vault-tables.ts";

export type VaultFile = Readonly<{ path: string }> &
  (
    | Readonly<{ kind: "binary"; key: string; size: number }>
    | Readonly<{ kind: "memory"; bytes: Uint8Array }>
    | Readonly<{ kind: "delete" }>
  );

export interface VaultProgress {
  readonly path: string;
  readonly subjectId: number;
  readonly noteKind: VaultKind;
  readonly sequence: number;
  readonly sha: string | null;
}

export type VaultChange = VaultProgress &
  (Readonly<{ kind: "put"; bytes: Uint8Array }> | Readonly<{ kind: "delete" }>);

export interface VaultWrite {
  readonly files: readonly VaultChange[];
  readonly current: () => Promise<boolean>;
}

export interface VaultTarget {
  readonly verify: () => Promise<void>;
  readonly subjects: () => Promise<readonly VaultSubject[]>;
  readonly logMonths: () => Promise<readonly number[]>;
  readonly files: (
    subject: VaultSubject,
  ) => Promise<readonly Readonly<{ path: string; sha: string }>[]>;
  readonly write: (operation: Readonly<VaultWrite>) => Promise<void>;
}

export type VaultFolder = (path: string, signal: AbortSignal) => VaultTarget;

export class VaultFileConflict extends Error {
  readonly file: Readonly<VaultChange>;

  constructor(file: Readonly<VaultChange>) {
    super("folder-conflict");
    this.file = file;
  }
}
