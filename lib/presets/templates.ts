import type { CommandGenerator, CommandWithArgs } from "~/commands"
// import type { System } from "~/system"

export const generator: CommandGenerator = ({ presets, args, system }) => {
  const commands: CommandWithArgs[] = []

  const filename = presets.includes("typescript") ? "index.ts" : "index.js"

  if (
    presets.includes("dist") &&
    args.dist.includes("lib") &&
    !system.exists(`lib/${filename}`)
  ) {
    commands.push({
      command: "file",
      path: `lib/${filename}`,
      contents: `export default () => {}`,
    })
  }

  // if (!hasAnyOperations(system)) {
  //   let path = "src/index.tsx"
  //   if (system.exists(path)) {
  //     path = "src/example.tsx"
  //   }
  //   commands.push({
  //     command: "file",
  //     path,
  //     contents: getExampleIndex(),
  //   })
  // {
  //   command: "file",
  //   path: getEntryPointpath(presets),
  //   merge: "if-not-exists",
  //   contents: getDefaultIndex(args),
  // }
  // }

  return commands
}

// const hasAnyOperations = (system: System) => {
//   const { status } = system.run("grep -rnw . -e 'gql('")
//   return status === 0
// }

// const getGraphqlIndex = () => `import React from 'react'
// import {
//   ApolloProvider,
//   ApolloClient,
//   HttpLink,
//   InMemoryCache,
//   useQuery,
// } from "@apollo/client"
// import { gql } from "~/gql"
// import fetch from "cross-fetch"

// const client = new ApolloClient({
//   cache: new InMemoryCache(),
//   link: new HttpLink({
//     uri: \`\${window.location.protocol}//\${window.location.host}/server\`,
//     fetch,
//   }),
// })

// const EXAMPLE_OPERATION = gql(\`
//   query ExampleOperation($text: String!) {
//     exampleQuery(text: $text) {
//       message
//     }
//   }
// \`)

// const Example = () => {
//   const { data } = useQuery(EXAMPLE_OPERATION)
//   return <>{data?.exampleQuery.message || "No data"}</>
// }

// export const App = () => (
//   <ApolloProvider client={client}>
//     <Example />
//   </ApolloProvider>
// )
// `
