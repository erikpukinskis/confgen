👷 **confgen** is a scaffolding tool in the genre of create-react-app, with a few notable difference:

1. _It's idempotent_, you can keep running it over time as you need to configure new features or reconfigure old ones.

2. It _doesn't set up a working app_. The point is to automate the repetitive an error prone task of getting all the different libraries working together. In other words: it sets up the files you probably won't touch much. The actual code you work on every day you set up yourself.

You can think of confgen as an alternative to the monorepo strategy: It makes it easier to have different repos for different parts of your stack, because it helps keep a lot of the configuration up-to-date.

## Manual

```
confgen <runtimes> <presets>

Examples:
  confgen @app @server @package dist:app:package codegen:app:queries react vitest
  confgen @lib @app @package dist:lib react vitest
  confgen @lib @package @docs dist:lib codegen:lib:schema:resolvers vitest

Options:
  <runtimes>    Space separated selection of "runtimes" i.e. folders with code meant to be
                run in a specific environment:

                  @lib — code is called via a library interface (either in Node or the browser)
                  @app — code that boots in an HTML context in the browser
                  @server — code that boots in Node
                  @package — code that consumes the build (e.g. dist tests)
                  @docs — same as app, but reserved for your documentation site

                These folders (lib/, app/, etc) are the ONLY folders which may be used
                for source code.

  <presets>     Space-separated presets defining which features to be configured. Presets
                may be tied to a specific folder or folders, using the @ symbol, and may
                have a number of colon-separated arguments

                Examples:
                  prettier
                  dist:app:lib
                  codegen:lib:schema:resolvers

                Available presets:
                  bin                         Adds a "bin" to your package JSON
                  codedocs                    Deploy a documentation site to Github Pages
                  codegen:resolvers           Generate types for Apollo Server resolvers
                  codegen:schema              Compiles a GraphQL schema to TypeScript so it it can
                                              be exported from a library
                  codegen:operations          Compiles a typed gql function for all of your Apollo
                                              Client queries and mutations
                  codespaces                  Sets up some good VSCode defaults, and adds
                                              extensions eslint, prettier, etc presets
                  dist[:runtime1][:runtime2]  Generate importable files for selected runtimes
                                              importable from dist/
                  eslint                      Sets up linting with fix-on-save in codespaces
                  git                         Pre-populates gitignore
                  githubActions               Add workflows for testing, linting, publishing, etc
                  githubPackage               Use Github to publish and install packages
                  macros                      Enables babel macros in Vite
                  node[:fs][:path][etc...]    Configures codespace to use the Node.js environment
                                              and sets up the Node packages needed inVite
                  prettier                    Code formatting with format-on-save in codespace
                  react                       Enable React in eslint, typescript, etc
                  sql                         Sets up Vite plugin for importing sql
                  start                       Adds command to start a server
                  typescript:[tsconfig path]  Do stuff in TypeScript, check types, etc
                  vite                        Use Vite for dev server and builds
                  vitest                      Configures test scripts
                  yarn                        Creates a yarn.lock file

  --silent      Suppress logging during normal operation**
```

## Example

Let's say you have a **design system** package, and an **application** package, both of which use React and TypeScript. And let's say you want to enable Eslint. And your team is editing these apps in VScode.

There's a bunch of gotchas associated with that:

1. Your `tsconfig.json` needs to have the `"dom"` lib, otherwise you'll get type errors when trying to reference `document` and other browser globals.
2. You also need to set the `jsx` flag to `"react"` for your TSX files to pass type check.
3. The `@typescript-eslint` plugin needs to be enabled in your `.eslintrc`.
4. And for that to work, the `@typescript-eslint/eslint-plugin` and `@typescript-eslint/parser` NPM packages need to be installed.
5. `source.fixAll.eslint` needs to be added to your `editor.codeActionsOnSave` in the `.vscode/settings.json` file.
6. And for that to work, you need a `.devcontainer` set up with the `dbaeumer.vscode-eslint` extension installed.
7. You probably also want commands to run the linter, autofix, check the types, etc in your `package.json`.

I could go on, but there's a lot to coordinate!

And those are just the common pieces of configuration that you're going to share between your design system and your application.

Let's say you're using Vite to build the **design system** as an NPM package. You'll need a command to generate typings, make sure they're named properly in your `dist/` folder, make sure everything is being exported properly in your `package.json`. Etc, etc.

All of this is the kind of work that **confgen** does for you.

## Who this is _not_ for

