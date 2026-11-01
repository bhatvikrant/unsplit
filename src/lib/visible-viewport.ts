import * as React from "react"

/**
 * Bottom sheets sit on the edge of what is actually on screen, not on the layout viewport.
 *
 * A `position: fixed; bottom: 0` element is placed at the bottom of the layout viewport, and on
 * iOS that edge is not always on screen: some in-app browsers on iOS 26 lay the page out taller
 * than the area they show, and the keyboard covers the bottom of it. A sheet anchored there has its
 * last rows off screen. They are still inside the sheet's scroll area, so scrolling to them only
 * rubber-bands and springs back.
 *
 * `visualViewport` is the area the user sees. While a sheet is open this keeps two variables on
 * <html> that the sheets size themselves with:
 * - `--sheet-vv-gap`: how far the layout viewport runs below the visible area (the keyboard, or
 *   space the browser lays out but does not show). A sheet's `bottom`.
 * - `--sheet-vv-h`: the visible height. A sheet's height is a share of it.
 */

let users = 0
let stop: (() => void) | undefined

function start() {
  const vv = window.visualViewport
  if (!vv) return undefined
  const root = document.documentElement
  // Measures the layout viewport as a fixed element sees it, which can differ from innerHeight.
  const probe = document.createElement("div")
  probe.setAttribute("aria-hidden", "true")
  probe.style.cssText = "position:fixed;inset:0;visibility:hidden;pointer-events:none;z-index:-1"
  document.body.appendChild(probe)

  const update = () => {
    // While pinch-zoomed the visible area is a magnified part of the page, not the screen edge.
    if (vv.scale > 1.01) return
    const layoutBottom = probe.getBoundingClientRect().bottom
    const visibleBottom = vv.offsetTop + vv.height
    root.style.setProperty("--sheet-vv-h", `${vv.height}px`)
    root.style.setProperty("--sheet-vv-gap", `${Math.max(0, Math.round(layoutBottom - visibleBottom))}px`)
  }
  update()
  vv.addEventListener("resize", update)
  vv.addEventListener("scroll", update)
  window.addEventListener("resize", update)
  return () => {
    vv.removeEventListener("resize", update)
    vv.removeEventListener("scroll", update)
    window.removeEventListener("resize", update)
    probe.remove()
    root.style.removeProperty("--sheet-vv-h")
    root.style.removeProperty("--sheet-vv-gap")
  }
}

/** Keeps `--sheet-vv-gap` and `--sheet-vv-h` current while `active` (a sheet is mounted). */
export function useVisibleViewport(active = true) {
  React.useLayoutEffect(() => {
    if (!active) return
    if (users++ === 0) stop = start()
    return () => {
      if (--users === 0) {
        stop?.()
        stop = undefined
      }
    }
  }, [active])
}

/**
 * Classes for a sheet anchored to the bottom of the visible area. `!` because vaul writes an inline
 * height and bottom of its own when the keyboard opens, measured from the layout viewport.
 */
export const sheetBottomClass = "bottom-[var(--sheet-vv-gap,0px)]!"
