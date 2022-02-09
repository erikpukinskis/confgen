import { Configgen } from "./types"

export const bump: Configgen = () => ({
  "executable:bump.sh": `
    #/bin/bash
    git reset
    git add package.json
    git commit -m "v\`npm version minor\`"
    npx json -f package.json -I -e "delete this.devDependencies"
    npm publish --access public
    git checkout -- package.json
    git push
  `,
  "script:bump": "./bump.sh",
})
