/* Destination policy: which hosts, ports, and addresses the relay may connect to. Nothing here touches the network. */

export const DEFAULT_ALLOWED_HOSTS = Object.freeze([
  "example.com",
  "frogfind.com",
  "68k.news",
  "agarwal-labs.com",
  "www.agarwal-labs.com"
]);
export const DEFAULT_ALLOWED_PORTS = Object.freeze([80, 443]);

/* IPv4 ranges the relay never connects to, from the IANA special-purpose address registry plus multicast and reserved
   space. Cloud metadata services live inside these: 169.254.169.254 (AWS, Azure, Google Cloud), 100.100.100.200
   (Alibaba), and 192.0.0.192 (Oracle). */
const BLOCKED_IPV4 = [
  ["0.0.0.0/8", "this network"],
  ["10.0.0.0/8", "private"],
  ["100.64.0.0/10", "shared address space"],
  ["127.0.0.0/8", "loopback"],
  ["169.254.0.0/16", "link-local"],
  ["172.16.0.0/12", "private"],
  ["192.0.0.0/24", "IETF protocol assignments"],
  ["192.0.2.0/24", "documentation"],
  ["192.88.99.0/24", "6to4 relay"],
  ["192.168.0.0/16", "private"],
  ["198.18.0.0/15", "benchmarking"],
  ["198.51.100.0/24", "documentation"],
  ["203.0.113.0/24", "documentation"],
  ["224.0.0.0/4", "multicast"],
  ["240.0.0.0/4", "reserved"]
];

const OCTET = "(25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)";
const IPV4 = new RegExp(`^${OCTET}(\\.${OCTET}){3}$`);

/* Strict dotted-decimal only: no leading zeros, octal, hex, or shortened forms, which some resolvers read differently. */
export function parseIpv4(text) {
  if (typeof text !== "string" || !IPV4.test(text)) return null;
  return text.split(".").reduce((value, octet) => value * 256 + Number(octet), 0);
}

export function parseCidr(cidr) {
  const [address, bits, extra] = String(cidr).split("/");
  const base = parseIpv4(address);
  const prefix = Number(bits);
  if (extra !== undefined || base === null || !/^\d{1,2}$/.test(bits ?? "") || prefix > 32) throw new Error(`Invalid IPv4 range: ${cidr}`);
  const size = 2 ** (32 - prefix);
  const start = base - (base % size);
  return { start, end: start + size - 1 };
}

const builtInRanges = BLOCKED_IPV4.map(([cidr, reason]) => ({ ...parseCidr(cidr), reason }));

/* Returns null for a public IPv4 address, or why the relay must not connect to it. The relay only speaks IPv4: v86's
   WISP client sends IPv4 addresses, and the relay's DNS only answers A queries. */
export function blockedAddressReason(address, extraBlocked = []) {
  if (typeof address === "string" && address.includes(":")) return "IPv6 is not supported";
  const value = parseIpv4(address);
  if (value === null) return "not an IPv4 address";
  for (const range of builtInRanges) if (value >= range.start && value <= range.end) return `${range.reason} address`;
  for (const range of extraBlocked.map(parseCidr)) if (value >= range.start && value <= range.end) return "blocked by configuration";
  return null;
}

const LABEL = /^(?!-)[a-z0-9-]{1,63}(?<!-)$/;

/* Lowercases a DNS name and drops one trailing dot. Returns null unless it is a plain LDH host name with at least two
   labels; IP literals are not host names. */
export function normalizeHostname(name) {
  if (typeof name !== "string") return null;
  let host = name.trim().toLowerCase();
  if (host.endsWith(".")) host = host.slice(0, -1);
  if (!host || host.length > 253) return null;
  const labels = host.split(".");
  if (labels.length < 2 || !labels.every((label) => LABEL.test(label))) return null;
  if (/^\d+$/.test(labels.at(-1))) return null;
  return host;
}

/* Entries are exact host names ("example.com") or "*." wildcards, which match subdomains but not the name itself. */
export function createAllowList(entries) {
  const exact = new Set();
  const suffixes = [];
  for (const entry of entries) {
    const wildcard = typeof entry === "string" && entry.startsWith("*.");
    const host = normalizeHostname(wildcard ? entry.slice(2) : entry);
    if (!host) throw new Error(`Invalid allow-list entry: ${JSON.stringify(entry)}`);
    if (wildcard) suffixes.push(`.${host}`);
    else exact.add(host);
  }
  return {
    entries: [...exact, ...suffixes.map((suffix) => `*${suffix}`)],
    allows(name) {
      const host = normalizeHostname(name);
      if (!host) return false;
      return exact.has(host) || suffixes.some((suffix) => host.endsWith(suffix));
    }
  };
}

export function isAllowedPort(port, allowedPorts) {
  return Number.isInteger(port) && allowedPorts.includes(port);
}

/* Remembers which allow-listed names the relay's own DNS answered with which addresses. A guest can only connect to an
   address it learned from the relay, which ties "the guest looked up example.com" to "the guest connects to
   104.20.23.154", and stops DNS rebinding because the relay never pins a blocked address. */
export class PinTable {
  constructor({ maxEntries = 4096, now = () => Date.now() } = {}) {
    this.maxEntries = maxEntries;
    this.now = now;
    this.byAddress = new Map();
  }

  pin(host, addresses, ttlMs) {
    const expires = this.now() + ttlMs;
    for (const address of addresses) {
      let hosts = this.byAddress.get(address);
      if (!hosts) {
        if (this.byAddress.size >= this.maxEntries) this.prune();
        if (this.byAddress.size >= this.maxEntries) this.byAddress.delete(this.byAddress.keys().next().value);
        hosts = new Map();
        this.byAddress.set(address, hosts);
      }
      hosts.set(host, expires);
    }
  }

  hostsFor(address) {
    const hosts = this.byAddress.get(address);
    if (!hosts) return new Set();
    const now = this.now();
    const live = new Set();
    for (const [host, expires] of hosts) {
      if (expires > now) live.add(host);
      else hosts.delete(host);
    }
    if (!hosts.size) this.byAddress.delete(address);
    return live;
  }

  prune() {
    for (const address of [...this.byAddress.keys()]) this.hostsFor(address);
  }

  get size() {
    return this.byAddress.size;
  }
}
