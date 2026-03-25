import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";

export default defineConfig({
  plugins: [react()],
  resolve: {
    dedupe: [
      "@mysten/dapp-kit-react",
      "@mysten/dapp-kit-core",
      "react",
      "react-dom",
    ],
  },
});
