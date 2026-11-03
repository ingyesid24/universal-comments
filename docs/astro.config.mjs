import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";
import sitemap from "@astrojs/sitemap";

export default defineConfig({
  site: "https://components-comentarios.vercel.app",
  integrations: [sitemap()],
  vite: {
    plugins: [tailwindcss()],
  },
  // Astro 7 elimina los espacios entre texto y enlaces al comprimir el HTML.
  compressHTML: false,
  output: "static",
  outDir: "dist",
});
