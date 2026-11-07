import { marker, post } from "./thread-fixtures.ts";
import { comment, threadJson } from "./threads.ts";

export const FOUR_MIB = 4 * 1024 * 1024;
const BIG_BODY_UNITS = 82_500;

export function bigBody(end: string): string {
  return `${"lorem ipsum ".repeat(BIG_BODY_UNITS)}${end}`;
}

function paddedToFourMib(json: string): string {
  const bytes = Buffer.byteLength(json);

  if (bytes > FOUR_MIB) throw new Error(`the thread is ${bytes} bytes`);

  return json + " ".repeat(FOUR_MIB - bytes);
}

export function fourBigComments(id: string, tag = ""): string {
  return paddedToFourMib(
    threadJson(post(id, "A thread of long comments."), [
      comment("l1", "reader_a", bigBody(marker("endone", tag))),
      comment("l2", "reader_b", bigBody(marker("endtwo", tag))),
      comment("l3", "reader_c", bigBody(marker("endthree", tag))),
      comment("l4", "reader_d", bigBody(marker("endfour", tag))),
    ]),
  );
}
