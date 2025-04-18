import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
  // Base public path
  base: "./",

  // Build options
  build: {
    outDir: "dist",
    emptyOutDir: true,
    chunkSizeWarningLimit: 800, // Increase chunk size warning limit
    // Output files
    rollupOptions: {
      input: resolve(__dirname, "index.html"),
      output: {
        // chunk files
        manualChunks: {
          vendor: [
            "codemirror",
            "xterm",
            "xterm-addon-fit",
            "html2canvas",
            "@fortawesome/fontawesome-free",
          ],
          editor: ["./ts/editor.ts", "./ts/themes.ts"],
          handlers: ["./ts/handlers.ts", "./ts/websocket.ts"],
          ui: ["./ts/layout.ts", "./ts/selector.ts", "./ts/shortcuts.ts"],
        },
      },
    },
  },
  // Resolve assets from node_modules
  resolve: {
    alias: {
      "@": resolve(__dirname, "./"),
    },
  },
});
