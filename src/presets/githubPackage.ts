import type { CommandGenerator } from "@/commands"

export const githubPackage: CommandGenerator = (_, args) => {
  const [scope] = args.githubPackage

  if (!scope) {
    throw new Error(
      "githubPackage preset requires a scope, e.g. githubPackage:@my-scope"
    )
  }

  return [
    {
      command: "file",
      path: "package.json",
      contents: {
        publishConfig: {
          [`${scope}:registry`]: "https://npm.pkg.github.com",
        },
      },
    },
    {
      command: "script",
      name: "auth:registry",
      script:
        'if test -f ".npmrc"; then echo "Error: registry auth overwrites .npmrc, delete yours and run this command again"; else echo "@outerframe:registry=https://npm.pkg.github.com\n//npm.pkg.github.com/:_authToken=$NPM_PKG_TOKEN" > .npmrc; fi',
    },
  ]
}
