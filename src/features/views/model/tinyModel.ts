export const modelDimension = 12;
export const contextLength = 12;
export const epochLimit = 24;
export const learningRate = 0.12;

export type TinyModel = { vocabulary: string[]; embeddings: number[][]; output: number[][]; bias: number[]; seed: number };
export type Example = { context: number[]; target: number };
export type Dataset = { train: Example[]; validation: Example[] };
export type Measurement = { epoch: number; loss: number; validationLoss: number; tokens: number };
export type ModelSnapshot = { model: TinyModel; measurements: Measurement[]; trainSize: number; validationSize: number; parameters: number };
export type ModelRequest = { type: "init"; texts: string[] } | { type: "train"; epochs: number } | { type: "pause" | "reset" };
export type ModelResponse = { type: "snapshot"; snapshot: ModelSnapshot; running: boolean } | { type: "error"; message: string };

export const tokenizeModel = (text: string) => text.toLowerCase().match(/[a-z0-9]+|&/g) ?? [];
export function probabilities(logits: number[]) {
  const max = Math.max(...logits);
  const values = logits.map((value) => Math.exp(value - max));
  const sum = values.reduce((total, value) => total + value, 0);
  return values.map((value) => value / sum);
}
const dot = (a: number[], b: number[]) => a.reduce((sum, value, index) => sum + value * b[index], 0);
function random(model: { seed: number }) {
  model.seed = (Math.imul(model.seed, 1664525) + 1013904223) >>> 0;
  return model.seed / 4294967296;
}

export function createModel(texts: string[]): { model: TinyModel; data: Dataset } {
  if (texts.length < 5) throw new Error("The tiny model needs at least five documents for a held-out split.");
  const documents = texts.map(tokenizeModel);
  const counts = new Map<string, number>();
  documents.flat().forEach((word) => counts.set(word, (counts.get(word) ?? 0) + 1));
  const vocabulary = ["<bos>", "<unk>", "<eos>", ...Array.from(counts.keys()).sort((a, b) => (counts.get(b)! - counts.get(a)!) || a.localeCompare(b)).slice(0, 253)];
  const model: TinyModel = { vocabulary, embeddings: [], output: [], bias: vocabulary.map(() => 0), seed: 2642 };
  const matrix = () => vocabulary.map(() => Array.from({ length: modelDimension }, () => (random(model) - 0.5) * 0.4));
  model.embeddings = matrix();
  model.output = matrix();
  const data: Dataset = { train: [], validation: [] };
  documents.forEach((words, index) => {
    const ids = [0, ...words.map((word) => tokenId(model, word)), 2];
    for (let position = 1; position < ids.length; position += 1) {
      (index % 5 === 4 ? data.validation : data.train).push({
        context: ids.slice(Math.max(0, position - contextLength), position), target: ids[position]
      });
    }
  });
  if (!data.train.length || !data.validation.length) throw new Error("Training and validation splits must both contain tokens.");
  return { model, data };
}

export function tokenId(model: TinyModel, word: string) {
  const id = model.vocabulary.indexOf(word.toLowerCase());
  return id === -1 ? 1 : id;
}

function attend(model: TinyModel, ids: number[]) {
  if (!ids.length) throw new Error("Attention needs at least one context token.");
  const vectors = ids.map((id, position) => model.embeddings[id].map((value, dimension) =>
    value + 0.1 * Math.sin((position + 1) / 100 ** (dimension / modelDimension))
  ));
  const query = vectors[vectors.length - 1];
  const weights = probabilities(vectors.map((vector) => dot(query, vector) / Math.sqrt(modelDimension)));
  const hidden = query.map((value, dimension) => value + vectors.reduce((sum, vector, index) => sum + weights[index] * vector[dimension], 0));
  return { vectors, query, weights, hidden };
}

export function attentionRows(model: TinyModel, words: string[]) {
  const ids = words.map((word) => tokenId(model, word));
  return ids.map((_, row) => attend(model, ids.slice(0, row + 1)).weights);
}

export function predict(model: TinyModel, context: number[]) {
  const state = attend(model, context.slice(-contextLength));
  const distribution = probabilities(model.output.map((vector, id) => dot(state.hidden, vector) + model.bias[id]));
  return { ...state, distribution };
}

function trainExample(model: TinyModel, example: Example) {
  const { vectors, query, weights, hidden, distribution } = predict(model, example.context);
  const delta = [...distribution];
  delta[example.target] -= 1;
  const hiddenGradient = Array.from({ length: modelDimension }, (_, dimension) =>
    delta.reduce((sum, value, id) => sum + value * model.output[id][dimension], 0)
  );
  const attentionGradient = vectors.map((vector) => dot(hiddenGradient, vector));
  const average = dot(weights, attentionGradient);
  const scoreGradient = weights.map((weight, index) => weight * (attentionGradient[index] - average));
  const queryGradient = hiddenGradient.map((value, dimension) =>
    value + vectors.reduce((sum, vector, index) => sum + scoreGradient[index] * vector[dimension] / Math.sqrt(modelDimension), 0)
  );
  const embeddingGradient = new Map<number, number[]>();
  example.context.forEach((id, index) => {
    const gradient = embeddingGradient.get(id) ?? Array(modelDimension).fill(0);
    for (let dimension = 0; dimension < modelDimension; dimension += 1) {
      gradient[dimension] += weights[index] * hiddenGradient[dimension] + scoreGradient[index] * query[dimension] / Math.sqrt(modelDimension);
      if (index === example.context.length - 1) gradient[dimension] += queryGradient[dimension];
    }
    embeddingGradient.set(id, gradient);
  });
  const update = (weight: number, gradient: number) => weight - learningRate * Math.max(-2, Math.min(2, gradient));
  model.output.forEach((vector, id) => {
    vector.forEach((weight, dimension) => { vector[dimension] = update(weight, delta[id] * hidden[dimension]); });
    model.bias[id] = update(model.bias[id], delta[id]);
  });
  embeddingGradient.forEach((gradient, id) => gradient.forEach((value, dimension) => {
    model.embeddings[id][dimension] = update(model.embeddings[id][dimension], value);
  }));
}

export function trainEpoch(model: TinyModel, examples: Example[]) {
  const order = examples.map((_, index) => index);
  for (let index = order.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random(model) * (index + 1));
    [order[index], order[other]] = [order[other], order[index]];
  }
  order.forEach((index) => trainExample(model, examples[index]));
}

export function measureLoss(model: TinyModel, examples: Example[]) {
  if (!examples.length) throw new Error("Loss needs a non-empty evaluation set.");
  const loss = examples.reduce((sum, example) => sum - Math.log(Math.max(1e-12, predict(model, example.context).distribution[example.target])), 0) / examples.length;
  if (!Number.isFinite(loss)) throw new Error("The tiny model produced a non-finite loss.");
  return loss;
}
