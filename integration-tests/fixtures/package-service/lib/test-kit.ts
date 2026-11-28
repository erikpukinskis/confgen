import { graphqlTestKitFactory } from "graphql-dev-kit/test"
import { initServer } from "#server/initServer"

export const createPackageServiceTestKit = graphqlTestKitFactory({
  init: async () => {
    const { express } = await initServer()
    return express
  },
})
