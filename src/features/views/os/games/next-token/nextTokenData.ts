import data from "../../../../../content/generated/next-token.json";

export type TokenScore = { id: number; text: string; logit: number };
export type PromptData = (typeof data.prompts)[number];

export const nextTokenData = data;
export const temperatures = data.meta.temperatures;
export const vocabSize = data.meta.vocabSize;

/** Index into the precomputed temperature grid (0.2 to 2.0 in steps of 0.1). */
export const temperatureIndex = (temperature: number) => Math.max(0, temperatures.findIndex((value) => Math.abs(value - temperature) < 1e-6));

/** Exact full-vocabulary probability: p_i(T) = exp(z_i / T - logsumexp(z / T)). */
export const probability = (logit: number, lse: number, temperature: number) => Math.exp(logit / temperature - lse);

/** Screen-reader label for a token, saying the whitespace out loud. */
export function speakToken(text: string) {
  const body = text.trim();
  const words = body ? `"${body}"` : text.includes("\n") ? "newline" : text ? "space" : "empty token";
  return /^ /.test(text) && body ? `${words} with a leading space` : words;
}

export const percent = (value: number) => {
  const pct = value * 100;
  if (pct > 0 && pct < 0.1) return "<0.1%";
  if (pct >= 99.95 && pct < 100) return ">99.9%";
  return `${pct.toFixed(1)}%`;
};

export const megabytes = (bytes: number) => `${(bytes / 1e6).toFixed(bytes < 1e7 ? 1 : 0)} MB`;
