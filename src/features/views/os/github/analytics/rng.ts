/** Seeded PRNG (mulberry32): fast, 32-bit state, uniform floats in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type Rng = () => number;

/** Integer in [0, n). */
export function randInt(rand: Rng, n: number): number {
  return Math.min(n - 1, Math.floor(rand() * n));
}

/** Fisher–Yates shuffle (in place). */
export function shuffle<T>(items: T[], rand: Rng): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = randInt(rand, i + 1);
    const tmp = items[i];
    items[i] = items[j];
    items[j] = tmp;
  }
  return items;
}

/** Standard normal via Box–Muller. */
export function randomNormal(rand: Rng): number {
  const u = Math.max(rand(), 1e-12);
  const v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Poisson sample: Knuth for small rates, rounded normal approximation for large ones. */
export function samplePoisson(rand: Rng, lambda: number): number {
  if (!(lambda > 0)) return 0;
  if (lambda > 30) return Math.max(0, Math.round(lambda + Math.sqrt(lambda) * randomNormal(rand)));
  const limit = Math.exp(-lambda);
  let k = 0;
  let p = rand();
  while (p > limit) {
    k++;
    p *= rand();
  }
  return k;
}
