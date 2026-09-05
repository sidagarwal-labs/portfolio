import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";

export default defineConfig(({ command, isPreview, mode }) => ({
  base: command === "serve" && !isPreview ? "/" : "/portfolio/",
  plugins: [react()],
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
