import React, { useMemo } from "react";
import JsBarcode from "jsbarcode";

/**
 * BarcodeDataUrl
 * Genera un CODE128 como data URL (SVG) de forma síncrona (sin useEffect),
 * para que el <img src="data:..."> ya exista ANTES del clonado a iframe.
 */
export default function BarcodeDataUrl({
  value = "000000",
  barWidth = 1.2,   // px por barra
  barHeight = 34,   // alto en px
  className = "",
  style = {},
}) {
  const src = useMemo(() => {
    try {
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      JsBarcode(svg, String(value || ""), {
        format: "CODE128",
        displayValue: false,
        width: barWidth,
        height: barHeight,
        margin: 0,
      });
      const xml = new XMLSerializer().serializeToString(svg);
      const svg64 = btoa(unescape(encodeURIComponent(xml)));
      return `data:image/svg+xml;base64,${svg64}`;
    } catch {
      return ""; // fallback silencioso
    }
  }, [value, barWidth, barHeight]);

  // Tamaño explícito para evitar layout raro en algunos drivers
  const w = Math.max(120, Math.round((String(value).length || 6) * barWidth * 11)); // heurística segura

  return (
    <img
      src={src}
      alt=""
      className={className}
      style={{ display: "block", width: `${w}px`, height: `${barHeight}px`, ...style }}
    />
  );
}
