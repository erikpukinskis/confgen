import { graphql } from "#gql/client"

export const Greeting = graphql(`
  query Greeting($name: String!) {
    greeting(name: $name)
  }
`)
