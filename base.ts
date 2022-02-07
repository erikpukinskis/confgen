import { Configgen } from "./types"

export const base: Configgen = () => ({
  "file:.vscode/settings.json": {
    "workbench.startupEditor": "none",
    "workbench.colorTheme": "GitHub Dark",
    "workbench.colorCustomizations": {
      "[GitHub Dark]": {
        "tab.inactiveBackground": "#121416",
        "tab.activeBorderTop": "#24292E",
      },
    },
    "editor.tabSize": 2,
    "editor.insertSpaces": true,
    "editor.detectIndentation": false,
  },
  "file:.gitignore": ["node_modules", ".DS_Store", "dist", "vendor"],
})
