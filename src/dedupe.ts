import uniq from "lodash/uniq"
import get from "lodash/get"
import deepEqual from "deep-equal"
import uniqWith from "lodash/uniqWith"

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
  array = uniqueTags(array)
  return array
}

const getContentTag = (item: unknown) => {
  const content = get(item, "add.content") as string | undefined
  if (!content) return item

  const matches = content.match(/\/\/@([a-z]+)$/i)
  if (!matches) return item

  return matches[1]
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
 * This function will keep only the last matching line with any comment like
 * that.
 */
export const uniqueTags = (arr: unknown[]) => {
  arr = uniq(arr)

  const taggedItems: Record<string, number[]> = {}

  for (const [index, item] of arr.entries()) {
    // For now we only look for tags on items like:
    //   { add: { content: "... //@tag" } }
    // but in the future we may need to apply this to more types of objects!
    const content = get(item, "add.content") as string | undefined
    if (!content) continue

    const matches = content.match(/\/\/@([a-z]+)/i)

    if (!matches) continue

    const tag = matches[1]

    if (!taggedItems[tag]) {
      taggedItems[tag] = []
    }

    // This first step collects up the indexes of every tagged item, one array
    // of indexes for each tag
    taggedItems[tag].push(index)
  }

  // Then we are going to look at each of those sets of indexes individually,
  // and remove all but the last one. We start by just setting them to undefined
  // so all the indexes stay the same, and then we'll remove the undefineds when
  // we're done.
  for (const indexes of Object.values(taggedItems)) {
    const oldIndexes = indexes.slice(0, -1) // all but the last item
    for (const index of oldIndexes) {
      arr[index] = undefined
    }
  }

  return arr.filter((item) => item != null) // remove the undefineds
}
