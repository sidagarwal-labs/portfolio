export const MAX_REFERENCE_PROBABILITY_ERROR = 0.05;

export type ReferencePrediction = {
  tokens: number;
  vocabSize: number;
  top: readonly { id: number; logit: number }[];
  lse: number;
};

export class InferenceValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InferenceValidationError";
  }
}

export function logSumExp(logits: ArrayLike<number>, temperature: number, skip?: Set<number>) {
  let max = -Infinity;
  for (let id = 0; id < logits.length; id += 1) if (!skip?.has(id)) max = Math.max(max, logits[id] / temperature);
  let total = 0;
  for (let id = 0; id < logits.length; id += 1) if (!skip?.has(id)) total += Math.exp(logits[id] / temperature - max);
  return max + Math.log(total);
}

export function verifyPrediction(logits: ArrayLike<number>, tokens: number, reference: ReferencePrediction) {
  if (!reference.top.length || !Number.isFinite(reference.lse) || reference.top.some(({ id, logit }) => !Number.isInteger(id) || id < 0 || id >= reference.vocabSize || !Number.isFinite(logit))) {
    throw new InferenceValidationError("The reference prediction has an invalid probability or token.");
  }
  if (tokens !== reference.tokens || logits.length !== reference.vocabSize) {
    throw new InferenceValidationError("The model returned an unexpected input or vocabulary size.");
  }
  let topId = 0;
  for (let id = 0; id < logits.length; id += 1) {
    if (!Number.isFinite(logits[id])) throw new InferenceValidationError("The model returned a non-finite score.");
    if (logits[id] > logits[topId]) topId = id;
  }
  if (topId !== reference.top[0].id) {
    throw new InferenceValidationError(`The top token was ${topId}, but the reference model predicted ${reference.top[0].id}.`);
  }
  const lse = logSumExp(logits, 1);
  // MatMulNBits accuracy_level=4 permits backend-specific activation quantization.
  // Require exact top-token agreement and bound probability drift, not bit-identical scores.
  for (const token of reference.top) {
    const difference = Math.abs(Math.exp(logits[token.id] - lse) - Math.exp(token.logit - reference.lse));
    if (difference > MAX_REFERENCE_PROBABILITY_ERROR) {
      throw new InferenceValidationError(`Token ${token.id} differed from its reference probability by ${(difference * 100).toFixed(2)} percentage points.`);
    }
  }
}
