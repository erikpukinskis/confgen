import type { QueryResolvers } from "#gql/index"

export function greetingMessage(name: string): string {
  return `Hello, ${name}`
}

export const greeting: NonNullable<QueryResolvers["greeting"]> = (
  parent,
  args,
) => {
  void parent
  return greetingMessage(args.name)
}
