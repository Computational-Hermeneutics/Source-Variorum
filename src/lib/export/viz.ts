/**
 * Copy / download helpers for the analysis visualisations (dotplot canvas,
 * stemma SVG). Canvases export directly; SVGs are first cloned with their CSS
 * theme variables resolved to concrete colours (a bare `hsl(var(--primary))`
 * does not render outside the app) and given a white background, so the exported
 * file/clipboard image looks the same standalone.
 */

export function downloadBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function canvasToBlob(cv: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((res) => cv.toBlob((b) => res(b), "image/png"));
}

/** Copy a blob to the clipboard as an image. Returns false if unsupported. */
export async function copyImageBlob(blob: Blob): Promise<boolean> {
  try {
    const C = (globalThis as { ClipboardItem?: typeof ClipboardItem }).ClipboardItem;
    if (navigator.clipboard && "write" in navigator.clipboard && C) {
      await navigator.clipboard.write([new C({ [blob.type]: blob })]);
      return true;
    }
  } catch { /* fall through */ }
  return false;
}

/** Serialise an SVG to a standalone string: theme colours inlined, white bg. */
export function serializeSvg(svg: SVGSVGElement): string {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  const orig = svg.querySelectorAll<SVGElement>("*");
  const cl = clone.querySelectorAll<SVGElement>("*");
  for (let i = 0; i < orig.length; i++) {
    const cs = getComputedStyle(orig[i]);
    for (const p of ["fill", "stroke"] as const) {
      const v = cl[i].getAttribute(p);
      if (v && (v.includes("var(") || v === "currentColor")) cl[i].setAttribute(p, cs[p]);
    }
  }
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  const bg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  bg.setAttribute("width", "100%"); bg.setAttribute("height", "100%"); bg.setAttribute("fill", "white");
  clone.insertBefore(bg, clone.firstChild);
  return new XMLSerializer().serializeToString(clone);
}

/** Rasterise an SVG to a (retina) canvas for PNG copy/download. */
export function svgToCanvas(svg: SVGSVGElement, scale = 2): Promise<HTMLCanvasElement> {
  const xml = serializeSvg(svg);
  const w = svg.width.baseVal.value || svg.viewBox.baseVal.width || 600;
  const h = svg.height.baseVal.value || svg.viewBox.baseVal.height || 400;
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const cv = document.createElement("canvas");
      cv.width = Math.round(w * scale); cv.height = Math.round(h * scale);
      const ctx = cv.getContext("2d");
      if (!ctx) { reject(new Error("no 2d context")); return; }
      ctx.scale(scale, scale);
      ctx.fillStyle = "white"; ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0);
      resolve(cv);
    };
    img.onerror = reject;
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(xml);
  });
}
