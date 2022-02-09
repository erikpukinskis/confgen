import { Configgen } from "./types"

export const emotion: Configgen = (presets) => ({
  "yarn:emotion": "latest",
  ...(presets.includes("vite")
    ? { "yarn:dev:vite-plugin-babel-macros": "latest" }
    : undefined),
})
