/**
 * Open overlays (modals, drawers), innermost last, so Escape closes only the
 * topmost one.
 */
const stack = []

export function pushOverlay() {
  const token = {}
  stack.push(token)
  return token
}

export function popOverlay(token) {
  const i = stack.indexOf(token)
  if (i !== -1) stack.splice(i, 1)
}

export const isTopOverlay = (token) => stack.at(-1) === token
