import { Configgen } from "./types"

export const api: Configgen = (presets, args) => ({
  ...(presets.includes("vite")
    ? {
        "yarn": "vite-node",
        "script:start:api": `vite-node ${args.api[0]}`,
      }
    : undefined),
})
