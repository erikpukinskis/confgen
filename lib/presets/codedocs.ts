import {
  readJson,
  type CommandGenerator,
  type CommandWithArgs,
} from "@/commands"

export const generator: CommandGenerator = ({ system }) => {
  const { name } = readJson<{ name: string }>("package.json", system)

  const commands: CommandWithArgs[] = [
    {
      command: "file",
      path: ".github/workflows/publish-docs.yml",
      merge: "replace",
      contents: getWorkflow(name),
    },
  ]

  if (name !== "codedocs") {
    commands.push({
      command: "yarn",
      pkg: "codedocs",
      dev: true,
    })
  }

  return commands
}

const getWorkflow = (packageName: string): Record<string, unknown> => ({
  name: "Docs",
  on: "push",
  permissions: {
    "contents": "read",
    "pages": "write",
    "id-token": "write",
  },
  concurrency: {
    "group": "pages",
    "cancel-in-progress": true,
  },
  jobs: {
    docs: {
      "environment": {
        name: "github-pages",
        url: "${{ steps.deployment.outputs.page_url }}",
      },
      "runs-on": "ubuntu-latest",
      "steps": [
        {
          name: "Checkout",
          uses: "actions/checkout@v3",
        },
        {
          name: "Configure pages",
          uses: "actions/configure-pages@v2",
        },
        {
          name: "Install",
          run: "yarn install",
        },
        // In the very special case of Codedocs itself, the docs reference
        // the current version of the lib in the current branch, so we
        // need to build that before building the site. Most apps will
        // just import { ... } from "codedocs" so they don't need this
        // step:
        ...(packageName === "codedocs"
          ? [
              {
                name: "Build Codedocs",
                run: "yarn build",
              },
            ]
          : []),
        {
          name: "Build site",
          run: "yarn build:docs",
        },
        {
          name: "Upload artifact",
          if: "github.ref == 'refs/heads/main'",
          uses: "actions/upload-pages-artifact@v1",
          with: {
            path: "site",
          },
        },
        {
          name: "Deploy pages",
          if: "github.ref == 'refs/heads/main'",
          id: "deployment",
          uses: "actions/deploy-pages@v1",
        },
      ],
    },
  },
})
