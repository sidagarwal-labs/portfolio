// Next-token selection from logits, following the sampler in llama2.c's run.c (without top-p).

export interface TokenProbability {
  id: number;
  probability: number;
}

/** Softmax of logits / temperature; temperature must be positive (use argmax for temperature 0). */
export function softmaxWithTemperature(logits: ArrayLike<number>, temperature = 1): Float64Array {
  if (!(temperature > 0)) throw new RangeError("Temperature must be positive; use argmax for greedy decoding.");
  const probabilities = new Float64Array(logits.length);
  let max = -Infinity;
  for (let i = 0; i < logits.length; i += 1) max = Math.max(max, logits[i] / temperature);
  let sum = 0;
  for (let i = 0; i < logits.length; i += 1) {
    probabilities[i] = Math.exp(logits[i] / temperature - max);
    sum += probabilities[i];
  }
  for (let i = 0; i < probabilities.length; i += 1) probabilities[i] /= sum;
  return probabilities;
}

/** Index of the largest value; ties go to the lowest index, as in run.c's sample_argmax. */
export function argmax(values: ArrayLike<number>): number {
  let best = 0;
  for (let i = 1; i < values.length; i += 1) if (values[i] > values[best]) best = i;
  return best;
}

/** Inverse-CDF draw for a coin in [0, 1), as in run.c's sample_mult. */
export function sampleFromProbabilities(probabilities: ArrayLike<number>, coin: number): number {
  let cdf = 0;
  for (let i = 0; i < probabilities.length; i += 1) {
    cdf += probabilities[i];
    if (coin < cdf) return i;
  }
  return probabilities.length - 1;
}

/** Greedy argmax at temperature 0, otherwise a draw from softmax(logits / temperature). */
export function sampleToken(logits: ArrayLike<number>, temperature: number, random: () => number = Math.random): number {
  return temperature === 0 ? argmax(logits) : sampleFromProbabilities(softmaxWithTemperature(logits, temperature), random());
}

export function topTokens(probabilities: ArrayLike<number>, count: number): TokenProbability[] {
  return Array.from(probabilities, (probability, id) => ({ id, probability }))
    .sort((a, b) => b.probability - a.probability || a.id - b.id)
    .slice(0, count);
}
