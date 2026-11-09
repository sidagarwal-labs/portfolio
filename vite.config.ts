import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";

export default defineConfig(({ mode }) => ({
  base: "/",
  plugins: [react()],
  // transformers.js loads ONNX Runtime's WebAssembly from its CDN, so don't emit the unused 27 MB bundled copy.
  resolve: { conditions: ["onnxruntime-web-use-extern-wasm"] },
  define: mode === "test" ? { "import.meta.env.VITE_FINNHUB_KEY": JSON.stringify("playwright-quote-fixture") } : undefined,
  server: {
    proxy: {
      "/api/launches": {
        target: "https://ll.thespacedevs.com",
        changeOrigin: true,
        rewrite: (path: string) => path.replace(/^\/api\/launches/, ""),
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          "react-vendor": ["react", "react-dom", "react-router-dom"]
        }
      }
    }
  }
}));
