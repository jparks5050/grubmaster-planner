// vite.config.js
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    lib: {
      entry: "web-component.jsx",     // <— the wrapper we just created
      name: "GrubmasterWC",
      formats: ["iife"],             // Browser-friendly single <script> file
      fileName: () => "grubmaster-app.js",
    },
    rollupOptions: {
      // We want one self-contained file: React should be bundled
      external: [],
    },
    // Optional but helpful when hosting under a subpath:
    // assetsInlineLimit: 0,
  },
});

