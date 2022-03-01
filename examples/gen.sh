#/bin/bash
cd examples
rm -rf backend-lib/*
echo "----------------------------------------

backend-lib example

----------------------------------------
"
cd backend-lib
echo '{
  "scripts": {
    "confgen": "npx ts-node --transpile-only ../../src/index.ts vite typescript library:BackendLib node:fs apollo:server"
  }
}' > package.json
yarn confgen
yarn all the things!

exit 0
cd ../
rm -rf frontend-lib/*
echo "----------------------------------------

frontend-lib example

----------------------------------------
"
cd frontend-lib
echo '{
  "scripts": {
    "confgen": "npx ts-node --transpile-only ../../src/index.ts vite react library:FrontendLib"
  }
}' > package.json
yarn confgen
yarn all the things!
cd ../
rm -rf frontend-app/*
echo "----------------------------------------

frontend-app example

----------------------------------------
"
cd frontend-app
echo '{
  "scripts": {
    "confgen": "npx ts-node --transpile-only ../../src/index.ts yarn codespaces vite vitest react library:FrontendLib apollo:client"
  }
}' > package.json
yarn confgen
yarn all the things!
