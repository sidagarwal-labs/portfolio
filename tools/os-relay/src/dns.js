/* Just enough of the DNS wire format (RFC 1035) for the relay's DNS-over-HTTPS endpoint: one question in, A records out. */

export const RCODE = Object.freeze({ NOERROR: 0, FORMERR: 1, SERVFAIL: 2, NXDOMAIN: 3, NOTIMP: 4, REFUSED: 5 });
export const TYPE = Object.freeze({ A: 1, AAAA: 28 });
const CLASS_IN = 1;

export class DnsFormatError extends Error {}

/* Parses a standard query with exactly one question. Compression pointers aren't valid in a question, so they are refused. */
export function parseQuery(message) {
  const bytes = Buffer.isBuffer(message) ? message : Buffer.from(message);
  if (bytes.length < 12 || bytes.length > 4096) throw new DnsFormatError("message size");
  const id = bytes.readUInt16BE(0);
  const flags = bytes.readUInt16BE(2);
  if (flags & 0x8000) throw new DnsFormatError("not a query");
  if ((flags >> 11) & 0xf) throw new DnsFormatError("unsupported opcode");
  if (bytes.readUInt16BE(4) !== 1) throw new DnsFormatError("expected one question");

  const labels = [];
  let offset = 12;
  let nameLength = 0;
  for (;;) {
    if (offset >= bytes.length) throw new DnsFormatError("truncated name");
    const length = bytes[offset++];
    if (length === 0) break;
    if (length & 0xc0) throw new DnsFormatError("compressed or extended label");
    if (offset + length > bytes.length) throw new DnsFormatError("truncated label");
    nameLength += length + 1;
    if (nameLength > 255) throw new DnsFormatError("name too long");
    labels.push(bytes.toString("latin1", offset, offset + length));
    offset += length;
  }
  if (offset + 4 > bytes.length) throw new DnsFormatError("truncated question");
  const type = bytes.readUInt16BE(offset);
  const klass = bytes.readUInt16BE(offset + 2);
  offset += 4;
  return {
    id,
    recursionDesired: Boolean(flags & 0x0100),
    name: labels.join("."),
    type,
    class: klass,
    question: bytes.subarray(12, offset)
  };
}

/* Builds a response to a parsed query. Answers are IPv4 addresses; the owner name points back at the question. */
export function buildResponse(query, { rcode = RCODE.NOERROR, addresses = [], ttl = 60 } = {}) {
  const answers = query.type === TYPE.A && query.class === CLASS_IN && rcode === RCODE.NOERROR ? addresses : [];
  const out = Buffer.alloc(12 + query.question.length + answers.length * 16);
  out.writeUInt16BE(query.id, 0);
  out.writeUInt16BE(0x8000 | (query.recursionDesired ? 0x0100 : 0) | 0x0080 | (rcode & 0xf), 2);
  out.writeUInt16BE(1, 4);
  out.writeUInt16BE(answers.length, 6);
  query.question.copy(out, 12);
  let offset = 12 + query.question.length;
  for (const address of answers) {
    out.writeUInt16BE(0xc00c, offset);
    out.writeUInt16BE(TYPE.A, offset + 2);
    out.writeUInt16BE(CLASS_IN, offset + 4);
    out.writeUInt32BE(ttl, offset + 6);
    out.writeUInt16BE(4, offset + 10);
    address.split(".").forEach((octet, index) => (out[offset + 12 + index] = Number(octet)));
    offset += 16;
  }
  return out;
}

/* Builds a query; used by tests and by the measurement script. */
export function buildQuery(name, type = TYPE.A, id = 0x1234) {
  const labels = name.split(".").filter(Boolean).map((label) => Buffer.from(label, "latin1"));
  const question = Buffer.alloc(labels.reduce((sum, label) => sum + label.length + 1, 0) + 5);
  let offset = 0;
  for (const label of labels) {
    question[offset++] = label.length;
    label.copy(question, offset);
    offset += label.length;
  }
  question[offset++] = 0;
  question.writeUInt16BE(type, offset);
  question.writeUInt16BE(CLASS_IN, offset + 2);
  const header = Buffer.alloc(12);
  header.writeUInt16BE(id, 0);
  header.writeUInt16BE(0x0100, 2);
  header.writeUInt16BE(1, 4);
  return Buffer.concat([header, question]);
}

/* Reads the header and A records of a response; used by tests. */
export function parseResponse(message) {
  const bytes = Buffer.from(message);
  const flags = bytes.readUInt16BE(2);
  const answerCount = bytes.readUInt16BE(6);
  let offset = 12;
  while (bytes[offset] !== 0) offset += bytes[offset] + 1;
  offset += 5;
  const addresses = [];
  for (let i = 0; i < answerCount; i++) {
    const type = bytes.readUInt16BE(offset + 2);
    const ttl = bytes.readUInt32BE(offset + 6);
    const length = bytes.readUInt16BE(offset + 10);
    if (type === TYPE.A) addresses.push({ address: [...bytes.subarray(offset + 12, offset + 16)].join("."), ttl });
    offset += 12 + length;
  }
  return { id: bytes.readUInt16BE(0), rcode: flags & 0xf, addresses };
}
