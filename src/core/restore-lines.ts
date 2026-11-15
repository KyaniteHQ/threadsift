import { z } from "zod";

const NEWLINE = 0x0a;

const TEXT = new TextDecoder("utf-8", { fatal: true });

const RowSchema = z.record(z.string(), z.unknown()).readonly();

export type Row = z.infer<typeof RowSchema>;

export interface Lines {
  readonly lines: readonly Uint8Array[];
  readonly consumed: number;
}

export function completeLines(
  window: Uint8Array,
  { final, limit, bytes }: Readonly<{ final: boolean; limit: number; bytes: number }>,
): Lines {
  const lines: Uint8Array[] = [];
  let from = 0;

  while (lines.length < limit && from < window.length) {
    const end = window.indexOf(NEWLINE, from);

    if (end === -1 && !final) break;

    const to = end === -1 ? window.length : end;

    if (lines.length > 0 && to + 1 > bytes) break;

    lines.push(window.subarray(from, to));
    from = to + 1;
  }

  return { lines, consumed: Math.min(from, window.length) };
}

export function parsedJson<Parsed>(bytes: Uint8Array, schema: z.ZodType<Parsed>): Parsed | null {
  try {
    const parsed = schema.safeParse(JSON.parse(TEXT.decode(bytes)));

    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function parsedRow(line: Uint8Array): Row | null {
  return parsedJson(line, RowSchema);
}

export function rowsOf(lines: readonly Uint8Array[]): readonly Row[] {
  return lines.map((line) => {
    const row = parsedRow(line);

    if (row === null) throw new Error("A record line is no longer a record");

    return row;
  });
}
