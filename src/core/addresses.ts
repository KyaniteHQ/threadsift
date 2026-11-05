interface Block {
  readonly bits: number;
  readonly network: bigint;
  readonly length: number;
}

const IPV4_BITS = 32;
const IPV6_BITS = 128;
const GROUP_BITS = 16n;
const GROUPS = 8;
const OCTET = /^\d{1,3}$/u;
const HEX_GROUP = /^[\da-f]{1,4}$/iu;
const DOTTED_TAIL = /(?<quad>\d+\.\d+\.\d+\.\d+)$/u;
const IPV4_LITERAL = /^\d+\.\d+\.\d+\.\d+$/u;

function parseIpv4(text: string): bigint | null {
  const parts = text.split(".");

  if (parts.length !== 4 || !parts.every((part) => OCTET.test(part) && Number(part) <= 255)) {
    return null;
  }

  return parts.reduce((address, part) => (address << 8n) | BigInt(part), 0n);
}

function withHexTail(text: string): string | null {
  const quad = DOTTED_TAIL.exec(text);

  if (quad?.groups?.["quad"] === undefined) {
    return text;
  }

  const address = parseIpv4(quad.groups["quad"]);

  if (address === null) {
    return null;
  }

  return `${text.slice(0, quad.index)}${(address >> GROUP_BITS).toString(16)}:${(address & 0xffffn).toString(16)}`;
}

function parseGroups(text: string): bigint[] | null {
  if (text === "") {
    return [];
  }

  const pieces = text.split(":");

  return pieces.every((piece) => HEX_GROUP.test(piece))
    ? pieces.map((piece) => BigInt(`0x${piece}`))
    : null;
}

function parseIpv6(text: string): bigint | null {
  const hexText = withHexTail(text);
  const [head = "", tail, extra] = (hexText ?? "").split("::");
  const headGroups = parseGroups(head);
  const tailGroups = tail === undefined ? [] : parseGroups(tail);

  if (hexText === null || extra !== undefined || headGroups === null || tailGroups === null) {
    return null;
  }

  const missing = GROUPS - headGroups.length - tailGroups.length;

  if (tail === undefined ? missing !== 0 : missing < 1) {
    return null;
  }

  const groups = [...headGroups, ...Array.from({ length: missing }, () => 0n), ...tailGroups];

  return groups.reduce((address, group) => (address << GROUP_BITS) | group, 0n);
}

function blockOf(cidr: string): Block {
  const [text = "", length = ""] = cidr.split("/");
  const isIpv6 = text.includes(":");
  const network = isIpv6 ? parseIpv6(text) : parseIpv4(text);

  if (network === null) {
    throw new Error(`${cidr} is not an address block`);
  }

  return { bits: isIpv6 ? IPV6_BITS : IPV4_BITS, network, length: Number(length) };
}

function contains(block: Readonly<Block>, address: bigint): boolean {
  const shift = BigInt(block.bits - block.length);

  return address >> shift === block.network >> shift;
}

const NOT_GLOBALLY_REACHABLE_IPV4 = [
  "0.0.0.0/8",
  "10.0.0.0/8",
  "100.64.0.0/10",
  "127.0.0.0/8",
  "169.254.0.0/16",
  "172.16.0.0/12",
  "192.0.0.0/24",
  "192.0.2.0/24",
  "192.88.99.2/32",
  "192.168.0.0/16",
  "198.18.0.0/15",
  "198.51.100.0/24",
  "203.0.113.0/24",
  "224.0.0.0/4",
  "240.0.0.0/4",
].map((cidr) => blockOf(cidr));

const GLOBAL_UNICAST_IPV6 = blockOf("2000::/3");

const NOT_GLOBALLY_REACHABLE_IPV6 = ["2001::/23", "2001:db8::/32", "2002::/16", "3fff::/20"].map(
  (cidr) => blockOf(cidr),
);

const NAT64 = blockOf("64:ff9b::/96");

function embeddedIpv4(address: bigint): bigint | null {
  return contains(NAT64, address) ? address & 0xffff_ffffn : null;
}

function isGlobalIpv4(address: bigint): boolean {
  return !NOT_GLOBALLY_REACHABLE_IPV4.some((block) => contains(block, address));
}

function isGlobalIpv6(address: bigint): boolean {
  const embedded = embeddedIpv4(address);

  if (embedded !== null) {
    return isGlobalIpv4(embedded);
  }

  return (
    contains(GLOBAL_UNICAST_IPV6, address) &&
    !NOT_GLOBALLY_REACHABLE_IPV6.some((block) => contains(block, address))
  );
}

export function isGlobalAddress(address: string): boolean {
  if (address.includes(":")) {
    const parsed = parseIpv6(address);

    return parsed !== null && isGlobalIpv6(parsed);
  }

  const parsed = parseIpv4(address);

  return parsed !== null && isGlobalIpv4(parsed);
}

export function withoutTrailingDot(hostname: string): string {
  return hostname.replace(/\.$/u, "");
}

function isLocalhostName(hostname: string): boolean {
  const name = withoutTrailingDot(hostname.toLowerCase());

  return name === "localhost" || name.endsWith(".localhost");
}

export function isRefusedHost(hostname: string): boolean {
  if (hostname.startsWith("[")) {
    return !isGlobalAddress(hostname.slice(1, -1));
  }

  if (IPV4_LITERAL.test(hostname)) {
    return !isGlobalAddress(hostname);
  }

  return isLocalhostName(hostname);
}

export function resolveUrl(address: string, base?: string): URL | null {
  return URL.canParse(address, base) ? new URL(address, base) : null;
}
