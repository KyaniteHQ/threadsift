import { webUrlOf } from "./addresses.ts";
import { X_HOSTS, hostOf } from "./links.ts";

export interface EmbedLink {
  readonly url: string;
  readonly video: boolean;
}

const YOUTUBE_HOSTS: ReadonlySet<string> = new Set([
  "youtube.com",
  "m.youtube.com",
  "youtube-nocookie.com",
  "youtu.be",
]);

const VIMEO_HOSTS: ReadonlySet<string> = new Set(["vimeo.com", "player.vimeo.com"]);

const YOUTUBE_ID = /^[\w-]{11}$/u;
const YOUTUBE_PATH = /^\/(?:embed|v|watch)\/(?<id>[\w-]{11})\/?$/u;
const VIMEO_PATH = /^\/(?:video\/)?(?<id>\d+)\/?$/u;
const X_STATUS = /^\/(?<user>\w+)\/status\/(?<id>\d+)\/?$/u;

function youtube(host: string, path: string, query: (name: string) => string | null) {
  const id =
    host === "youtu.be"
      ? path.slice(1)
      : (YOUTUBE_PATH.exec(path)?.groups?.["id"] ?? (path === "/watch" ? query("v") : null));

  return id !== null && YOUTUBE_ID.test(id)
    ? { url: `https://www.youtube.com/watch?v=${id}`, video: true }
    : null;
}

function vimeo(path: string): EmbedLink | null {
  const id = VIMEO_PATH.exec(path)?.groups?.["id"];

  return id === undefined ? null : { url: `https://vimeo.com/${id}`, video: true };
}

function xPost(path: string, query: (name: string) => string | null): EmbedLink | null {
  const status = X_STATUS.exec(path)?.groups;
  const embedded = path === "/embed/Tweet.html" ? query("id") : null;

  if (status?.["user"] !== undefined) {
    return { url: `https://x.com/${status["user"]}/status/${status["id"]}`, video: false };
  }

  return embedded !== null && /^\d+$/u.test(embedded)
    ? { url: `https://x.com/i/status/${embedded}`, video: false }
    : null;
}

export function embedLinkOf(address: string): EmbedLink | null {
  const url = webUrlOf(address);

  if (url === null) return null;

  const host = hostOf(url.href);
  const { pathname, searchParams } = url;
  const query = (name: string): string | null => searchParams.get(name);

  if (YOUTUBE_HOSTS.has(host)) return youtube(host, pathname, query);

  if (VIMEO_HOSTS.has(host)) return vimeo(pathname);

  return X_HOSTS.has(host) || host === "platform.twitter.com" ? xPost(pathname, query) : null;
}
