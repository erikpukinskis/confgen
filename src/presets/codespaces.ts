import { CommandGenerator } from "@/types"

export const codespaces: CommandGenerator = () => [
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
    path: ".devcontainer/devcontainer.json",
    contents: {
      extensions: ["erikpukinskis.chrome-codespaces-keymap"],
    },
  },
]
