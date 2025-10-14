// vite.config.js
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  define: {
    // Prevent "process is not defined" in browser-only builds
    "process.env": {},
  },
  build: {
    lib: {
      entry: "web-component.jsx",
      name: "GrubmasterWC",
      formats: ["iife"], // one browser-ready <script> file
      fileName: () => "grubmaster-app.js",
    },
    rollupOptions: {
      // Bundle everything (including React) so Wix only needs this one file
      external: [],
    },
    cssCodeSplit: false, // keep CSS with the JS (we inject into the shadow)
  },
});
