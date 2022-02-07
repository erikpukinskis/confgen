import { Configgen } from "./types"

export const yarn: Configgen = () => ({
  "rm": "package-lock.json",
  "run": "rm -rf node_modules; yarn",
})
