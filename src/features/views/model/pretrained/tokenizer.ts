// SentencePiece-style BPE tokenizer for llama2.c's tokenizer .bin files, following encode/decode in run.c.

export const BOS = 1;
export const EOS = 2;

export interface Tokenizer {
  maxTokenLength: number;
  /** Raw UTF-8 bytes of each vocabulary piece. */
  pieces: Uint8Array[];
  /** Each piece as a byte string (one char per byte) so lookups and merges work on bytes, like run.c. */
  keys: string[];
  scores: Float32Array;
  lookup: Map<string, number>;
}

const utf8Encoder = new TextEncoder();
const utf8Decoder = new TextDecoder();
const byteString = (bytes: ArrayLike<number>) => String.fromCharCode(...Array.from(bytes));
const bytePiece = /^<0x([0-9A-Fa-f]{1,2})/;
const pairCache = new WeakMap<Tokenizer, Map<number, number>>();

/** Id of the piece spelled by pieces `a` + `b`, or -1; memoized because encode() asks for the same pairs on every merge pass. */
function mergeOf(tokenizer: Tokenizer, a: number, b: number): number {
  let cache = pairCache.get(tokenizer);
  if (!cache) pairCache.set(tokenizer, (cache = new Map()));
  const key = a * tokenizer.keys.length + b;
  let id = cache.get(key);
  if (id === undefined) {
    id = tokenizer.lookup.get(tokenizer.keys[a] + tokenizer.keys[b]) ?? -1;
    cache.set(key, id);
  }
  return id;
}

export function parseTokenizer(buffer: ArrayBuffer, vocabSize: number): Tokenizer {
  const view = new DataView(buffer);
  let offset = 0;
  const need = (count: number) => {
    if (offset + count > buffer.byteLength) throw new Error("The tokenizer file is truncated.");
  };
  need(4);
  const maxTokenLength = view.getInt32(0, true);
  offset = 4;
  const pieces: Uint8Array[] = [];
  const keys: string[] = [];
  const scores = new Float32Array(vocabSize);
  const lookup = new Map<string, number>();
  for (let id = 0; id < vocabSize; id += 1) {
    need(8);
    scores[id] = view.getFloat32(offset, true);
    const length = view.getInt32(offset + 4, true);
    offset += 8;
    if (length < 0) throw new Error("The tokenizer file is malformed.");
    need(length);
    const bytes = new Uint8Array(buffer.slice(offset, offset + length));
    offset += length;
    pieces.push(bytes);
    keys.push(byteString(bytes));
    if (!lookup.has(keys[id])) lookup.set(keys[id], id);
  }
  return { maxTokenLength, pieces, keys, scores, lookup };
}

/** Encodes text like run.c: optional BOS, a dummy-prefix space, codepoint lookup with byte fallback (+3), then greedy best-score merges. */
export function encode(tokenizer: Tokenizer, text: string, bos = true, eos = false): number[] {
  const tokens: number[] = [];
  if (bos) tokens.push(BOS);
  const bytes = utf8Encoder.encode(text);
  if (bytes.length > 0) {
    const prefix = tokenizer.lookup.get(" ");
    if (prefix === undefined) throw new Error("The tokenizer has no space piece for the dummy prefix.");
    tokens.push(prefix);
  }

  let codepoint: number[] = [];
  for (let c = 0; c < bytes.length; c += 1) {
    if ((bytes[c] & 0xc0) !== 0x80) codepoint = [];
    codepoint.push(bytes[c]);
    if (c + 1 < bytes.length && (bytes[c + 1] & 0xc0) === 0x80 && codepoint.length < 4) continue;
    const id = tokenizer.lookup.get(byteString(codepoint));
    if (id !== undefined) tokens.push(id);
    else for (const byte of codepoint) tokens.push(byte + 3);
    codepoint = [];
  }

  for (;;) {
    let bestScore = -1e10;
    let bestId = -1;
    let bestIndex = -1;
    for (let i = 0; i < tokens.length - 1; i += 1) {
      const id = mergeOf(tokenizer, tokens[i], tokens[i + 1]);
      if (id !== -1 && tokenizer.scores[id] > bestScore) {
        bestScore = tokenizer.scores[id];
        bestId = id;
        bestIndex = i;
      }
    }
    if (bestIndex === -1) break;
    tokens.splice(bestIndex, 2, bestId);
  }

  if (eos) tokens.push(EOS);
  return tokens;
}

/** Bytes run.c prints for `token` after `prevToken`: strips the leading space after BOS and maps <0xXX> pieces to raw bytes. */
export function decodePiece(tokenizer: Tokenizer, prevToken: number, token: number): Uint8Array {
  let piece = tokenizer.pieces[token];
  if (!piece) throw new RangeError(`Token ${token} is outside the vocabulary.`);
  if (prevToken === BOS && piece[0] === 0x20) piece = piece.subarray(1);
  const byte = bytePiece.exec(byteString(piece));
  return byte ? Uint8Array.of(parseInt(byte[1], 16)) : piece;
}

/** Decodes a token sequence to text, skipping BOS/EOS markers. */
export function decode(tokenizer: Tokenizer, tokens: readonly number[]): string {
  const chunks: Uint8Array[] = [];
  let prev = -1;
  for (const token of tokens) {
    if (token !== BOS && token !== EOS) chunks.push(decodePiece(tokenizer, prev, token));
    prev = token;
  }
  const bytes = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.length, 0));
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return utf8Decoder.decode(bytes);
}

/** Human-readable piece for display, with a visible ␣ for spaces and names for special and byte tokens. */
export function pieceLabel(tokenizer: Tokenizer, token: number): string {
  if (token === BOS) return "BOS";
  if (token === EOS) return "EOS";
  const key = tokenizer.keys[token] ?? "";
  const byte = /^<0x([0-9A-Fa-f]{2})>$/.exec(key);
  if (byte) {
    const value = parseInt(byte[1], 16);
    return value === 0x0a ? "↵" : value === 0x09 ? "⇥" : value === 0x20 ? "␣" : key;
  }
  return utf8Decoder.decode(tokenizer.pieces[token]).replace(/ /g, "␣").replace(/\n/g, "↵");
}
