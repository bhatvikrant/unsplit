/** True on Apple platforms, where the command key is the modifier shown in shortcut hints. */
export const IS_MAC = typeof navigator !== "undefined" && /Mac|iPhone|iPad|iPod/.test(navigator.platform);
