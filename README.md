**confgen** is a scaffolding tool in the genre of create-react-app, with a few notable difference:

1. _It's idempotent_, you are meant to re-run it over and over as you continue building your app.

2. It _doesn't set up a working app_. The point is to automate the repetitive jobs of getting a repo
   set up, not create an entire working app.

## Features
All of these are optional, depending on which presets you choose:

 - `prettier`, `eslint` set up Prettier formatting and Eslint fixing-on-save
 - `bin` Adds a "bin" to your package JSON
 - `library:[PackageName]:[mode]` Makes your package importable via UMD and ES
 - `typescript` Adds type checking commands, and sets up exported typings
 - `devServer` Configures a development server
 - `vitest` Adds test scripts
 - `apollo` Adds code generation build script
 - `yarn` Creates a yarn.lock file
 - `node:[fs]:[child_process]:[etc...]` Configures a Codespace to use the Node.js environment and sets up the Node packages needed in Vite
 - `react` ensures React is set up properly with eslint, typescript, etc
 - `emotion` adds emotion macro config to Vite
 - `bump` helper script for bumping minor version numbers
 - `base` sets ups `.gitignore` and some base VSCode settings
 - `api:[folder]` Adds a `start:api` command to start the service in [folder]

## How to use it

It's recommended to add a `confgen` script to your package.json:

```
{
  "scripts: {
    "confgen": "npx confgen base node yarn vite vitest library:MyPackage prettier"
  }
}
```

Then you can run `yarn run confgen` or `npm run confgen` and the relevant configs will be updated.

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
* **Won't** become a general-purpose automation tool like Puppet. I think the power here is that it just
  helps with common configuration boilerplate. Anything much beyond adding some keys to a JSON file
  is out of scope.
* **Won't** work with anything other than JavaScript. I want the list of presets to stay relatively
  manageable

### Probably will happen
* Collect up the NPM packages to install them all at once (will be a bit faster)
* Right now there are implicit dependencies between presets like `vite` and `devServer`. I think
  these probably should be made explicit, and some error checking should be introduced to prevent
  mistakes.
  * Ex. The existing `vite` preset does many things in the presence of other presets. I think it
    should more accurately be called `vite+node+yarn+emotion+devServer+library`. And if you were
    to run `npx confgen vite node`, it should probably error out and make you get more specific
    about _which_ vite preset you mean. I.e. `npx confgen vite+node node`. That would make the
    dependencies more explicit. And this would open up the possibility of...
* Making room for other "ecosystems". E.g. maybe there's a separate Webpack ecosystem preset like:
  `npx cofgen webpack+node node`
* Adding a `pojo` command. Right now the `vite` preset generates a POJO (Plain Old JavaScript Object)
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
* We should probably have some tests!
* Separate the UMD config from the ESM. Maybe `confgen library:Foo` should just be ESM by default,
  and `confgen library:Foo umd` would add UMD compatibility

### Might happen
* While `confgen` doesn't currently bootstrap a working app, it might be close to being able to do
  that. Running something like `npx confgen react devServer emotion storybook` could set up a working
  repo.
