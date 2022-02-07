import { Configgen } from "./types"

export const node: Configgen = () => ({
  "file:.devContainer/Dockerfile": `
      ARG VARIANT="16-bullseye"
      FROM mcr.microsoft.com/vscode/devcontainers/javascript-node:0-\${VARIANT}
    `,
  "file:.devcontainer/devcontainer.json": {
    "name": "Node.js",
    "build": {
      "dockerfile": "Dockerfile",
      "args": {
        "VARIANT": "16-bullseye",
      },
    },
    "remoteUser": "node",
  },
  "file:.vscode/extensions.json": {
    "unwantedRecommendations": ["ms-azuretools.vscode-docker"],
  },
})
