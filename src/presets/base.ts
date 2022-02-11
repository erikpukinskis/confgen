import { CommandGenerator } from "@/types"

export const base: CommandGenerator = () => [
  {
    command: "file",
    path: ".vscode/settings.json",
    contents: {
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
  },
  {
    command: "file",
    path: ".gitignore",
    contents: ["node_modules", ".DS_Store", "dist", "vendor"],
  },
]
