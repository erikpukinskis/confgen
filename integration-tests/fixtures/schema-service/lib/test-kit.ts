import { graphqlTestKitFactory } from "graphql-dev-kit/test"
import { initServer } from "#server/initServer"

export const createSchemaServiceTestKit = graphqlTestKitFactory({
  init: async () => {
    const { express: app } = await initServer()
    return app
  },
})
