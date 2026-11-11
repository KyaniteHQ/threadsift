const TOPIC_PATH = /^\/topics\/([^/]+)\/?$/u;

const DOTS_ONLY = /^~*\.+$/u;

const ESCAPED_DOTS = /^~+\.+$/u;

export function topicSegment(key: string): string {
  return DOTS_ONLY.test(key) ? `~${key}` : key;
}

export function topicKeyOfSegment(segment: string): string {
  return ESCAPED_DOTS.test(segment) ? segment.slice(1) : segment;
}

export function topicApiPath(key: string): string {
  return `/api/topics/${encodeURIComponent(topicSegment(key))}`;
}

export function topicPath(key: string): string {
  return `/topics/${encodeURIComponent(topicSegment(key)).replaceAll(".", "%2E")}`;
}

export function topicKeyOf(pathname: string): string | null {
  const [, encoded] = TOPIC_PATH.exec(pathname) ?? [];

  if (encoded === undefined) return null;

  try {
    return topicKeyOfSegment(decodeURIComponent(encoded));
  } catch {
    return null;
  }
}
