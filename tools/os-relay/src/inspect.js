/* Checks what the guest sends before it reaches the destination: the Host header (and absolute request URLs) on plain
   HTTP, and the server name (SNI) in a TLS ClientHello. A connection to an allow-listed address is only useful for the
   allow-listed site, so a guest can't reach other sites that share a CDN address. Payloads are inspected in memory and
   never logged. */

import { normalizeHostname } from "./policy.js";

const MAX_CLIENT_HELLO = 16 * 1024;
const MAX_LINE = 8 * 1024;

function readSni(body) {
  let p = 0;
  const need = (n) => {
    if (p + n > body.length) throw new Error("truncated ClientHello");
  };
  need(34);
  p += 34;
  need(1);
  p += 1 + body[p];
  need(2);
  p += 2 + body.readUInt16BE(p);
  need(1);
  p += 1 + body[p];
  if (p === body.length) return null;
  need(2);
  const end = p + 2 + body.readUInt16BE(p);
  p += 2;
  if (end > body.length) throw new Error("truncated extensions");
  while (p + 4 <= end) {
    const type = body.readUInt16BE(p);
    const length = body.readUInt16BE(p + 2);
    p += 4;
    if (p + length > end) throw new Error("truncated extension");
    if (type === 0) {
      let q = p + 2;
      const listEnd = Math.min(p + length, q + body.readUInt16BE(p));
      while (q + 3 <= listEnd) {
        const nameType = body[q];
        const nameLength = body.readUInt16BE(q + 1);
        q += 3;
        if (q + nameLength > listEnd) throw new Error("truncated server name");
        if (nameType === 0) return body.toString("latin1", q, q + nameLength);
        q += nameLength;
      }
      return null;
    }
    p += length;
  }
  return null;
}

/* Returns { done: false } while more bytes are needed, { done: true, sni } once the ClientHello is complete, or
   { error } when the bytes aren't a TLS ClientHello. The ClientHello may span several records. */
export function parseClientHello(buffer) {
  if (buffer.length > 0 && buffer[0] !== 0x16) return { error: "not a TLS handshake" };
  const parts = [];
  let offset = 0;
  while (offset + 5 <= buffer.length) {
    if (buffer[offset] !== 0x16 || buffer[offset + 1] !== 0x03) return { error: "not a TLS handshake record" };
    const length = buffer.readUInt16BE(offset + 3);
    if (length === 0 || length > 16384) return { error: "bad TLS record length" };
    if (offset + 5 + length > buffer.length) break;
    parts.push(buffer.subarray(offset + 5, offset + 5 + length));
    offset += 5 + length;
    const handshake = Buffer.concat(parts);
    if (handshake.length < 4) continue;
    if (handshake[0] !== 0x01) return { error: "first handshake message is not a ClientHello" };
    const messageLength = handshake.readUIntBE(1, 3);
    if (messageLength > MAX_CLIENT_HELLO) return { error: "ClientHello too large" };
    if (handshake.length < 4 + messageLength) continue;
    try {
      return { done: true, sni: readSni(handshake.subarray(4, 4 + messageLength)) };
    } catch (error) {
      return { error: error.message };
    }
  }
  if (buffer.length > MAX_CLIENT_HELLO + 1024) return { error: "ClientHello too large" };
  return { done: false };
}

function tlsInspector(allowHost) {
  let pending = [];
  let passthrough = false;
  return (chunk) => {
    if (passthrough) return { forward: chunk };
    pending.push(chunk);
    const all = Buffer.concat(pending);
    const result = parseClientHello(all);
    if (result.error) return { deny: result.error };
    if (!result.done) return { forward: null };
    if (result.sni === null) return { deny: "TLS without a server name (SNI)" };
    const host = normalizeHostname(result.sni);
    if (!host) return { deny: "TLS server name is not a host name" };
    if (!allowHost(host)) return { deny: "TLS server name is not allowed for this address", host };
    passthrough = true;
    pending = [];
    return { forward: all, host };
  };
}

function hostFromHeader(value) {
  if (value.startsWith("[")) return null;
  const match = /^([^:]*)(?::(\d{1,5}))?$/.exec(value);
  return match ? normalizeHostname(match[1]) : null;
}

function hostFromUrl(target) {
  try {
    return normalizeHostname(new URL(target).hostname);
  } catch {
    return null;
  }
}

const REQUEST_LINE = /^([A-Z]+) (\S+) HTTP\/\d(?:\.\d)?$/;
const HEADER = /^([!#$%&'*+.^_`|~0-9A-Za-z-]+)[ \t]*:[ \t]*(.*?)[ \t]*$/;

/* Scans every line the guest sends, so a second request on a kept-alive connection is checked too. Lines in a request
   body that look like Host headers are checked as well; a false match closes the connection, which fails safe. */
function httpInspector(allowHost) {
  let carry = "";
  let started = false;
  let inHead = false;
  let headHasHost = false;
  let firstHost;
  return (chunk) => {
    if (!started && carry === "" && chunk.length && !/[A-Z\r\n]/.test(String.fromCharCode(chunk[0]))) {
      return { deny: "not an HTTP request" };
    }
    const lines = (carry + chunk.toString("latin1")).split("\n");
    carry = lines.pop();
    if (carry.length > MAX_LINE) return { deny: "line too long" };
    for (const raw of lines) {
      const line = raw.endsWith("\r") ? raw.slice(0, -1) : raw;
      const request = REQUEST_LINE.exec(line);
      if (request) {
        const [, method, target] = request;
        if (inHead) return { deny: "malformed request" };
        if (method === "CONNECT" || method === "PRI") return { deny: `${method} requests are not allowed` };
        if (/^[a-z][a-z0-9+.-]*:\/\//i.test(target)) {
          const host = hostFromUrl(target);
          if (!host) return { deny: "request URL has an invalid host" };
          if (!allowHost(host)) return { deny: "request URL host is not allowed for this address", host };
        }
        started = inHead = true;
        headHasHost = false;
        continue;
      }
      if (!started) {
        if (line === "") continue;
        return { deny: "not an HTTP request" };
      }
      if (inHead && /^[ \t]/.test(line)) return { deny: "folded header lines are not allowed" };
      const header = HEADER.exec(line);
      if (header) {
        const name = header[1].toLowerCase();
        if (name === "host") {
          const host = hostFromHeader(header[2]);
          if (!host) return { deny: "invalid Host header" };
          if (!allowHost(host)) return { deny: "Host header is not allowed for this address", host };
          if (inHead && headHasHost) return { deny: "duplicate Host header" };
          headHasHost = true;
          firstHost ??= host;
        } else if (name === "upgrade") {
          return { deny: "protocol upgrades are not allowed" };
        }
        continue;
      }
      if (line === "" && inHead) {
        if (!headHasHost) return { deny: "request without a Host header" };
        inHead = false;
      }
    }
    return { forward: chunk, host: firstHost };
  };
}

/* Returns a function that takes each chunk the guest sends and answers { forward } (bytes to send now, possibly null
   while a TLS ClientHello is incomplete) or { deny } with a reason. */
export function createInspector({ tls, allowHost }) {
  return tls ? tlsInspector(allowHost) : httpInspector(allowHost);
}
