import { parseHTML } from "linkedom";

import { resolveUrl } from "./links.ts";

const WHITESPACE = /[\t\n\f\r ]/u;
const DIGIT = /[0-9]/u;
const DIGIT_OR_DOT = /[0-9.]/u;
const SEPARATOR = /[;,\t\n\f\r ]/u;
const URL_KEYWORD = /^url[\t\n\f\r ]*=[\t\n\f\r ]*/iu;
const QUOTE = /["']/u;
const HTTP_EQUIV = /http-equiv/iu;

interface Refresh {
  readonly seconds: number;
  readonly urlString: string | null;
}

function skipWhile(input: string, from: number, accepts: Readonly<RegExp>): number {
  let position = from;

  while (position < input.length && accepts.test(input.charAt(position))) {
    position += 1;
  }

  return position;
}

function afterSeparator(input: string, from: number): number | null {
  if (from >= input.length) {
    return from;
  }

  if (!SEPARATOR.test(input.charAt(from))) {
    return null;
  }

  const afterSpace = skipWhile(input, from, WHITESPACE);
  const afterComma = /[;,]/u.test(input.charAt(afterSpace)) ? afterSpace + 1 : afterSpace;

  return skipWhile(input, afterComma, WHITESPACE);
}

function urlStringOf(input: string, from: number): string | null {
  if (from >= input.length) {
    return null;
  }

  const rest = input.slice(from);
  const keyword = URL_KEYWORD.exec(rest);

  if (keyword === null && /^u/iu.test(rest)) {
    return rest;
  }

  const start = from + (keyword?.[0].length ?? 0);
  const quote = QUOTE.test(input.charAt(start)) ? input.charAt(start) : "";
  const urlString = input.slice(start + quote.length);
  const end = quote === "" ? -1 : urlString.indexOf(quote);

  return end === -1 ? urlString : urlString.slice(0, end);
}

function parseRefresh(input: string): Refresh | null {
  const timeStart = skipWhile(input, 0, WHITESPACE);
  const timeEnd = skipWhile(input, timeStart, DIGIT);

  if (timeEnd === timeStart && input.charAt(timeEnd) !== ".") {
    return null;
  }

  const seconds = timeEnd === timeStart ? 0 : Number(input.slice(timeStart, timeEnd));
  const urlStart = afterSeparator(input, skipWhile(input, timeEnd, DIGIT_OR_DOT));

  return urlStart === null ? null : { seconds, urlString: urlStringOf(input, urlStart) };
}

function resolved(urlString: string, pageUrl: string): URL | null {
  const url = resolveUrl(urlString, pageUrl);

  return url?.protocol === "javascript:" ? null : url;
}

export function metaRefreshTarget(html: string, pageUrl: string): string | null {
  if (!HTTP_EQUIV.test(html)) {
    return null;
  }

  const { document } = parseHTML(html);

  for (const meta of document.querySelectorAll("meta[http-equiv][content]")) {
    if (meta.getAttribute("http-equiv")?.toLowerCase() !== "refresh") {
      continue;
    }

    const refresh = parseRefresh(meta.getAttribute("content") ?? "");

    if (refresh === null) {
      continue;
    }

    if (refresh.urlString === null) {
      return null;
    }

    const target = resolved(refresh.urlString, pageUrl);

    if (target !== null) {
      return refresh.seconds === 0 ? target.href : null;
    }
  }

  return null;
}
