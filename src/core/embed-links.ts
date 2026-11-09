export interface EmbedLink {
  readonly url: string;
  readonly video: boolean;
}

const YOUTUBE_HOSTS: ReadonlySet<string> = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "youtube-nocookie.com",
  "www.youtube-nocookie.com",
]);

const X_HOSTS: ReadonlySet<string> = new Set([
  "x.com",
  "www.x.com",
  "twitter.com",
  "www.twitter.com",
  "mobile.twitter.com",
]);

const YOUTUBE_ID = /^[\w-]{11}$/u;
const YOUTUBE_PATH = /^\/(?:embed|v|watch)\/(?<id>[\w-]{11})\/?$/u;
const VIMEO_PATH = /^\/(?:video\/)?(?<id>\d+)\/?$/u;
const X_STATUS = /^\/(?<user>\w+)\/status\/(?<id>\d+)\/?$/u;

function youtube(hostname: string, path: string, query: (name: string) => string | null) {
  const id =
    hostname === "youtu.be"
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
  const url = URL.parse(address);

  if (url === null || (url.protocol !== "https:" && url.protocol !== "http:")) return null;

  const { hostname, pathname, searchParams } = url;
  const query = (name: string): string | null => searchParams.get(name);

  if (YOUTUBE_HOSTS.has(hostname) || hostname === "youtu.be") {
    return youtube(hostname, pathname, query);
  }

  if (hostname === "player.vimeo.com" || hostname === "vimeo.com") return vimeo(pathname);

  return X_HOSTS.has(hostname) || hostname === "platform.twitter.com"
    ? xPost(pathname, query)
    : null;
}
