import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

const rawPort = process.env.PORT || "21662";
const port = Number(rawPort) || 21662;
const basePath = process.env.BASE_PATH || "/";

export default defineConfig({
  base: basePath,
  plugins: [
    react(),
    tailwindcss(),
    runtimeErrorOverlay(),
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer({
              root: path.resolve(import.meta.dirname, ".."),
            }),
          ),
          await import("@replit/vite-plugin-dev-banner").then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
    {
      name: "prevent-browser-cache",
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          const url = req.url || "";
          // Do NOT block caching for pre-bundled dependencies or node_modules
          // otherwise browser fires hundreds of simultaneous requests and causes 504 Gateway Timeout
          if (url.includes("/node_modules/") || url.includes("/.vite") || url.startsWith("/@")) {
            return next();
          }

          const origSetHeader = res.setHeader.bind(res);
          res.setHeader = (name: string, value: any) => {
            if (name.toLowerCase() === "cache-control") {
              return origSetHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
            }
            return origSetHeader(name, value);
          };
          const origWriteHead = res.writeHead.bind(res);
          (res as any).writeHead = (statusCode: number, ...args: any[]) => {
            origSetHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
            origSetHeader("Pragma", "no-cache");
            origSetHeader("Expires", "0");
            return (origWriteHead as any)(statusCode, ...args);
          };
          origSetHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
          origSetHeader("Pragma", "no-cache");
          origSetHeader("Expires", "0");
          next();
        });
      },
    },
  ],
  cacheDir: path.resolve(import.meta.dirname, "node_modules/.vite"),
  optimizeDeps: {
    include: [
      "react",
      "react-dom",
      "@tanstack/react-query",
      "lucide-react",
      "wouter",
      "@radix-ui/react-tooltip",
      "@radix-ui/react-dialog",
      "@radix-ui/react-select",
      "@radix-ui/react-toast",
      "@radix-ui/react-dropdown-menu",
    ],
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@assets": path.resolve(import.meta.dirname, "..", "..", "attached_assets"),
    },
    dedupe: ["react", "react-dom"],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    port,
    strictPort: false,
    host: "0.0.0.0",
    allowedHosts: true,
    headers: {
      "Cache-Control": "no-store",
    },
    fs: {
      strict: true,
    },
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8080",
        changeOrigin: true,
      },
    },
  },
  preview: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
  },
});
