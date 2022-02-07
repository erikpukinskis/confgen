import { Configgen } from "./types"

export const vite: Configgen = (presets, args) => ({
  "yarn:dev:vite": "latest",
  ...(presets.includes("devServer")
    ? {
        "script:start:dev": `vite serve ${args.devServer[0]} --config vite.config.js`,
      }
    : undefined),
  ...(presets.includes("library")
    ? {
        "script:build:vite": "vite build",
      }
    : undefined),
})
