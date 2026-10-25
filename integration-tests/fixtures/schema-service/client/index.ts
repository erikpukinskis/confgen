import { graphql } from "#gql"

export const Greeting = graphql(`
  query Greeting {
    greeting
  }
`)
