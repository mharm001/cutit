import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // For GitHub Pages: set base to your repo name, e.g. "/cutit/"
  // For local dev or Vercel/Netlify: leave as "/"
  base: "/cutit/",
});
