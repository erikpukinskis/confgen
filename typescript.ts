import { Configgen } from "./types"

export const typescript: Configgen = (presets) => ({
  "yarn:dev": "typescript",
  ...(presets.includes("library")
    ? {
        "script:build:types":
          "tsc --declaration --emitDeclarationOnly --outDir dist --skipLibCheck",
      }
    : undefined),
  "script:check:types":
    "tsc --noEmit --skipLibCheck; if [ $? -eq 0 ]; then echo 8J+OiSBUeXBlcyBhcmUgZ29vZCEKCg== | base64 -d; fi",
})
