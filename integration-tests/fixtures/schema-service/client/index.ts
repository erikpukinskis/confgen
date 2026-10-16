import { graphql } from "../gql/client/index.js"

export const Greeting = graphql(`
  query Greeting {
    greeting
  }
`)
