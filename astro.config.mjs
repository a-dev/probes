// @ts-check
import { defineConfig, fontProviders } from "astro/config";

import react from "@astrojs/react";
import process from "node:process";

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
    {
      provider: fontProviders.google(),
      name: "Atkinson Hyperlegible Next",
      cssVariable: "--font-atkinson",
      weights: ["200 800"],
      styles: ["normal"],
    },
    {
      provider: fontProviders.google(),
      name: "Atkinson Hyperlegible Mono",
      cssVariable: "--font-atkinson-mono",
      weights: ["200 800"],
      styles: ["normal"],
    },
  ],

  integrations: [react()],
});
