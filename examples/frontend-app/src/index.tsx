import React from "react"
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
    uri: `${window.location.protocol}//${window.location.host}/graphql`,
    fetch,
  }),
})

const EXAMPLE = gql(`
  query ExampleOperation($text: String!) {
    exampleQuery(text: $text) {
      message
    }
  }
`)

const Example = () => {
  const { data } = useQuery(EXAMPLE)
  return <>{data?.exampleQuery.message || "No data"}</>
}

export const App = () => (
  <ApolloProvider client={client}>
    <Example />
  </ApolloProvider>
)
