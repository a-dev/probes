// @ts-check
import { defineConfig, fontProviders } from "astro/config";

const githubPagesBase = "/probes";
const githubPagesSite = `https://a-dev.github.io${githubPagesBase}`;

export default defineConfig({
  base: process.env.GITHUB_PAGES === "true" ? githubPagesBase : "/",
  output: "static",
  site: githubPagesSite,
  fonts: [
    {
      provider: fontProviders.google(),
      name: "DynaPuff",
      cssVariable: "--font-dyna",
      weights: ["400 700"],
      styles: ["normal"],
    },
  ],
});
