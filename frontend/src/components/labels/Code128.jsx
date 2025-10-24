import React, { useEffect, useRef } from "react";
import JsBarcode from "jsbarcode";

/**
 * Code128 (SVG)
 * Renderiza un CODE128 en SVG (no canvas) para que aparezca en todas las
 * etiquetas en vista previa e impresión (incluido react-to-print).
 */
export default function Code128({
  value = "000000",
  barWidth = 1.2,     // ancho de barra en px (ajusta si quieres más delgado/grueso)
  barHeight = 34,     // alto de barras en px
  className = "",
  style = {},
}) {
  const hostRef = useRef(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    // Limpia el contenedor en cada render
    host.innerHTML = "";

    // Crea y dibuja SVG con JsBarcode
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    try {
      JsBarcode(svg, String(value || ""), {
        format: "CODE128",
        displayValue: false, // el texto lo ponemos nosotros aparte (debajo)
        width: barWidth,
        height: barHeight,
        margin: 0,
      });
      host.appendChild(svg);
    } catch (e) {
      // Si hay un valor inválido, no revienta la impresión
      // y deja un placeholder simple:
      const fallback = document.createElement("div");
      fallback.textContent = value;
      fallback.style.fontSize = "10px";
      host.appendChild(fallback);
    }
  }, [value, barWidth, barHeight]);

  return <div ref={hostRef} className={className} style={style} />;
}
