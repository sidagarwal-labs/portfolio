/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_FINNHUB_KEY: string;
  /** GitHub insights proxy origin, e.g. https://api.agarwal-labs.com (optional). */
  readonly VITE_GITHUB_PROXY_URL?: string;
  /** Overrides the feedback form's API origin (tests and local development); defaults to VITE_GITHUB_PROXY_URL. */
  readonly VITE_FEEDBACK_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module "*.pdf?url" {
  const src: string;
  export default src;
}
