import { createModel, epochLimit, measureLoss, modelDimension, trainEpoch, type Dataset, type Measurement, type ModelRequest, type ModelResponse, type TinyModel } from "./tinyModel";

let texts: string[] = [];
let model: TinyModel;
let data: Dataset;
let measurements: Measurement[] = [];
let goal = 0;
let running = false;
let generation = 0;
const send = (message: ModelResponse) => self.postMessage(message);
const snapshot = () => send({
  type: "snapshot", running,
  snapshot: { model, measurements, trainSize: data.train.length, validationSize: data.validation.length, parameters: model.vocabulary.length * (modelDimension * 2 + 1) }
});
const measure = (epoch: number) => ({
  epoch, loss: measureLoss(model, data.train), validationLoss: measureLoss(model, data.validation), tokens: epoch * data.train.length
});

function reset() {
  generation += 1;
  ({ model, data } = createModel(texts));
  goal = 0;
  running = false;
  measurements = [measure(0)];
  snapshot();
}

async function train() {
  if (running) return;
  const currentGeneration = generation;
  running = true;
  snapshot();
  try {
    while (measurements.length - 1 < goal && currentGeneration === generation) {
      trainEpoch(model, data.train);
      measurements.push(measure(measurements.length));
      snapshot();
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
    if (currentGeneration === generation) {
      running = false;
      snapshot();
    }
  } catch (error) {
    running = false;
    goal = measurements.length - 1;
    send({ type: "error", message: error instanceof Error ? error.message : "Tiny model training failed." });
  }
}

self.onmessage = (event: MessageEvent<ModelRequest>) => {
  try {
    const request = event.data;
    if (request.type === "init") { texts = request.texts; reset(); }
    else if (request.type === "reset") reset();
    else if (request.type === "pause") goal = measurements.length - 1;
    else if (request.type === "train") {
      goal = Math.min(epochLimit, measurements.length - 1 + request.epochs);
      void train();
    }
  } catch (error) {
    send({ type: "error", message: error instanceof Error ? error.message : "Tiny model could not initialize." });
  }
};
