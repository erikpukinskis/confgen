import { CommandGenerator } from "@/types"

export const bump: CommandGenerator = () => [
  {
    command: "file",
    path: "bump.sh",
    contents: `#/bin/bash
git reset
git add package.json
git commit -m "v\`npm version minor\`"
npx json -f package.json -I -e "delete this.devDependencies"
npm publish --access public
git checkout -- package.json
git push
`,
  },
  {
    command: "run",
    script: "chmod a+x ./bump.sh",
  },
  {
    command: "script",
    "name": "bump",
    "script": "./bump.sh",
  },
]