Right now, confgen only works with a fairly opinionated set of tools. If you want to use Webpack or Angular, you're out of luck. This tool is really geared towards people who are using:

- Vite
- TypeScript
- React
- Apollo
- Codespaces

Although it is still quite useful even if you're just using a subset of those! If you just have an API server written in TypeScript on Vite, it can still do a lot for you.

But if you are trying to coordinate configs across a very different stack than the above, it's probably not going to help much.

## How to use it

It's recommended to add a `confgen` script to your package.json:

```
{
  "scripts: {
    "confgen": "npx confgen@latest codespaces git vite vitest typescript library:VoiceChat prettier eslint"
  }
}
```

Then you can run `yarn confgen` or `npm run confgen` and the relevant configs will be updated. It's important to add `@latest` so you get the most recent updates each time!

### Typical confgens

A Node library (with code generation and tests):

```
confgen @lib @package dist:lib codegen:lib:schema:resolvers vitest
```

A browser library (with a dev server, tests, and docs):

```
confgen @lib @app @package @docs dist:lib react vitest
```

An application (with a dev server, an exported app wrapper, and tests):

```
confgen @app @server @package dist:app:package codegen:app:queries react vitest
```

### Running the scripts

Depending on which presets you choose, lots of package.json scripts will be available:

- `yarn build` runs all of the build sub-commands:
  - `yarn build:generate` generates GraphQL code
  - `yarn build:vite` packages the app into `dist/`
  - `yarn build:types` generates typgins in `dist/`
- `yarn start:server` starts an API server if you have one
- `yarn start:app:dev` starts the dev server
- `yarn start:docs:dev` starts the documentation site
- `yarn fix` runs all of the fix sub-commands:
  - `yarn fix:lint` fixes all of the Eslint errors that can be auto-fixed
  - `yarn fix:format` runs Prettier
- `yarn check:types` looks for type errors
- `yarn check:lint` looks for lint errors
- `yarn test` runs the tests
  - `yarn test:watch` runs them in watch mode
  - `yarn test -t presets/codegen`, `yarn test -t @dist`, etc runs a single test file (top level `describe`)

...and last but not least,

- `yarn all the things!` runs all of the build, fix, check, and test scripts. Good for pre-publish.

