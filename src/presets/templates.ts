import type { CommandGenerator, CommandWithArgs } from "@/commands"
import type { System } from "@/system"

export const generator: CommandGenerator = ({ presets, args }) => {
  const commands: CommandWithArgs[] = []

  if (presets.includes("dist") && args.dist.includes("lib")) {
    const filename = presets.includes("typescript") ? "index.ts" : "index.js"
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
  //     contents: buildExampleIndex(),
  //   })
  // {
  //   command: "file",
  //   path: buildEntryPointpath(presets),
  //   merge: "if-not-exists",
  //   contents: buildDefaultIndex(args),
  // }
  // }

  return commands
}

const hasAnyOperations = (system: System) => {
  const { status } = system.run("grep -rnw . -e 'gql('")
  return status === 0
}

const buildGraphqlIndex = () => `import React from 'react'
import {
  ApolloProvider,
  ApolloClient,
  HttpLink,
  InMemoryCache,
  useQuery,
} from "@apollo/client"
import { gql } from "@/__generated__"
import fetch from "cross-fetch"

const client = new ApolloClient({
  cache: new InMemoryCache(),
  link: new HttpLink({
    uri: \`\${window.location.protocol}//\${window.location.host}/api\`,
    fetch,
  }),
})

const EXAMPLE_OPERATION = gql(\`
  query ExampleOperation($text: String!) {
    exampleQuery(text: $text) {
      message
    }
  }
\`)

const Example = () => {
  const { data } = useQuery(EXAMPLE_OPERATION)
  return <>{data?.exampleQuery.message || "No data"}</>
}

export const App = () => (
  <ApolloProvider client={client}>
    <Example />
  </ApolloProvider>
)
`
