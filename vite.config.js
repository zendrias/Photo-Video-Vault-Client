import { defineConfig } from "vite";
import fs from "fs";
import path from "path";

export default defineConfig({
  server: {
    https: {
      key: fs.readFileSync(path.resolve(__dirname, "frontend-key.pem")),
      cert: fs.readFileSync(path.resolve(__dirname, "frontend.pem")),
    },
    port: 5173,
    proxy: {
      "/api": {
        target: "https://localhost:3443",
        changeOrigin: true,
        secure: false,
      },
    },
  },
});