If you want an easy way to publish a new version of your NPM package, check out my other package, [bump-n-pub](https://www.npmjs.com/package/bump-n-pub). My typical workflow for publishing a package is:

```
yarn confgen
yarn all the things!
npx bump-n-pub minor
```

### Extending it

This package is very new, so it's quite likely you'll want to extend it. The easiest way to do that
would be to fork `confgen` and vendor it in your application:

```
mkdir vendor
cd vendor
git clone https://github.com/erikpukinskis/confgen.git
cd confgen
yarn
yarn build
```

And then add the local version to your dependencies:

```
{
  dependencies: {
    "confgen": "file:./vendor/confgen"
  }
}
```

Then you can go ahead and modify the presets in `vendor/confgen/lib/presets` to suit your needs. Or
add an entirely new preset by copying one of the scripts in that folder and adding it to
`lib/presets/index.ts`.

Then [submit a pull request](https://github.com/erikpukinskis/confgen/pulls)!

## Running tests

Run the tests:

```
yarn test
```

In watch mode:

```
yarn test:watch
```

Just one test suite:

```
yarn test -t presets/library
```

Just one test:

```
yarn test -t "should not clobber existing build commands"
```

## Foundational Principles

- **Support single purpose repos** — This is the bottom line goal of Confgen. It is not meant to work in a monorepo. Although repos often need secondary modes of running—dev server, documentation server, dist tests, etc—Confgen presumes that each repo has a single primary purpose. It will not configure two substantial bodies of code in a single repo. See Issue #1.

- **Don't clobber the configs** — Confgen is meant to handle basic configuration of common tools. However some amount of additional configuration will always be needed. In order to get out of peoples' way, we try to leave existing configuration files intact as much as possible.

- **Don't config the configs** — Confgen does not provide any API for fine-tuning your configs. The parameters are just a list of presets with minimal per-preset flags. If a config file needs fine-tuned, the associated presets can simply be omitted, and you can configure it yourself. Confgen is not meant to be a universal "configuration configuration" language. See Issue #2.

- **Convention over configuration** — Like Rails, Confgen supports composing together many different pieces of functionality from a vast catalog of presets. In order for this to be a tractable problem, we rely on strict conventions for folder structure, the location of configuration files, etc. It will never support arbitrary module structures.

## The Future

I'm still not sure whether confgen is a good idea or a horrible idea.

### Won't happen

- **Won't** become a general-purpose automation tool like Puppet. I think the power here is that it just
  helps with common configuration boilerplate. Anything much beyond adding some keys to a JSON file
  is out of scope.
- **Won't** work with anything other than JavaScript. I want the list of presets to stay relatively
  manageable

### Might happen

- [x] Need to be more specific about these devServer/library folders. I don't want to open confgen up to a multi-package kind of situation, but currently we do technically support multiple packages, you could have any combo of: src, devServer, and api folders
- Adding an init command that lets you check off which presets you want
- Adding a system notification when commands have finished
- PM2 preset
- Making room for other "ecosystems". E.g. maybe there's a separate Webpack ecosystem preset like:
  `npx confgen webpack node`.
- While `confgen` doesn't currently bootstrap a working app, it might be close. Maybe in the future running `npx confgen vite react devServer` could fully bootstrap a runnable app.
- Adding a `pojo` command. Right now the `vite` preset generates a POJO (Plain Old JavaScript Object)
  by concatenating top level blocks of JavaScript, like `{ server: { hmr: { port: 443 } } }`. This
  seems to be working for now. But it means that, unlike with JSON files, you can'd add your own
  config alongside that. The `vite` preset has to generate `vite.config.js` entirely. It would be
  better long term if that object could be merged with the existing JavaScript, so you could have
  commands like:

```js
{
  command: 'pojo',
  path: 'vite.config.js',
  start: 'export default defineConfig(',
  content: {
    test: {
      environment: `"jsdom"`,
    },
    build: {
      lib: {
        entry: `path.resolve(__dirname, "lib/index.ts")`,
      },
    },
  },
},
```

### Probably will happen

- [x] Collect up the NPM packages to install them all at once (will be a bit faster)
- [x] Add a mega `yarn all the things` that does the whole build, linting, formatting, type checking, and test which is nice to do before a deploy
- [x] We should probably have some tests!
- [x] ~Use https://www.npmjs.com/package/@rollup/plugin-typescript or https://github.com/ezolenko/rollup-plugin-typescript2 instead of tsc to generate types. Right now, tsc is just generating a .d.ts for every ts file, and these have path aliases and stuff in them that don't work after build. Maybe the rollup plugin will be smarter?~ Edit: Turns out the simplest way to do this is just use [tsc-alias](https://www.npmjs.com/package/tsc-alias). All that other stuff is insanely complex (ttypescript seems like a real hack).
- [x] Add Apollo Client query type generation
- [x] Add `else exit 1;` to the celebrations
- [x] Lint should not fail on an empty project
- [x] Add githubPkg:scope preset
- [x] Don't add a project, and don't put \*.js in ignorePatterns unless in TypeScript mode
- [x] Add launch.json for vitest debugging
- [x] Allow global options to come before builds
- [x] Consider removing @typescript-eslint/no-misused-promises override in react code
- [x] Automatically add parserOptions.project: tsconfig.json when using the react preset
- [x] Add an easy way to do preset arg validation
- [x] Don't add a demo test file if there already is a .test.ts file
- [x] Don't add react demo test file if react preset isn't used
- [x] Turn post-confgen prettier on again
- [x] Don't bump packages every time you run confgen
- [x] Maybe don't allow extra random commands in `yarn build`. Just start over each confgen?
- [x] Allow yarn commands to specify a version range
- [x] Use the path as the version when confgen is linked
- [x] Rename "builds" to "runtimes"?
- [x] Improve the logging of command args
- [x] Required packages should understand peerDependencies, and maybe we only move dev->non-dev, we don't move non-dev->dev
- [x] Add @docs runtime
- [x] Runs without a package.json
- [x] Add eslint-plugin-simple-import-sort
- [x] Use `"import/no-duplicates": ["error"]` instead of `"no-duplicate-imports": "off"` in TypeScript mode
- [ ] Do import type { foo } from 'bar' in most places since eslint does that when it autofixes
- [x] Sort scripts
- [x] Remove and ban .. in import paths
- [x] Include graphql.vscode-graphql extension when... well we don't have an apollo preset anymore, so just when we include codegen?
- [x] Add `"@typescript-eslint/no-floating-promises": ["error"]`
- [x] See if pnpm can speed up tests
- [x] Use ~ instead of @
- [x] If no confgen command is present, add one
- [x] start:docs:dev runs in zeroconfig scenario
- [x] check:lint and check:types run in zeroconfig scenario
- [x] yarn:test runs in zeroconfig scenario
- [x] Account for peerDependencies that are already in the package.json
- [x] Don't add packages if they're already peerDependencies
- [x] Add githubActions preset
- [ ] Don't require a React import in JSX/TSX files in dist:lib projects
- [ ] Get react-headless-accessible-hooks working with a fresh confgen

Higher priority:

- [x] Add dotenv preset
- [ ] Add GraphQL Codegen Watch task
- [x] Add TypeScript Watch task
- [ ] Use .ts for GraphQL codegen
- [ ] Update args on Debug Current Test File
- [ ] node-version: "18"?
- [ ] "@typescript-eslint/no-explicit-any": should not have an array around ["error"]
- [ ] source.fixAll.eslint and source.formatDocument should be "explicit" not true
- [ ] Support dist:server for building servers to be put into Docker images
- [ ] Generate an entrypoint when you add the @server runtime
- [ ] Before build:generate do `mkdir -p lib/gql`
- [ ] Add `"*": ["lib/*"],` to tsconfig so .d.ts files work
- [ ] Add `"packageManager": "^yarn@1.22.19"` to package.json
- [ ] Add `noUncheckedIndexedAccess`
- [ ] Go through this thread: https://twitter.com/mattpocockuk/status/1694102744594858129
- [ ] Add eslint-plugin-import-order-autofix (instead of eslint-plugin-import?)
- [ ] Add https://www.npmjs.com/package/eslint-plugin-unused-imports
- [ ] Add noUncheckedIndexedAccess: true
- [ ] Max out at @testing-library/react 12
- [ ] Add yarn3 preset
  - [ ] remove `yarn &&` from build
  - [ ] `yarn dlx @yarnpkg/sdks vscode`
  - [ ] Recommend `arcanis.vscode-zipfs` extension in codespaces
- [ ] No `rollupOptions` if empty
- [ ] Replace `rm -rf dist/*` with `rm -rf dist`
- [ ] Don't include @vitejs/plugin-react in vite.config unless using it
- [ ] Use && instead of if statement in NPM scripts
- [ ] Remove @vitejs/plugin-react because it's dragging @babel/core into everything
- [ ] Don't replace "workbench.colorTheme" or workbench.colorCustomizations if they are already customized.
- [ ] Consider switching to "After Dark No Italics" by default.
- [ ] Add wildcard externals like /firebase\/.+/
- [ ] Remove output.globals? When is it needed?
- [ ] Figure out how to throw a file path on the end of `yarn test`
- [ ] Don't use any groups when on main
- [ ] Figure out why index.test.ts got semicolons on initial confgen
- [ ] Add "Watch for TypeScript problems" task
- [ ] No bad peer dependencies!!!
- [ ] Add Codedocs preset to this repo
- [ ] Add pnpm preset
- [ ] Do ts build in rollup
- [ ] Don't think we need `environment: "jsdom"` in vite.docs.config.js?
- [ ] Remove .eslintignore?
- [ ] Add https://www.npmjs.com/package/validate-peer-dependencies as a preinstall hook
- [ ] Use https://github.com/lukeed/resolve.exports (or however Vite exposes to use it?) to add package.json exports

Later:

- [ ] Use a JSON parser that can handle comments in .vscode/ files
- [ ] Add vite/client to tsconfig? https://vitejs.dev/guide/features.html#client-types
- [ ] Add ability to specify for "file" command to overwrite array instead of merging it
- [ ] Figure out why outerframe/application installs eslint-plugin-react@7.28.0 every time?
- [ ] Rename `check` to `validate` so we can have a `yarn validate` command
- [ ] Make the build artifacts adhere to some kind of naming scheme (app.html, server.js, etc)
- [ ] Try to run yarn in offline mode in tests
- [ ] Generate typical Ambic repos from a single confgen command
- [ ] Add start:package preset
- [ ] See if we can stop babel being installed
- [ ] @bin could be a runtime if we want to have a start command and also export a start function
- [ ] Figure out why useRef<HTMLElement>() doesn't cause a tserror
- [ ] Add watch:build command
- [ ] Add watch:generate, and watch commands
- [ ] Use https://github.com/dudykr/stc for type checking?
- [ ] Confgen with git preset does git init if needed
- [ ] Sort .eslintrc? .ignore files?
- [ ] Figure out why exhaustive-deps, jsx-key, etc isn't working
- [ ] Add eslint-plugin-react-hooks
- [ ] Add eslint-plugin-jsx-a11y?
- [ ] Add axe in unit tests? or docs?

---
