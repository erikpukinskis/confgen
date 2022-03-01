#/bin/bash
cd examples/backend-lib
echo "----------------------------------------

backend-lib example

----------------------------------------
"
yarn confgen
yarn all the things!
cd ../frontend-lib
echo "----------------------------------------

frontend-lib example

----------------------------------------
"
yarn confgen
yarn all the things!
cd ../frontend-app
echo "----------------------------------------

frontend-app example

----------------------------------------
"
yarn confgen
yarn all the things!
