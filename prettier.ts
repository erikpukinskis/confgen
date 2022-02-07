import { Configgen } from "./types"

export const prettier: Configgen = () => ({
  "yarn:dev": "prettier",
  "file:.vscode/settings.json": {
    "editor.codeActionsOnSave": {
      "source.formatDocument": true,
    },
    "editor.formatOnSave": false,
    "editor.defaultFormatter": "esbenp.prettier-vscode",
  },
  "file:.prettierrc": {
    "semi": false,
    "tabWidth": 2,
    "quoteProps": "preserve",
  },
  "script:fix:format": "prettier --write .",
  "file:.devcontainer/devcontainer.json": {
    "extensions": ["rohit-gohri.format-code-action", "esbenp.prettier-vscode"],
  },
})
