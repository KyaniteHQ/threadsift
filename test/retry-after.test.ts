import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { SECOND_MS } from "../src/core/contract/time-units.ts";
import { retryAfterMs } from "../src/core/kernel/retry-after.ts";

const NOW = Date.UTC(2026, 10, 20, 12, 0, 0);

const YEAR_MS = 365 * 24 * 3600 * SECOND_MS;

const at = (...parts: Parameters<typeof Date.UTC>) => Date.UTC(...parts) - NOW;

const READINGS: readonly (readonly [string | null, number | null])[] = [
  ["0", 0],
  ["120", 120 * SECOND_MS],
  [" 7 ", 7 * SECOND_MS],
  ["\t5\t", 5 * SECOND_MS],
  ["\u00A05\u00A0", null],
  ["5, 6", null],
  ["0120", 120 * SECOND_MS],
  ["9".repeat(400), YEAR_MS],
  ["99999999999", YEAR_MS],
  [null, null],
  ["", null],
  ["   ", null],
  ["1.5", null],
  ["-1", null],
  ["+5", null],
  ["1e3", null],
  ["0x10", null],
  ["soon", null],
  ["Fri, 20 Nov 2026 12:01:30 GMT", 90 * SECOND_MS],
  ["Friday, 20-Nov-26 12:01:30 GMT", 90 * SECOND_MS],
  ["Fri Nov 20 12:01:30 2026", 90 * SECOND_MS],
  ["Sat Dec  5 12:00:00 2026", at(2026, 11, 5, 12)],
  ["Sat Dec 05 12:00:00 2026", at(2026, 11, 5, 12)],
  ["Thursday, 20-Nov-70 12:00:00 GMT", YEAR_MS],
  ["Thursday, 20-Nov-80 12:00:00 GMT", 0],
  ["Friday, 20-Nov-76 12:00:00 GMT", YEAR_MS],
  ["Friday, 20-Nov-76 12:00:01 GMT", 0],
  ["Friday, 20-Nov-76 11:59:59 GMT", YEAR_MS],
  ["Fri, 20 Nov 2026 23:59:60 GMT", at(2026, 10, 21)],
  ["Fri, 20 Nov 2026 12:00:00 GMT", 0],
  ["Sun, 06 Nov 1994 08:49:37 GMT", 0],
  ["Sunday, 06-Nov-94 08:49:37 GMT", 0],
  ["Sun Nov  6 08:49:37 1994", 0],
  ["Mon, 31 Feb 2027 12:00:00 GMT", null],
  ["Fri, 20 Nov 2026 24:00:00 GMT", null],
  ["Fri, 20 Foo 2026 12:01:30 GMT", null],
  ["Fri, 20 Nov 2026 12:01:30 UTC", null],
  ["fri, 20 nov 2026 12:01:30 gmt", null],
  ["Fri, 20 Nov 2026 12:01:30 +0000", null],
  ["2026-11-20T12:01:30Z", null],
];

describe("Retry-After is read as RFC 9110 section 10.2.3 defines it: whole seconds or an HTTP-date", () => {
  it("returns the wait in milliseconds, 0 for zero or a past date, at most one year, and null for any other value", () => {
    for (const [header, wait] of READINGS) {
      assert.equal(retryAfterMs(header, NOW), wait, String(header));
    }
  });

  it("reads a two-digit year as the latest year that is not more than 50 years ahead of a clock after 2050", () => {
    const later = Date.UTC(2099, 11, 31, 12);

    assert.equal(retryAfterMs("Friday, 01-Jan-00 00:00:00 GMT", later), 12 * 3600 * SECOND_MS);
    assert.equal(retryAfterMs("Wednesday, 01-Jan-49 00:00:00 GMT", later), YEAR_MS);
    assert.equal(retryAfterMs("Saturday, 01-Jan-50 00:00:00 GMT", later), 0);
  });
});
