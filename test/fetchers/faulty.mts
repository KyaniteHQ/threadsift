import { hostOf, words } from "./words.mts";

const SIZED_TITLE = "Sized";

const UNIT = 'é"\n';

const encoder = new TextEncoder();

const escapedBytes = (text: string): number =>
  encoder.encode(JSON.stringify(text).slice(1, -1)).length;

function sizedPage(bytes: number) {
  const free = bytes - encoder.encode(JSON.stringify({ markdown: "", title: SIZED_TITLE })).length;
  const markdown = UNIT.repeat(Math.floor(free / escapedBytes(UNIT)));
  const padding = free - escapedBytes(markdown);

  return { markdown: `${markdown}${"a".repeat(padding)}`, title: SIZED_TITLE };
}

function matched(pathname: string) {
  switch (pathname) {
    case "/matches-promise":
      return Promise.resolve(true);
    case "/matches-rejected-promise":
      return Promise.reject(new Error("FAULTYMESSAGE"));
    case "/matches-string":
      return "true";
    case "/matches-truthy":
      return 1;
    case "/matches-throws":
      throw new Error("FAULTYMESSAGE a matcher error message");
    default:
      return true;
  }
}

function answered(pathname: string) {
  switch (pathname) {
    case "/throws":
      throw new Error("FAULTYMESSAGE a plug-in error message");
    case "/rejects":
      return Promise.reject(new TypeError("FAULTYMESSAGE a rejected answer"));
    case "/no-title":
      return { markdown: words("NOTITLEMARKER") };
    case "/empty-title":
      return { markdown: words("EMPTYTITLEMARKER"), title: "" };
    case "/videos":
      return {
        markdown: words("VIDEOSMARKER"),
        title: "With videos",
        videos: ["https://example.com/clip.mp4"],
      };
    case "/extra-field":
      return { markdown: words("EXTRAMARKER"), title: "Extra", url: "https://x.test/" };
    case "/not-an-object":
      return "a plain string";
    case "/size-over-limit":
      return sizedPage(1_000_001);
    default:
      return sizedPage(1_000_000);
  }
}

export default {
  matches: (url: string) =>
    hostOf(url) === "faulty.test" ? matched(new URL(url).pathname) : false,
  fetch: (url: string) => Promise.resolve(answered(new URL(url).pathname)),
};
