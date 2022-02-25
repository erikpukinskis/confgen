👷 **confgen** is a scaffolding tool in the genre of create-react-app, with a few notable difference:

1. _It's idempotent_, you can keep running it over time as you need to configure new features or reconfigure old ones.

2. It _doesn't set up a working app_. The point is to automate the repetitive an error prone task of getting all the different libraries working together. In other words: it sets up the files you probably won't touch much. The actual code you work on every day you set up yourself.

You can think of confgen as an alternative to the monorepo strategy: It makes it easier to have different repos for different parts of your stack, because it helps keep a lot of the configuration up-to-date.

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

* Vite
* TypeScript
* React
* Apollo
* Codespaces

Although it is still quite useful even if you're just using a subset of those! If you just have an API server written in TypeScript on Vite, it can still do a lot for you.

But if you are trying to coordinate configs across a very different stack than the above, it's probably not going to help much.

## Features

All of these are optional, depending on which presets you choose:

- `api:[folder]` Adds a `start:api` command to start the service in [folder]
- `apollo:client` Generate types for Apollo queries for the browser
- `apollo:server` Generate types for Apollo Server resolvers
- `bin` Adds a "bin" to your package JSON
- `codespaces` sets up some good VSCode defaults, and adds extensions eslint, prettier, etc presets
- `devServer:[folder]` Configures command for starting a dev server. If [folder] is provided, the command will be `start:[folder]`, otherwise it will be `start:dev` by default.
- `eslint` sets up linting with fix-on-save in Codespaces
- `git` Pre-populates gitignore
- `library:[PackageName]:[mode]` Makes your package importable via UMD and ES
- `macros` enables babel macros in Vite
- `node:[fs]:[child_process]:[etc...]` Configures a Codespace to use the Node.js environment and sets up the Node packages needed in Vite
- `prettier` set up code formatting with format-on-save in Codespaces
- `react` ensures React is set up properly with eslint, typescript, etc
- `sql` sets up Vite plugin for importing sql
- `typescript` Adds type checking commands, and sets up exported typings
- `vite` Sets up Vite, with a dev server, library build or both depending on the other presets
- `vitest` Adds test scripts
- `yarn` Creates a yarn.lock file

Note that many of these things support each other, so for example the `eslint` preset will add the `@typescript-eslint` plugin only when combined with the `typescript` preset.

## How to use it

It's recommended to add a `confgen` script to your package.json:

```
{
  "scripts: {
    "confgen": "npx confgen@latest git node yarn vite vitest library:MyPackage prettier"
  }
}
```

Then you can run `yarn run confgen` or `npm run confgen` and the relevant configs will be updated. It's important to add `@latest` so you get the most recent updates each time!

### Extending it

This package is very new, so it's quite likely you'll want to extend it. The easiest way to do that
would be to fork `confgen` and vendor it in your application:

```
mkdir vendor
cd vendor
git clone https://github.com/erikpukinskis/confgen.git
cd confgen
yarn
yarn run build
```

And then add the local version to your dependencies:

```
{
  dependencies: {
    "confgen": "file:./vendor/confgen"
  }
}
```

Then you can go ahead and modify the presets in `vendor/confgen/src/presets` to suit your needs. Or
add an entirely new preset by copying one of the examples in that folder and adding it to
`src/presets/index.ts`.

Then [submit a pull request](https://github.com/erikpukinskis/confgen/pulls)!

## The Future

I'm still not sure whether confgen is a good idea or a horrible idea.

### Won't happen

- **Won't** become a general-purpose automation tool like Puppet. I think the power here is that it just
  helps with common configuration boilerplate. Anything much beyond adding some keys to a JSON file
  is out of scope.
- **Won't** work with anything other than JavaScript. I want the list of presets to stay relatively
  manageable

### Probably will happen

- [x] Collect up the NPM packages to install them all at once (will be a bit faster)
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
    build: {
      lib: {
        entry: `path.resolve(__dirname, "src/index.ts")`,
      },
    },
  },
},
```
- We should probably have some tests!

### Might happen

- Making room for other "ecosystems". E.g. maybe there's a separate Webpack ecosystem preset like:
  `npx cofgen webpack node`.
- While `confgen` doesn't currently bootstrap a working app, it might be close. Maybe in the future running `npx confgen vite react devServer` could fully bootstrap a runnable app.
