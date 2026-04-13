import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";

export default defineConfig(({ command }) => ({
  base: command === "serve" ? "/" : "/portfolio/",
  plugins: [react()],
  server: {
    proxy: {
      "/api/yahoo": {
        target: "https://query1.finance.yahoo.com",
        changeOrigin: true,
        rewrite: (path: string) => path.replace(/^\/api\/yahoo/, ""),
      },
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
          "react-vendor": ["react", "react-dom", "react-router-dom"],
          "three-vendor": ["three", "@react-three/fiber", "@react-three/drei"]
        }
      }
    }
  }
}));
