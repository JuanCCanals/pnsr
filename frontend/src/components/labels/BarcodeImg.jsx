import React, { useEffect, useRef } from "react";
import JsBarcode from "jsbarcode";

/**
 * BarcodeImg
 * Genera un CODE128 en SVG y lo convierte en un <img src="data:image/svg+xml;base64,...">
 * para que funcione SIEMPRE en vista previa e impresión (incluido DOM clonado).
 */
export default function BarcodeImg({
  value = "000000",
  barWidth = 1.2,    // px por barra
  barHeight = 34,    // alto en px
  className = "",
  style = {},
}) {
  const imgRef = useRef(null);

  useEffect(() => {
    // 1) Genera SVG con JsBarcode
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    try {
      JsBarcode(svg, String(value || ""), {
        format: "CODE128",
        displayValue: false,
        width: barWidth,
        height: barHeight,
        margin: 0,
      });
    } catch (e) {
      // Fallback si hubiese error en el valor
      if (imgRef.current) {
        imgRef.current.alt = String(value || "");
      }
      return;
    }

    // 2) Serializa a Data URL (SVG)
    const xml = new XMLSerializer().serializeToString(svg);
    // Nota: encodeURIComponent para caracteres especiales, luego base64
    const svg64 = btoa(unescape(encodeURIComponent(xml)));
    const dataUrl = `data:image/svg+xml;base64,${svg64}`;

    // 3) Asigna al <img>
    if (imgRef.current) {
      imgRef.current.src = dataUrl;
    }
  }, [value, barWidth, barHeight]);

  return (
    <img
      ref={imgRef}
      alt=""
      className={className}
      style={{ display: "block", ...style }}
    />
  );
}
