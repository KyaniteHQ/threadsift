const LOOPBACK_HOSTNAMES: ReadonlySet<string> = new Set(["localhost", "127.0.0.1", "[::1]"]);

const AUTHORITY = /^(?<name>\[[0-9a-f:.]+\]|[^\s/?#@[\]:]+)(?::(?<port>\d{1,5}))?$/u;

const MAX_PORT = 65_535;

export interface Sender {
  readonly origin: string | undefined;
  readonly fetchSite: string | undefined;
  readonly urlHost: string;
  readonly headerHost: string | undefined;
}

export interface OriginPolicy {
  readonly publicOrigin: string | null;
  readonly publicHost: string | null;
  readonly defaultPort: string;
}

export function sentByOwnPage(
  { origin, fetchSite, urlHost }: Readonly<Sender>,
  publicOrigin: string | null,
): boolean {
  return (
    fetchSite === "same-origin" &&
    origin !== undefined &&
    (publicOrigin === null || origin === publicOrigin) &&
    URL.canParse(origin) &&
    new URL(origin).host === urlHost
  );
}

function isLoopbackOrigin(origin: string): boolean {
  const url = URL.parse(origin);

  return url !== null && url.origin === origin && LOOPBACK_HOSTNAMES.has(url.hostname);
}

function hostAllowed({ publicHost, defaultPort }: Readonly<OriginPolicy>, host: string): boolean {
  const groups = AUTHORITY.exec(host.toLowerCase())?.groups;

  if (groups === undefined) {
    return false;
  }

  const { name = "", port } = groups;
  const portNumber = port === undefined ? undefined : Number(port);

  if (portNumber !== undefined && (portNumber < 1 || portNumber > MAX_PORT)) {
    return false;
  }

  if (publicHost === null) {
    return LOOPBACK_HOSTNAMES.has(name);
  }

  const bare = portNumber === undefined || String(portNumber) === defaultPort;

  return (bare ? name : `${name}:${String(portNumber)}`) === publicHost;
}

function originAllowed({ publicOrigin }: Readonly<OriginPolicy>, origin: string): boolean {
  return publicOrigin === null ? isLoopbackOrigin(origin) : origin === publicOrigin;
}

export function originPolicyOf(publicOrigin: string | null): OriginPolicy {
  const publicUrl = publicOrigin === null ? null : new URL(publicOrigin);

  return {
    publicOrigin,
    publicHost: publicUrl?.host ?? null,
    defaultPort: publicUrl?.protocol === "https:" ? "443" : "80",
  };
}

export function unlistedPart(
  policy: Readonly<OriginPolicy>,
  { urlHost, headerHost, origin }: Readonly<Sender>,
): "host" | "origin" | null {
  const hosts = [urlHost, headerHost].filter((name) => name !== undefined);

  if (!hosts.every((name) => hostAllowed(policy, name))) return "host";

  return origin !== undefined && !originAllowed(policy, origin) ? "origin" : null;
}
