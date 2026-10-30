import { useEffect, useState } from "react";

/**
 * A small readout of how the device lays the app out: the safe-area insets iOS reports, whether
 * it runs as an installed app, the screen and window heights, where the top bar sits, and which
 * build is loaded (the stylesheet's hashed name). For diagnosing the status bar on real iPhones,
 * which no desktop browser reproduces.
 */
function measure() {
  const probe = document.createElement("div");
  probe.style.cssText = "position:fixed;visibility:hidden;padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom)";
  document.body.appendChild(probe);
  const cs = getComputedStyle(probe);
  const insetTop = cs.paddingTop;
  const insetBottom = cs.paddingBottom;
  probe.remove();
  const header = document.querySelector("header")?.getBoundingClientRect();
  const css = [...document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')].map((l) => l.href.split("/").pop()).join(", ");
  const nav = navigator as Navigator & { standalone?: boolean };
  return [
    ["Safe area top", insetTop],
    ["Safe area bottom", insetBottom],
    ["Installed app", `${matchMedia("(display-mode: standalone)").matches ? "yes" : "no"} (navigator.standalone: ${String(nav.standalone)})`],
    ["Screen height", `${screen.height}px`],
    ["Window height", `${innerHeight}px (visual ${Math.round(visualViewport?.height ?? 0)}px)`],
    ["Top bar", header ? `top ${Math.round(header.top)}px, height ${Math.round(header.height)}px` : "none"],
    ["Status bar style", document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]')?.getAttribute("content") ?? "none"],
    ["Build", css || "dev"],
  ];
}

export function DisplayDiagnostics() {
  const [rows, setRows] = useState<string[][]>([]);
  useEffect(() => {
    const update = () => setRows(measure());
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);
  return (
    <dl className="text-text-faint grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5 px-1 font-mono text-[11px]">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt>{k}</dt>
          <dd className="break-words">{v}</dd>
        </div>
      ))}
    </dl>
  );
}
