import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("@evefrontier/dapp-kit")) {
            return "eve_runtime";
          }
          if (
            id.includes("@mysten/dapp-kit-react") ||
            id.includes("@mysten/sui/")
          ) {
            return "sui_runtime";
          }
          if (id.includes("@tanstack/react-query")) {
            return "query_runtime";
          }
          return undefined;
        },
      },
    },
  },
  resolve: {
    dedupe: [
      "@mysten/dapp-kit-react",
      "@mysten/dapp-kit-core",
      "react",
      "react-dom",
    ],
  },
});
