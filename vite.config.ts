import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "./",
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": `${import.meta.dirname}/src`,
      "cytoscape-fcose": `${import.meta.dirname}/node_modules/cytoscape-fcose/cytoscape-fcose.js`,
    },
  },
  clearScreen: false,
});
