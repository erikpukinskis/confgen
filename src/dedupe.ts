import get from "lodash/get"
import deepEqual from "deep-equal"
import uniqWith from "lodash/uniqWith"
import uniqBy from "lodash/uniqBy"

type Json = Record<string, unknown>

export const dedupe = (json: Json) => {
  for (const [key, value] of Object.entries(json)) {
    if (Array.isArray(value)) {
      json[key] = dedupeArray(value)
    } else if (typeof value === "object") {
      json[key] = dedupe(value as Json)
    }
  }
  return json
}

export const dedupeArray = (array: unknown[]) => {
  array = uniqWith(array, deepEqual)
  array.reverse()
  array = uniqBy(array, getContentTag)
  array.reverse()
  return array
}

/**
 * We want to dedupe arrays, otherwise something like the files config in a
 * package.json would eventually look like "files": ["dist", "dist", etc...]
 *
 * For a simple case like that, the lodash uniq function works perfectly well,
 * so we run that first.
 *
 * However, is a case in the graphql codegen.yml file where we want to dedupe
 * the plugins array, and that array can contain objects. In particular the
 * "add" plugin will often be used several times.
 *
 * So we can dedupe the add plugin by adding a unique comment to the end of the
 * content, in this case we add "//@contextType" at the end of the line.
 *
 * This function will identify objects with those content tags so they can be
 * deduped with lodash uniqBy above.
 */
const getContentTag = (item: unknown) => {
  const content = get(item, "add.content") as string | undefined
  if (!content) return item

  const matches = content.match(/\/\/@([a-z]+)$/i)
  if (!matches) return item

  return matches[1]
}
