export const MODEL_CACHE_NAME = "transformers-cache";

export type CachedModel = {
  model: string;
  revision: string;
  files: readonly { path: string }[];
};

export async function hasCachedModel({ model, revision, files }: CachedModel): Promise<boolean> {
  if (typeof caches === "undefined") throw new Error("This browser does not support saved model files.");
  if (!await caches.has(MODEL_CACHE_NAME)) return false;
  const cache = await caches.open(MODEL_CACHE_NAME);
  const base = `https://huggingface.co/${model}/resolve/${encodeURIComponent(revision)}/`;
  // Inspect cached responses without reading the 120 MB of weights into the UI thread.
  const available = await Promise.all(files.map(async ({ path }) => (await cache.match(base + path))?.ok === true));
  return available.every(Boolean);
}
