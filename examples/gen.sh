#/bin/bash
cd examples
# rm -rf backend-lib/*
# echo "----------------------------------------

# backend-lib example

# ----------------------------------------
# "
# cd backend-lib
# echo '{
#   "scripts": {
#     "confgen": "npx ts-node --transpile-only ../../src/index.ts vite typescript library:BackendLib node:fs codegen:resolvers:schema eslint prettier"
#   }
# }' > package.json
# yarn confgen
# yarn all the things!

# cd ../
# rm -rf frontend-lib/*
# echo "----------------------------------------

# frontend-lib example

# ----------------------------------------
# "
# cd frontend-lib
# echo '{
#   "scripts": {
#     "confgen": "npx ts-node --transpile-only ../../src/index.ts vite react macros typescript:tsconfig.build.json library:FrontendLib:development react devServer:docs eslint prettier"
#   }
# }' > package.json
# yarn confgen
# yarn all the things!
# cd ../
rm -rf frontend-app/*
echo "----------------------------------------

frontend-app example

----------------------------------------
"
cd frontend-app
echo '{
  "scripts": {
    "confgen": "npx ts-node --transpile-only ../../src/index.ts yarn codespaces typescript vite vitest react codegen:operations api:server eslint prettier"
  }
}' > package.json
yarn confgen
yarn all the things!
