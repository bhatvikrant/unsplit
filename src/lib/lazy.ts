const loaders: (() => Promise<unknown>)[] = [];

/**
 * Marks a `lazy()` loader whose chunk is also fetched once the app shell is idle (warmLazyChunks, in
 * AppShell): the first open is instant, and the code is there offline before the service worker has
 * cached it. Charts stays plain `lazy`: a third of the bundle that most sessions never open.
 */
export function warm<T>(load: () => Promise<T>) {
  loaders.push(load);
  return load;
}

/** Starts every loader marked with warm(); one that fails (offline, nothing cached) loads on first use instead. */
export function warmLazyChunks() {
  for (const load of loaders) load().catch(() => {});
}
