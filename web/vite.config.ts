/// <reference types="vitest/config" />
import { fileURLToPath, URL } from "node:url";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "prompt",
      injectRegister: false,
      includeAssets: ["favicon.svg", "apple-touch-icon.png"],
      manifest: {
        name: "Food Tracker AI",
        short_name: "Food Tracker",
        description: "Snap your plate. Know your food.",
        theme_color: "#C2410C",
        background_color: "#FBF7F0",
        display: "standalone",
        start_url: "/app",
        scope: "/",
        icons: [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
          {
            src: "/icons/icon-maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        // Cache the app shell only. API calls always go to the network.
        globPatterns: ["**/*.{js,css,html,svg,png,webp,woff2}"],
        // App routes fall back to the SPA shell; "/" is the prerendered landing page.
        navigateFallback: "/app.html",
        navigateFallbackDenylist: [/^\/__\//],
      },
    }),
  ],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  server: { port: 5173, strictPort: true },
  build: {
    target: "es2022",
    sourcemap: true,
    rollupOptions: {
      output: {
        // Function form: only these packages go in each chunk (the object form also pulls in
        // their shared dependencies, which made the entry wait for the charts chunk).
        manualChunks(id) {
          // Rollup's shared CommonJS helper must live with the always-loaded React chunk.
          if (id.includes("commonjsHelpers")) return "react";
          if (!id.includes("node_modules")) return undefined;
          // Small helpers used everywhere (recharts uses clsx too) belong to the core chunk.
          if (/[\\/]node_modules[\\/]\.pnpm[\\/](clsx|tailwind-merge)@/.test(id)) return "react";
          if (
            /[\\/]node_modules[\\/]\.pnpm[\\/](recharts|d3-|victory-vendor|@reduxjs|redux|react-redux|immer|reselect|decimal\.js)/.test(
              id,
            )
          )
            return "charts";
          if (/@firebase[\\/+]storage|firebase[\\/]storage/.test(id)) return "firebase-storage";
          if (
            /[\\/]node_modules[\\/]\.pnpm[\\/](@firebase\+(app|auth|component|util|logger)|firebase@)/.test(
              id,
            )
          )
            return "firebase";
          if (/[\\/]node_modules[\\/]\.pnpm[\\/](react|react-dom|react-router|scheduler)@/.test(id))
            return "react";
          return undefined;
        },
      },
    },
  },
  test: {
    environment: "jsdom",
    globals: false,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    css: false,
  },
});
