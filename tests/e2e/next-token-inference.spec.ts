import { expect, test } from "@playwright/test";
import { InferenceValidationError, logSumExp, MAX_REFERENCE_PROBABILITY_ERROR, verifyPrediction } from "../../src/features/views/os/games/next-token/inference";

const reference = {
  tokens: 2, vocabSize: 3,
  top: [{ id: 0, logit: Math.log(0.7) }, { id: 1, logit: Math.log(0.2) }, { id: 2, logit: Math.log(0.1) }],
  lse: 0
};
const scores = (probabilities: number[]) => probabilities.map(Math.log);

test("the calculation check accepts a correct distribution and bounded quantized drift", () => {
  expect(() => verifyPrediction(scores([0.7, 0.2, 0.1]), 2, reference)).not.toThrow();
  expect(() => verifyPrediction(scores([0.749, 0.151, 0.1]), 2, reference)).not.toThrow();
  expect(MAX_REFERENCE_PROBABILITY_ERROR).toBe(0.05);
  expect(() => verifyPrediction(scores([0.751, 0.149, 0.1]), 2, reference)).toThrow(InferenceValidationError);
});

test("the calculation check rejects an incorrect top token even at similar confidence", () => {
  expect(() => verifyPrediction(scores([0.2, 0.7, 0.1]), 2, reference)).toThrow(/top token/);
});

test("the calculation check rejects unexpected shapes and non-finite scores", () => {
  expect(() => verifyPrediction(scores([0.7, 0.2, 0.1]), 3, reference)).toThrow(/size/);
  expect(() => verifyPrediction(scores([0.7, 0.3]), 2, reference)).toThrow(/size/);
  for (const invalid of [NaN, Infinity, -Infinity]) {
    expect(() => verifyPrediction([Math.log(0.7), invalid, Math.log(0.1)], 2, reference)).toThrow(/non-finite/);
  }
});

test("full-vocabulary normalization remains stable for large logits and an excluded tail", () => {
  expect(logSumExp([1000, 1000], 1)).toBeCloseTo(1000 + Math.log(2), 10);
  expect(logSumExp(scores([0.7, 0.2, 0.1]), 1)).toBeCloseTo(0, 10);
  expect(Math.exp(logSumExp(scores([0.7, 0.2, 0.1]), 1, new Set([0])))).toBeCloseTo(0.3, 10);
});
