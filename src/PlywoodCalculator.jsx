import { useState, useRef, useCallback, useMemo, useEffect } from "react";

const SHEET_W = 96;
const SHEET_H = 48;
const DEFAULT_KERF = 0.125;
const selectOnFocus = (e) => e.target.select();

// ─── Fraction helpers (1/16 for dims, 1/64 for thickness) ───
const FRACS16 = Array.from({ length: 16 }, (_, i) => i / 16);
const FRAC16_LABELS = FRACS16.map((f) => {
  if (f === 0) return "0";
  let n = Math.round(f * 16), d = 16;
  while (n % 2 === 0) { n /= 2; d /= 2; }
  return `${n}/${d}`;
});
const FRACS64 = Array.from({ length: 64 }, (_, i) => i / 64);
const FRAC64_LABELS = FRACS64.map((f) => {
  if (f === 0) return "0";
  let n = Math.round(f * 64), d = 64;
  while (n % 2 === 0) { n /= 2; d /= 2; }
  return `${n}/${d}`;
});
function nearestFrac(dec, fracs) {
  let best = 0, bestD = Math.abs(dec);
  fracs.forEach((f, i) => { const d = Math.abs(dec - f); if (d < bestD) { bestD = d; best = i; } });
  return best;
}
function toFrac16(dec) {
  const whole = Math.floor(dec);
  const rem = dec - whole;
  const fi = nearestFrac(rem, FRACS16);
  if (fi === 0) return `${whole}`;
  return whole > 0 ? `${whole}-${FRAC16_LABELS[fi]}` : FRAC16_LABELS[fi];
}
// Round DOWN to nearest 1/16 for cut dimensions
function rd16(v) { return Math.floor(v * 16) / 16; }
function fmtDim(inches) { return `${toFrac16(rd16(inches))}"`; }
// Format raw (no rounding) for inputs/labels — uses best-fit denominator up to 64ths
function fmtRaw(inches) {
  const whole = Math.floor(inches);
  const rem = inches - whole;
  if (rem < 1/128) return `${whole}"`;
  for (const d of [2, 4, 8, 16, 32, 64]) {
    const n = Math.round(rem * d);
    if (Math.abs(rem - n / d) < 1/128) {
      let nn = n, dd = d;
      while (nn % 2 === 0 && dd > 1) { nn /= 2; dd /= 2; }
      return whole > 0 ? `${whole}-${nn}/${dd}"` : `${nn}/${dd}"`;
    }
  }
  return `${toFrac16(inches)}"`;
}
// Map actual plywood thickness to standard nominal size label
function nominalSize(t) {
  if (Math.abs(t - 0.25) < 0.05) return '1/4"';
  if (Math.abs(t - 0.5) < 0.05) return '1/2"';
  if (Math.abs(t - 0.75) < 0.1) return '3/4"'; // covers 23/32" (0.71875)
  return fmtDim(t);
}

// ─── Strip packer ───
const MAX_PANELS_PER_STRIP = 6;
function stripPack(panels, sheetW, sheetH, kerf, preSheets = []) {
  const groups = {};
  panels.forEach((p) => {
    const key = p.ripDim.toFixed(4);
    if (!groups[key]) groups[key] = { ripDim: p.ripDim, panels: [] };
    groups[key].panels.push({ ...p });
  });
  const allStrips = [];
  for (const g of Object.values(groups)) {
    const sorted = [...g.panels].sort((a, b) => b.crossDim - a.crossDim);
    let strip = { ripDim: g.ripDim, panels: [], usedLen: 0 };
    for (const p of sorted) {
      const gap = strip.panels.length > 0 ? kerf : 0;
      const fits = strip.usedLen + gap + p.crossDim <= sheetW;
      const atLimit = strip.panels.length >= MAX_PANELS_PER_STRIP;
      if (fits && !atLimit) {
        strip.panels.push({ ...p, stripX: strip.usedLen + gap });
        strip.usedLen += gap + p.crossDim;
      } else {
        allStrips.push(strip);
        strip = { ripDim: g.ripDim, panels: [{ ...p, stripX: 0 }], usedLen: p.crossDim };
      }
    }
    if (strip.panels.length > 0) allStrips.push(strip);
  }
  allStrips.sort((a, b) => b.ripDim - a.ripDim);
  const sheets = preSheets.map((s) => ({ strips: [], usedH: 0, maxW: s.w, maxH: s.h, isScrap: true, scrapLabel: s.label, scrapId: s.id }));
  for (const strip of allStrips) {
    let placed = false;
    for (const sheet of sheets) {
      const sW = sheet.maxW || sheetW;
      const sH = sheet.maxH || sheetH;
      const gap = sheet.strips.length > 0 ? kerf : 0;
      if (strip.usedLen <= sW && sheet.usedH + gap + strip.ripDim <= sH) {
        sheet.strips.push({ ...strip, y: sheet.usedH + gap });
        sheet.usedH += gap + strip.ripDim;
        placed = true;
        break;
      }
    }
    if (!placed) {
      sheets.push({ strips: [{ ...strip, y: 0 }], usedH: strip.ripDim, maxW: sheetW, maxH: sheetH });
    }
  }
  return sheets.map((sheet) => ({
    panels: sheet.strips.flatMap((strip) => strip.panels.map((p) => ({ ...p, x: p.stripX, y: strip.y, w: p.crossDim, h: strip.ripDim }))),
    strips: sheet.strips,
    usedH: sheet.usedH,
    maxW: sheet.maxW || sheetW,
    maxH: sheet.maxH || sheetH,
    isScrap: sheet.isScrap || false,
    scrapLabel: sheet.scrapLabel || null,
    scrapId: sheet.scrapId || null,
  }));
}

// ─── Collect waste ───
function collectWaste(sheets, sheetW, sheetH) {
  const waste = [];
  let id = 1;
  sheets.forEach((sheet, si) => {
    const sW = sheet.maxW || sheetW;
    const sH = sheet.maxH || sheetH;
    sheet.strips.forEach((strip, sti) => {
      const wasteLen = sW - strip.usedLen;
      if (wasteLen >= 2) waste.push({ id: id++, w: +wasteLen.toFixed(2), h: +strip.ripDim.toFixed(2), label: `Scrap ${id - 1}`, source: `Sheet ${si + 1}, Strip ${String.fromCharCode(65 + sti)} end` });
    });
    const wasteH = sH - sheet.usedH;
    if (wasteH >= 2) waste.push({ id: id++, w: +sW.toFixed(2), h: +wasteH.toFixed(2), label: `Scrap ${id - 1}`, source: `Sheet ${si + 1} bottom` });
  });
  return waste;
}

// ─── Panel generation (multi-group, always pocket hole) ───
function generatePanelList({ cabGroups, fullTop, fullBack, fullBackCov, backStockT, stringerTopW, stringerBackW, stockT, kerf }) {
  const panels = [];
  const isInset = backStockT >= 0.7; // only 3/4" backs are inset

  for (let gi = 0; gi < cabGroups.length; gi++) {
    const grp = cabGroups[gi];
    const grpLabel = String.fromCharCode(65 + gi); // A, B, C...
    const { w: spaceW, h: spaceH, d: depth, qty, mult = 1 } = grp;
    const divide = qty || 1;
    const totalCabs = divide * mult;
    const cabinetW = rd16(spaceW / divide); // divide total space by number of cabinets
    const tbW = rd16(cabinetW - 2 * stockT); // pocket hole: top/bot sits between sides
    const boxDepth = rd16(fullBack && !isInset ? depth - backStockT : depth);
    const crossH = rd16(spaceH);

    for (let i = 0; i < totalCabs; i++) {
      const c = `${grpLabel}${i + 1}`; // A1, A2, B1, B2...

      panels.push({ ripDim: boxDepth, crossDim: crossH, label: `${c}-SL`, type: "side", thickness: stockT, cab: c });
      panels.push({ ripDim: boxDepth, crossDim: crossH, label: `${c}-SR`, type: "side", thickness: stockT, cab: c });
      panels.push({ ripDim: boxDepth, crossDim: tbW, label: `${c}-Bot`, type: "topbot", thickness: stockT, cab: c });

      if (fullTop) {
        panels.push({ ripDim: boxDepth, crossDim: tbW, label: `${c}-Top`, type: "topbot", thickness: stockT, cab: c });
      } else {
        panels.push({ ripDim: rd16(stringerTopW), crossDim: tbW, label: `${c}-TSF`, type: "stringer", thickness: stockT, cab: c });
        panels.push({ ripDim: rd16(stringerTopW), crossDim: tbW, label: `${c}-TSB`, type: "stringer", thickness: stockT, cab: c });
      }

      if (fullBack) {
        const backW = rd16(isInset ? cabinetW - 2 * stockT : cabinetW);
        // fullBackCov: exact height; otherwise split the kerf difference to allow 2 strips per sheet
        const backH = fullBackCov ? rd16(spaceH) : rd16(spaceH - kerf / 2);
        panels.push({ ripDim: backH, crossDim: backW, label: `${c}-Bk`, type: "back", thickness: backStockT, cab: c, inset: isInset });
      } else {
        panels.push({ ripDim: rd16(stringerBackW), crossDim: tbW, label: `${c}-BST`, type: "stringer", thickness: stockT, cab: c });
        panels.push({ ripDim: rd16(stringerBackW), crossDim: tbW, label: `${c}-BSB`, type: "stringer", thickness: stockT, cab: c });
      }
    }
  }
  return panels;
}

// ─── Theme ───
function getTheme(mode) {
  const isBP = mode === "screen";
  return {
    isBP, bg: isBP ? "#0d1b2a" : "#fff", border: isBP ? "#4A90D9" : "#000",
    grid: isBP ? "#1a3a5c" : "#f0f0f0", dim: isBP ? "#4A90D9" : "#555",
    text: isBP ? "#c0d8f0" : "#333", heading: isBP ? "#e0ecfa" : "#111",
    accent: isBP ? "#4A90D9" : "#2a6db5", card: isBP ? "#0d1b2a" : "#fafafa",
    fontFam: isBP ? "monospace" : "-apple-system, sans-serif",
    rip: isBP ? "rgba(255,100,100,0.5)" : "#cc0000",
    waste: isBP ? "#ff4444" : "#999", wasteFill: isBP ? "rgba(255,68,68,0.06)" : "#f8f8f8",
    wasteText: isBP ? "#ff6666" : "#aaa", tool: isBP ? "#8ab4e8" : "#555",
    type: {
      side: { fill: isBP ? "rgba(74,144,217,0.18)" : "none", stroke: isBP ? "#4A90D9" : "#2a6db5", text: isBP ? "#6ab0ff" : "#2a6db5" },
      topbot: { fill: isBP ? "rgba(80,184,108,0.18)" : "none", stroke: isBP ? "#50B86C" : "#2d8a48", text: isBP ? "#70d88c" : "#2d8a48" },
      back: { fill: isBP ? "rgba(200,160,60,0.15)" : "none", stroke: isBP ? "#c8a03c" : "#9a7520", text: isBP ? "#e0c060" : "#9a7520" },
      stringer: { fill: isBP ? "rgba(180,130,220,0.18)" : "none", stroke: isBP ? "#a070d0" : "#7050a0", text: isBP ? "#c090f0" : "#7050a0" },
    },
  };
}

// ─── 3D Cabinet Reference ───
function CabinetReference({ isBP, depth, spaceH, cabinetW, tbW, fontFam, fullTop, fullBack }) {
  const f = fmtDim;
  const w = 180, h = 140;
  const dimCol = isBP ? "rgba(200,220,255,0.5)" : "#888";
  const sideCol = isBP ? { fill: "rgba(74,144,217,0.3)", stroke: "#4A90D9" } : { fill: "none", stroke: "#2a6db5" };
  const tbCol = isBP ? { fill: "rgba(80,184,108,0.3)", stroke: "#50B86C" } : { fill: "none", stroke: "#2d8a48" };
  const backCol = isBP ? { fill: "rgba(200,160,60,0.25)", stroke: "#c8a03c" } : { fill: "none", stroke: "#9a7520" };
  const strCol = isBP ? { fill: "rgba(180,130,220,0.3)", stroke: "#a070d0" } : { fill: "none", stroke: "#7050a0" };
  const bx = 45, by = 25, bw = 65, bh = 72, dx = 30, dy = -20;

  return (
    <svg width={w} height={h} style={{ display: "block" }}>
      {/* Back panel (drawn first, furthest away) */}
      {fullBack ? (
        <polygon points={`${bx+dx},${by+dy} ${bx+bw+dx},${by+dy} ${bx+bw+dx},${by+bh+dy} ${bx+dx},${by+bh+dy}`}
          fill={backCol.fill} stroke={backCol.stroke} strokeWidth={1.5} />
      ) : (
        <>
          <rect x={bx+dx} y={by+dy} width={bw} height={8} fill={strCol.fill} stroke={strCol.stroke} strokeWidth={1} rx={1} />
          <rect x={bx+dx} y={by+bh+dy-8} width={bw} height={8} fill={strCol.fill} stroke={strCol.stroke} strokeWidth={1} rx={1} />
        </>
      )}
      <text x={bx+bw/2+dx} y={by+bh/2+dy} textAnchor="middle" dominantBaseline="middle"
        fill={fullBack ? backCol.stroke : strCol.stroke} fontSize={7} fontWeight="600" fontFamily={fontFam}>
        {fullBack ? "BACK" : "BK STR"}
      </text>

      {/* Bottom panel */}
      <polygon points={`${bx},${by+bh} ${bx+bw},${by+bh} ${bx+bw+dx},${by+bh+dy} ${bx+dx},${by+bh+dy}`}
        fill={tbCol.fill} stroke={tbCol.stroke} strokeWidth={1.5} />
      <text x={bx+bw/2+dx/2} y={by+bh+dy/2} textAnchor="middle" dominantBaseline="middle"
        fill={tbCol.stroke} fontSize={7} fontWeight="600" fontFamily={fontFam}>BOT</text>

      {/* Top panel or stringers */}
      {fullTop ? (
        <polygon points={`${bx},${by} ${bx+bw},${by} ${bx+bw+dx},${by+dy} ${bx+dx},${by+dy}`}
          fill={tbCol.fill} stroke={tbCol.stroke} strokeWidth={1.5} />
      ) : (
        <>
          <polygon points={`${bx},${by} ${bx+bw},${by} ${bx+bw+4},${by-3} ${bx+4},${by-3}`}
            fill={strCol.fill} stroke={strCol.stroke} strokeWidth={1} />
          <polygon points={`${bx+dx-4},${by+dy+3} ${bx+bw+dx-4},${by+dy+3} ${bx+bw+dx},${by+dy} ${bx+dx},${by+dy}`}
            fill={strCol.fill} stroke={strCol.stroke} strokeWidth={1} />
        </>
      )}
      <text x={bx+bw/2+dx/2} y={by+dy/2+2} textAnchor="middle" dominantBaseline="middle"
        fill={fullTop ? tbCol.stroke : strCol.stroke} fontSize={7} fontWeight="600" fontFamily={fontFam}>
        {fullTop ? "TOP" : "T STR"}
      </text>

      {/* Left side panel */}
      <polygon points={`${bx},${by} ${bx+dx},${by+dy} ${bx+dx},${by+bh+dy} ${bx},${by+bh}`}
        fill={sideCol.fill} stroke={sideCol.stroke} strokeWidth={1.5} />
      <text x={bx+dx/2} y={by+bh/2+dy/2} textAnchor="middle" dominantBaseline="middle"
        fill={sideCol.stroke} fontSize={7} fontWeight="600" fontFamily={fontFam}
        transform={`rotate(-56, ${bx+dx/2}, ${by+bh/2+dy/2})`}>SL</text>

      {/* Right side panel */}
      <polygon points={`${bx+bw},${by} ${bx+bw+dx},${by+dy} ${bx+bw+dx},${by+bh+dy} ${bx+bw},${by+bh}`}
        fill={sideCol.fill} stroke={sideCol.stroke} strokeWidth={1.5} />
      <text x={bx+bw+dx/2} y={by+bh/2+dy/2} textAnchor="middle" dominantBaseline="middle"
        fill={sideCol.stroke} fontSize={7} fontWeight="600" fontFamily={fontFam}
        transform={`rotate(-56, ${bx+bw+dx/2}, ${by+bh/2+dy/2})`}>SR</text>

      {/* Open front face (dashed outline) */}
      <rect x={bx} y={by} width={bw} height={bh} fill="none" stroke={isBP ? "rgba(255,255,255,0.15)" : "#ccc"} strokeWidth={1} strokeDasharray="4,4" />
      <text x={bx+bw/2} y={by+bh/2} textAnchor="middle" dominantBaseline="middle"
        fill={isBP ? "rgba(255,255,255,0.15)" : "#bbb"} fontSize={7} fontFamily={fontFam}>(front)</text>

      {/* Dimension lines */}
      <line x1={bx} y1={by+bh+10} x2={bx+bw} y2={by+bh+10} stroke={dimCol} strokeWidth={0.5} />
      <line x1={bx} y1={by+bh+7} x2={bx} y2={by+bh+13} stroke={dimCol} strokeWidth={0.5} />
      <line x1={bx+bw} y1={by+bh+7} x2={bx+bw} y2={by+bh+13} stroke={dimCol} strokeWidth={0.5} />
      <text x={bx+bw/2} y={by+bh+20} textAnchor="middle" fill={dimCol} fontSize={7} fontFamily={fontFam}>W={f(cabinetW)}</text>
      <line x1={bx-10} y1={by} x2={bx-10} y2={by+bh} stroke={dimCol} strokeWidth={0.5} />
      <line x1={bx-13} y1={by} x2={bx-7} y2={by} stroke={dimCol} strokeWidth={0.5} />
      <line x1={bx-13} y1={by+bh} x2={bx-7} y2={by+bh} stroke={dimCol} strokeWidth={0.5} />
      <text x={bx-18} y={by+bh/2} textAnchor="middle" dominantBaseline="middle" fill={dimCol} fontSize={7} fontFamily={fontFam}
        transform={`rotate(-90, ${bx-18}, ${by+bh/2})`}>H={f(spaceH)}</text>
      <text x={bx+bw+dx/2+10} y={by+dy/2-4} textAnchor="middle" fill={dimCol} fontSize={7} fontFamily={fontFam}
        transform={`rotate(-35, ${bx+bw+dx/2+10}, ${by+dy/2-4})`}>D={f(depth)}</text>
    </svg>
  );
}

// ─── Dimension helpers ───
function HDim({ x1, x2, y, label, color, fontFam, below = true }) {
  const off = below ? 10 : -10;
  const ty = below ? y + off + 10 : y + off - 4;
  return (<g>
    <line x1={x1} y1={y+off} x2={x2} y2={y+off} stroke={color} strokeWidth={0.7} />
    <line x1={x1} y1={y+off-3} x2={x1} y2={y+off+3} stroke={color} strokeWidth={0.7} />
    <line x1={x2} y1={y+off-3} x2={x2} y2={y+off+3} stroke={color} strokeWidth={0.7} />
    <text x={(x1+x2)/2} y={ty} textAnchor="middle" fill={color} fontSize={8.5} fontFamily={fontFam}>{label}</text>
  </g>);
}
function VDim({ x, y1, y2, label, color, fontFam, right = true }) {
  const off = right ? 10 : -10;
  const tx = right ? x+off+4 : x+off-4;
  return (<g>
    <line x1={x+off} y1={y1} x2={x+off} y2={y2} stroke={color} strokeWidth={0.7} />
    <line x1={x+off-3} y1={y1} x2={x+off+3} y2={y1} stroke={color} strokeWidth={0.7} />
    <line x1={x+off-3} y1={y2} x2={x+off+3} y2={y2} stroke={color} strokeWidth={0.7} />
    <text x={tx} y={(y1+y2)/2} textAnchor={right?"start":"end"} dominantBaseline="middle" fill={color} fontSize={8.5} fontFamily={fontFam}>{label}</text>
  </g>);
}

// ─── Rip Step ───
function RipStep({ sheet, sheetNum, scale, theme }) {
  const { isBP, bg, border, dim, fontFam, rip, wasteFill, waste, wasteText, type } = theme;
  const f = fmtDim;
  const sW = (sheet.maxW || SHEET_W);
  const sH = (sheet.maxH || SHEET_H);
  const wasteH = sH - sheet.usedH;
  const wasteShow = wasteH > 0.5 ? Math.min(wasteH * scale, 20) : 0;
  const croppedH = sheet.usedH * scale + wasteShow;
  const svgW = sW * scale;
  const pad = { left: 20, top: 10, right: 50, bottom: 24 };
  const vbW = svgW + pad.left + pad.right;
  const vbH = croppedH + pad.top + pad.bottom;
  const sheetLabel = sheet.isScrap ? `${sW}" × ${sH}" scrap` : `${sW}" (8')`;

  return (
    <div style={{ marginBottom: 8 }}>
      <svg viewBox={`0 0 ${vbW} ${vbH}`} style={{ width: "100%", borderRadius: 4, background: bg, display: "block" }}>
        <g transform={`translate(${pad.left}, ${pad.top})`}>
          <rect x={0} y={0} width={svgW} height={sheet.usedH*scale} fill="none" stroke={border} strokeWidth={1.5} />
          {sheet.strips.map((strip, si) => {
            const sy = strip.y * scale, sh = strip.ripDim * scale;
            const mainType = strip.panels[0]?.type || "side";
            const tc = type[mainType] || type.side;
            const panelTypes = strip.panels[0]?.type === "side" ? "side panels" : strip.panels[0]?.type === "topbot" ? "top/bot panels" : strip.panels[0]?.type === "stringer" ? "stringers" : "back panels";
            return (<g key={si}>
              <rect x={0} y={sy} width={svgW} height={sh} fill={tc.fill} stroke="none" />
              <text x={svgW/2} y={sy+sh/2} textAnchor="middle" dominantBaseline="middle" fill={tc.text} fontSize={sh < 20 ? 9 : 11} fontWeight="600" fontFamily={fontFam}>
                {sheetNum}-{String.fromCharCode(65+si)} — {strip.panels.length}× {panelTypes}
              </text>
            </g>);
          })}
          {sheet.strips.map((strip, si) => {
            if (si === 0) return null;
            const ry = strip.y * scale;
            return (<g key={`rip-${si}`}>
              <line x1={0} y1={ry} x2={svgW} y2={ry} stroke={rip} strokeWidth={1.5} strokeDasharray="8,5" />
            </g>);
          })}
          {wasteH > 0.5 && (<g>
            <rect x={0} y={sheet.usedH*scale} width={svgW} height={wasteShow} fill={wasteFill} stroke={waste} strokeWidth={0.5} strokeDasharray="4,3" />
            <text x={svgW/2} y={sheet.usedH*scale+wasteShow/2} textAnchor="middle" dominantBaseline="middle" fill={wasteText} fontSize={8} fontFamily={fontFam}>{f(wasteH)} offcut</text>
          </g>)}
          {sheet.strips.map((strip, si) => <VDim key={`vd-${si}`} x={svgW} y1={strip.y*scale} y2={(strip.y+strip.ripDim)*scale} label={f(strip.ripDim)} color={dim} fontFam={fontFam} />)}
          {wasteH > 0.5 && <VDim x={svgW} y1={sheet.usedH*scale} y2={sheet.usedH*scale+wasteShow} label={f(wasteH)} color={wasteText} fontFam={fontFam} />}
          <HDim x1={0} x2={svgW} y={croppedH} label={sheetLabel} color={dim} fontFam={fontFam} />
        </g>
      </svg>
    </div>
  );
}

// ─── Crosscut Step ───
function CrosscutStep({ strip, stripLabel, scale, theme, identicalCount }) {
  const { isBP, bg, border, dim, fontFam, waste, wasteFill, wasteText, type } = theme;
  const f = fmtDim;
  const usedW = strip.usedLen;
  const wasteLen = SHEET_W - usedW;
  const showW = wasteLen > 2 ? Math.min(SHEET_W, usedW + Math.min(wasteLen, 12)) : usedW;
  const stripW = showW * scale;
  const minH = 28;
  const stripH = Math.max(strip.ripDim * scale, minH);
  const pad = { left: 50, top: 22, right: 20, bottom: 22 };
  const mainType = strip.panels[0]?.type || "side";
  const tc = type[mainType] || type.side;
  const vbW = stripW + pad.left + pad.right;
  const vbH = stripH + pad.top + pad.bottom;

  return (
    <div style={{ marginBottom: 6 }}>
      <svg viewBox={`0 0 ${vbW} ${vbH}`} style={{ width: "100%", borderRadius: 4, background: bg, display: "block" }}>
        <g transform={`translate(${pad.left}, ${pad.top})`}>
          <rect x={0} y={0} width={stripW} height={stripH} fill="none" stroke={border} strokeWidth={1.5} />
          {strip.panels.map((p, i) => {
            const px = p.stripX * scale, pw = p.crossDim * scale;
            const showDimAbove = pw >= 45;
            const narrow = pw < 40;
            const labelFs = narrow ? 8 : 11;
            const cx = px + pw / 2, cy = stripH / 2;
            return (<g key={i}>
              <rect x={px} y={0} width={pw} height={stripH} fill={tc.fill} stroke={tc.stroke} strokeWidth={1} />
              {narrow ? (
                <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle" fill={tc.text} fontSize={labelFs} fontWeight="600" fontFamily={fontFam}
                  transform={`rotate(-90, ${cx}, ${cy})`}>{p.label}</text>
              ) : (
                <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle" fill={tc.text} fontSize={labelFs} fontWeight="600" fontFamily={fontFam}>{p.label}</text>
              )}
              {showDimAbove && <HDim x1={px} x2={px+pw} y={0} label={f(p.crossDim)} color={tc.stroke} fontFam={fontFam} below={false} />}
            </g>);
          })}
          {/* If panels too narrow for individual dims, show one combined label */}
          {strip.panels.length > 0 && strip.panels[0].crossDim * scale < 45 && (
            <text x={strip.usedLen * scale / 2} y={-8} textAnchor="middle" fill={tc.stroke} fontSize={9} fontFamily={fontFam}>
              {strip.panels.length}× {f(strip.panels[0].crossDim)} ea
            </text>
          )}
          {wasteLen > 0.5 && (() => {
            const wastePixels = (showW - usedW) * scale;
            const wx = usedW * scale;
            const wcx = wx + wastePixels / 2;
            const wcy = stripH / 2;
            const wasteNarrow = wastePixels < 40;
            return (<g>
              <rect x={wx} y={0} width={wastePixels} height={stripH} fill={wasteFill} stroke={waste} strokeWidth={0.5} strokeDasharray="4,3" />
              {wasteNarrow ? (
                <text x={wcx} y={wcy} textAnchor="middle" dominantBaseline="middle" fill={wasteText} fontSize={7} fontFamily={fontFam}
                  transform={`rotate(-90, ${wcx}, ${wcy})`}>{f(wasteLen)}</text>
              ) : (
                <text x={wcx} y={wcy} textAnchor="middle" dominantBaseline="middle" fill={wasteText} fontSize={8} fontFamily={fontFam}>{f(wasteLen)}</text>
              )}
            </g>);
          })()}
          <VDim x={0} y1={0} y2={stripH} label={f(strip.ripDim)} color={dim} fontFam={fontFam} right={false} />
          <HDim x1={0} x2={stripW} y={stripH} label={`${f(usedW)} of ${f(SHEET_W)}`} color={dim} fontFam={fontFam} />
        </g>
      </svg>
    </div>
  );
}

// ─── Sheet Steps (2-col layout) ───
function SheetSteps({ sheet, sheetNum, sheetLabel, scale, theme }) {
  const { heading, fontFam, isBP, card } = theme;
  const sn = sheetLabel ? sheetLabel.replace(/[^0-9]/g, "") || sheetNum : sheetNum;
  const stripKey = (s) => s.panels.map((p) => `${p.type}:${p.crossDim.toFixed(2)}`).join("|");
  const groups = [];
  const seen = {};
  sheet.strips.forEach((strip, si) => {
    const key = stripKey(strip);
    if (seen[key] !== undefined) groups[seen[key]].indices.push(si);
    else { seen[key] = groups.length; groups.push({ strip, indices: [si] }); }
  });

  return (
    <div className="print-sheet" style={{ background: card, borderRadius: 8, padding: "12px 14px", marginBottom: 16, border: isBP ? "1px solid #1a3a5c" : "1px solid #ddd" }}>
      <h3 style={{ fontSize: 13, fontWeight: 700, color: heading, fontFamily: fontFam, margin: "0 0 8px" }}>
        {sheetLabel || `Sheet ${sheetNum}`}
        {sheet.isScrap && <span style={{ fontWeight: 400, fontSize: 11, color: theme.wasteText, marginLeft: 6 }}>(scrap: {sheet.scrapLabel})</span>}
      </h3>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, alignItems: "start" }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: heading, fontFamily: fontFam, marginBottom: 4 }}>Step 1 — Rip</div>
          <RipStep sheet={sheet} sheetNum={sn} scale={scale} theme={theme} />
        </div>
        {groups.map((g, gi) => {
          const ids = g.indices.map((i) => `${sn}-${String.fromCharCode(65 + i)}`);
          const stripLabel = ids.join(", ");
          return (
            <div key={gi}>
              <div style={{ fontSize: 11, fontWeight: 600, color: heading, fontFamily: fontFam, marginBottom: 4 }}>
                Step {gi + 2} — Crosscut {stripLabel}
              </div>
              <CrosscutStep strip={g.strip} stripLabel={stripLabel} scale={scale} theme={theme} identicalCount={g.indices.length} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Cut List (summary + per-cabinet) ───
function CutList({ panels, mode }) {
  const isBP = mode === "screen";
  const f = fmtDim;
  const [view, setView] = useState("cabinet");
  const typeLabels = { side: "Side", topbot: "Top/Bot", back: "Back", stringer: "Stringer" };
  const thS = { textAlign: "left", padding: "6px 10px", fontSize: 11, fontWeight: 600, borderBottom: isBP ? "1px solid #1a3a5c" : "2px solid #ddd", color: isBP ? "#6ab0ff" : "#333", fontFamily: isBP ? "monospace" : "inherit" };
  const tdS = { padding: "4px 10px", fontSize: 12, borderBottom: isBP ? "1px solid #111d2e" : "1px solid #eee", color: isBP ? "#c0d8f0" : "#444", fontFamily: isBP ? "monospace" : "inherit" };
  const btnS = (active) => ({ padding: "4px 12px", fontSize: 11, fontWeight: 600, background: active ? (isBP ? "#1a3a5c" : "#e0e0e0") : "none", border: isBP ? "1px solid #1a3a5c" : "1px solid #ccc", borderRadius: 4, color: isBP ? "#c0d8f0" : "#333", cursor: "pointer", fontFamily: isBP ? "monospace" : "inherit" });

  const byCab = {};
  panels.forEach((p) => { const c = p.cab || "?"; if (!byCab[c]) byCab[c] = []; byCab[c].push(p); });

  const types = {};
  panels.forEach((p) => {
    const key = `${p.crossDim.toFixed(3)}x${p.ripDim.toFixed(3)}_${p.type}_${p.thickness}`;
    if (!types[key]) types[key] = { crossDim: p.crossDim, ripDim: p.ripDim, type: p.type, count: 0, thickness: p.thickness };
    types[key].count++;
  });
  const summaryRows = Object.values(types).sort((a, b) => b.crossDim * b.ripDim - a.crossDim * a.ripDim);

  return (
    <div>
      <div className="no-print" style={{ display: "flex", gap: 6, marginBottom: 8 }}>
        <button onClick={() => setView("cabinet")} style={btnS(view === "cabinet")}>By Cabinet</button>
        <button onClick={() => setView("summary")} style={btnS(view === "summary")}>Summary</button>
      </div>
      {view === "cabinet" ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 10 }}>
          {Object.entries(byCab).map(([cab, pnls]) => (
            <div key={cab} style={{ background: isBP ? "#0a1525" : "#fff", borderRadius: 6, border: isBP ? "1px solid #1a3a5c" : "1px solid #ddd", padding: "8px 10px" }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: isBP ? "#6ab0ff" : "#333", fontFamily: isBP ? "monospace" : "inherit", marginBottom: 6 }}>{cab}</div>
              {pnls.map((p, i) => (
                <div key={i} style={{ fontSize: 11, color: isBP ? "#c0d8f0" : "#444", fontFamily: isBP ? "monospace" : "inherit", padding: "2px 0", borderBottom: i < pnls.length - 1 ? (isBP ? "1px solid #111d2e" : "1px solid #f0f0f0") : "none" }}>
                  <span style={{ fontWeight: 600 }}>{p.label}</span> — {f(p.crossDim)} × {f(p.ripDim)}
                </div>
              ))}
            </div>
          ))}
        </div>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", background: isBP ? "#0a1525" : "#fff", borderRadius: 6 }}>
          <thead><tr><th style={thS}>Type</th><th style={thS}>Dimensions</th><th style={thS}>Stock</th><th style={thS}>Qty</th><th style={thS}>Sq Ft</th></tr></thead>
          <tbody>{summaryRows.map((r, i) => (
            <tr key={i}>
              <td style={tdS}>{typeLabels[r.type] || r.type}</td>
              <td style={tdS}>{f(r.crossDim)} × {f(r.ripDim)}</td>
              <td style={tdS}>{nominalSize(r.thickness)}</td>
              <td style={tdS}>{r.count}</td>
              <td style={tdS}>{((r.crossDim * r.ripDim * r.count) / 144).toFixed(2)}</td>
            </tr>
          ))}</tbody>
        </table>
      )}
    </div>
  );
}

// ─── Scrap Inventory ───
function ScrapInventoryUI({ scrap, setScrap, waste, theme }) {
  const { isBP, card, heading, fontFam, accent, text: textColor, wasteText } = theme;
  const f = fmtDim;
  const [addW, setAddW] = useState("");
  const [addH, setAddH] = useState("");
  const inputS = { width: 60, padding: "4px 8px", fontSize: 13, background: isBP ? "#111d2e" : "#fff", border: isBP ? "1px solid #1a3a5c" : "1px solid #ccc", borderRadius: 4, color: isBP ? "#c0d8f0" : "#222", fontFamily: fontFam };
  const btnS = { padding: "4px 12px", fontSize: 12, fontWeight: 600, background: "none", border: `1px solid ${accent}`, borderRadius: 4, color: accent, cursor: "pointer", fontFamily: fontFam };
  const delS = { ...btnS, border: `1px solid ${wasteText}`, color: wasteText, padding: "2px 8px", fontSize: 11 };

  const addCustom = () => {
    const w = parseFloat(addW), h = parseFloat(addH);
    if (w > 0 && h > 0) {
      setScrap((s) => [...s, { id: Date.now(), w, h, label: `Custom ${s.length + 1}`, source: "Manual" }]);
      setAddW(""); setAddH("");
    }
  };
  const saveWaste = () => {
    if (waste.length > 0) {
      setScrap((s) => {
        const nextId = s.length > 0 ? Math.max(...s.map((x) => x.id)) + 1 : 1;
        return [...s, ...waste.map((w, i) => ({ ...w, id: nextId + i, label: `Scrap ${nextId + i}` }))];
      });
    }
  };

  return (
    <div style={{ background: card, borderRadius: 8, padding: "16px 18px", marginBottom: 28, border: isBP ? "1px solid #1a3a5c" : "1px solid #ddd" }}>
      <h2 style={{ fontSize: 16, fontWeight: 600, color: heading, fontFamily: fontFam, margin: "0 0 12px" }}>Scrap Inventory</h2>
      {waste.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: wasteText, fontFamily: fontFam, marginBottom: 6 }}>Waste from current cuts:</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
            {waste.map((w) => (
              <span key={w.id} style={{ padding: "3px 8px", borderRadius: 4, fontSize: 11, fontFamily: fontFam, background: isBP ? "#1a1020" : "#fdf4f4", border: isBP ? "1px solid #3a2050" : "1px solid #e8d0d0", color: wasteText }}>
                {f(w.w)} × {f(w.h)} <span style={{ opacity: 0.6 }}>({w.source})</span>
              </span>
            ))}
          </div>
          <button onClick={saveWaste} style={btnS}>Save waste to inventory</button>
        </div>
      )}
      {scrap.length > 0 ? (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: textColor, fontFamily: fontFam, marginBottom: 6 }}>Saved scrap pieces:</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {scrap.map((s) => (
              <span key={s.id} style={{ padding: "3px 8px", borderRadius: 4, fontSize: 11, fontFamily: fontFam, background: isBP ? "#0a1a10" : "#f4fdf4", border: isBP ? "1px solid #1a3a2a" : "1px solid #d0e8d0", color: isBP ? "#70d88c" : "#2d8a48", display: "inline-flex", alignItems: "center", gap: 6 }}>
                {s.label}: {f(s.w)} × {f(s.h)}
                <button onClick={() => setScrap((inv) => inv.filter((x) => x.id !== s.id))} style={{ ...delS, padding: "0 4px", lineHeight: 1 }}>×</button>
              </span>
            ))}
          </div>
        </div>
      ) : (
        <div style={{ fontSize: 12, color: isBP ? "#4a6a8a" : "#888", fontFamily: fontFam, marginBottom: 14 }}>No saved scrap. Save waste from cuts or add custom pieces.</div>
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 12, color: textColor, fontFamily: fontFam }}>Add:</span>
        <input type="number" placeholder="W" value={addW} onChange={(e) => setAddW(e.target.value)} onFocus={selectOnFocus} style={inputS} min={1} step={0.5} />
        <span style={{ color: textColor }}>×</span>
        <input type="number" placeholder="H" value={addH} onChange={(e) => setAddH(e.target.value)} onFocus={selectOnFocus} style={inputS} min={1} step={0.5} />
        <button onClick={addCustom} style={btnS}>Add</button>
      </div>
    </div>
  );
}

// ─── Fractional input (whole + 1/16 fraction) ───
function FracInput({ value, onChange, label, theme, min = 0, max = 200 }) {
  const { isBP, fontFam } = theme;
  const whole = Math.floor(value);
  const fi = nearestFrac(value - whole, FRACS16);
  const inpS = { width: 50, padding: "5px 6px", fontSize: 13, background: isBP ? "#111d2e" : "#fff", border: isBP ? "1px solid #1a3a5c" : "1px solid #ccc", borderRadius: 4, color: isBP ? "#c0d8f0" : "#222", fontFamily: fontFam, textAlign: "center" };
  const selS = { ...inpS, width: 60, textAlign: "left", cursor: "pointer" };
  const labS = { fontSize: 12, color: isBP ? "#6a8aaa" : "#555", fontFamily: fontFam, display: "block", marginBottom: 4 };
  const set = (w, f) => onChange(Math.max(min, Math.min(max, w + FRACS16[f])));
  return (
    <div>
      <label style={labS}>{label}</label>
      <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
        <input type="number" value={whole} onChange={(e) => set(Math.max(0, +e.target.value), fi)} onFocus={selectOnFocus} style={inpS} min={0} />
        <select value={fi} onChange={(e) => set(whole, +e.target.value)} style={selS}>
          {FRAC16_LABELS.map((l, i) => <option key={i} value={i}>{l === "0" ? "—" : l}</option>)}
        </select>
        <span style={{ fontSize: 11, color: isBP ? "#4a6a8a" : "#888", fontFamily: fontFam }}>"</span>
      </div>
    </div>
  );
}

// ─── Fractional input 1/64 precision (for stock thickness) ───
function FracInput64({ value, onChange, label, theme }) {
  const { isBP, fontFam } = theme;
  const whole = Math.floor(value);
  const fi = nearestFrac(value - whole, FRACS64);
  const inpS = { width: 40, padding: "5px 4px", fontSize: 13, background: isBP ? "#111d2e" : "#fff", border: isBP ? "1px solid #1a3a5c" : "1px solid #ccc", borderRadius: 4, color: isBP ? "#c0d8f0" : "#222", fontFamily: fontFam, textAlign: "center" };
  const selS = { ...inpS, width: 70, textAlign: "left", cursor: "pointer" };
  const labS = { fontSize: 12, color: isBP ? "#6a8aaa" : "#555", fontFamily: fontFam, display: "block", marginBottom: 4 };
  return (
    <div>
      <label style={labS}>{label}</label>
      <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
        <input type="number" value={whole} onChange={(e) => onChange(Math.max(0, +e.target.value) + FRACS64[fi])} onFocus={selectOnFocus} style={inpS} min={0} />
        <select value={fi} onChange={(e) => onChange(whole + FRACS64[+e.target.value])} style={selS}>
          {FRAC64_LABELS.map((l, i) => <option key={i} value={i}>{l === "0" ? "—" : l}</option>)}
        </select>
        <span style={{ fontSize: 11, color: isBP ? "#4a6a8a" : "#888", fontFamily: fontFam }}>"</span>
      </div>
    </div>
  );
}

// ─── Toggle ───
function Toggle({ value, onChange, label, theme }) {
  const { isBP, fontFam, accent } = theme;
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13, color: isBP ? "#c0d8f0" : "#333", fontFamily: fontFam }}>
      <div onClick={() => onChange(!value)} style={{
        width: 36, height: 20, borderRadius: 10, background: value ? accent : (isBP ? "#1a3a5c" : "#ccc"),
        position: "relative", transition: "background 0.15s", cursor: "pointer",
      }}>
        <div style={{ width: 16, height: 16, borderRadius: 8, background: "#fff", position: "absolute", top: 2, left: value ? 18 : 2, transition: "left 0.15s" }} />
      </div>
      {label}
    </label>
  );
}

// ─── Cabinet Group Row ───
function CabGroupRow({ grp, groupLabel, onChange, onRemove, canRemove, theme }) {
  const { isBP, fontFam, accent, wasteText } = theme;
  const rowS = { display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-end", padding: "8px 10px", background: isBP ? "#0a1525" : "#f8f8f8", borderRadius: 6, border: isBP ? "1px solid #1a3a5c" : "1px solid #e0e0e0", marginBottom: 6 };
  const inputS = { width: 50, padding: "5px 6px", fontSize: 13, background: isBP ? "#111d2e" : "#fff", border: isBP ? "1px solid #1a3a5c" : "1px solid #ccc", borderRadius: 4, color: isBP ? "#c0d8f0" : "#222", fontFamily: fontFam, textAlign: "center" };
  const labS = { fontSize: 11, color: isBP ? "#6a8aaa" : "#555", fontFamily: fontFam, display: "block", marginBottom: 3 };
  const set = (key, val) => onChange({ ...grp, [key]: val });

  const smallInputS = { ...inputS, width: 40 };
  const hintS = { fontSize: 9, color: isBP ? "#4a6a8a" : "#999", fontFamily: fontFam, marginTop: 2 };
  const divide = grp.qty || 1;
  const mult = grp.mult || 1;

  return (
    <div style={rowS}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 28, height: 28, borderRadius: 4, background: isBP ? "#1a3a5c" : "#ddd", color: isBP ? "#6ab0ff" : "#333", fontSize: 14, fontWeight: 700, fontFamily: fontFam, alignSelf: "flex-end", marginBottom: 2 }}>{groupLabel}</div>
      <FracInput value={grp.w} onChange={(v) => set("w", v)} label="Space W" theme={theme} min={1} />
      <FracInput value={grp.h} onChange={(v) => set("h", v)} label="Height" theme={theme} min={1} />
      <FracInput value={grp.d} onChange={(v) => set("d", v)} label="Depth" theme={theme} min={1} />
      <div>
        <label style={labS}>÷ Cabs</label>
        <input type="number" value={divide} onChange={(e) => set("qty", Math.max(1, +e.target.value))} onFocus={selectOnFocus} style={smallInputS} min={1} max={50} />
      </div>
      <div>
        <label style={labS}>× Sets</label>
        <input type="number" value={mult} onChange={(e) => set("mult", Math.max(1, +e.target.value))} onFocus={selectOnFocus} style={smallInputS} min={1} max={20} />
      </div>
      <div style={{ alignSelf: "flex-end", marginBottom: 4 }}>
        <span style={hintS}>= {divide * mult} cabs</span>
      </div>
      {canRemove && (
        <button onClick={onRemove} style={{ padding: "4px 10px", fontSize: 11, fontWeight: 600, background: "none", border: `1px solid ${wasteText}`, borderRadius: 4, color: wasteText, cursor: "pointer", fontFamily: fontFam, alignSelf: "flex-end" }}>Remove</button>
      )}
    </div>
  );
}

// ─── Project persistence ───
const STORAGE_KEY = "plycalc_projects";
const DEFAULT_PROJECT = {
  name: "Untitled",
  cabGroups: [{ id: 1, w: 60, h: 24, d: 23.5, qty: 3, mult: 1 }],
  stockT: 45 / 64,
  backStockT: 1 / 4,
  kerf: DEFAULT_KERF,
  fullTop: false,
  fullBack: false,
  fullBackCov: false,
  stringerTopW: 4,
  stringerBackW: 4,
  useScrap: false,
  scrapInventory: [],
};

const hasStorage = (() => { try { localStorage.setItem("__test", "1"); localStorage.removeItem("__test"); return true; } catch { return false; } })();
function loadProjects() {
  if (!hasStorage) return [];
  try { const raw = localStorage.getItem(STORAGE_KEY); return raw ? JSON.parse(raw) : []; }
  catch { return []; }
}
function saveProjects(projects) {
  if (!hasStorage) return;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(projects)); } catch {}
}

// ─── Main App ───
export default function PlywoodCalculator() {
  const [projects, setProjects] = useState(() => loadProjects());
  const [activeId, setActiveId] = useState(null); // null = unsaved new project
  const [projectName, setProjectName] = useState("Untitled");
  const [cabGroups, setCabGroups] = useState([
    { id: 1, w: 60, h: 24, d: 23.5, qty: 3, mult: 1 },
  ]);
  const [stockT, setStockT] = useState(45 / 64);
  const [backStockT, setBackStockT] = useState(1 / 4);
  const [kerf, setKerf] = useState(DEFAULT_KERF);
  const [fullTop, setFullTop] = useState(false);
  const [fullBack, setFullBack] = useState(false);
  const [fullBackCov, setFullBackCov] = useState(false);
  const [stringerTopW, setStringerTopW] = useState(4);
  const [stringerBackW, setStringerBackW] = useState(4);
  const [useScrap, setUseScrap] = useState(false);
  const [scrapInventory, setScrapInventory] = useState([]);
  const [isPrintMode, setIsPrintMode] = useState(false);
  const printRef = useRef(null);

  // Sync projects list to localStorage
  useEffect(() => { saveProjects(projects); }, [projects]);

  const getProjectState = () => ({
    name: projectName, cabGroups, stockT, backStockT, kerf,
    fullTop, fullBack, fullBackCov, stringerTopW, stringerBackW, useScrap, scrapInventory,
  });

  const applyProject = (proj) => {
    setProjectName(proj.name || "Untitled");
    setCabGroups(proj.cabGroups || DEFAULT_PROJECT.cabGroups);
    setStockT(proj.stockT ?? DEFAULT_PROJECT.stockT);
    setBackStockT(proj.backStockT ?? DEFAULT_PROJECT.backStockT);
    setKerf(proj.kerf ?? DEFAULT_KERF);
    setFullTop(proj.fullTop ?? false);
    setFullBack(proj.fullBack ?? false);
    setFullBackCov(proj.fullBackCov ?? false);
    setStringerTopW(proj.stringerTopW ?? 4);
    setStringerBackW(proj.stringerBackW ?? 4);
    setUseScrap(proj.useScrap ?? false);
    setScrapInventory(proj.scrapInventory || []);
  };

  const handleSave = () => {
    const state = getProjectState();
    if (activeId) {
      setProjects((ps) => ps.map((p) => p.id === activeId ? { ...state, id: activeId, savedAt: Date.now() } : p));
    } else {
      const id = Date.now();
      setProjects((ps) => [...ps, { ...state, id, savedAt: Date.now() }]);
      setActiveId(id);
    }
  };

  const handleLoad = (id) => {
    const proj = projects.find((p) => p.id === id);
    if (proj) { applyProject(proj); setActiveId(id); }
  };

  const handleNew = () => {
    applyProject(DEFAULT_PROJECT);
    setActiveId(null);
  };

  const handleDelete = (id) => {
    setProjects((ps) => ps.filter((p) => p.id !== id));
    if (activeId === id) setActiveId(null);
  };

  const updateGroup = (id, grp) => setCabGroups((gs) => gs.map((g) => g.id === id ? grp : g));
  const removeGroup = (id) => setCabGroups((gs) => gs.filter((g) => g.id !== id));
  const addGroup = () => setCabGroups((gs) => [...gs, { id: Date.now(), w: 30, h: 24, d: 23.5, qty: 3, mult: 1 }]);

  const totalCabinets = cabGroups.reduce((a, g) => a + (g.qty || 1) * (g.mult || 1), 0);

  const panels = useMemo(() => generatePanelList({
    cabGroups, fullTop, fullBack, fullBackCov, backStockT, stringerTopW, stringerBackW, stockT, kerf,
  }), [cabGroups, fullTop, fullBack, fullBackCov, backStockT, stringerTopW, stringerBackW, stockT, kerf]);

  const thickGroups = useMemo(() => {
    const g = {};
    panels.forEach((p) => { const key = p.thickness.toFixed(4); if (!g[key]) g[key] = []; g[key].push(p); });
    return g;
  }, [panels]);

  const packedByThick = useMemo(() => {
    const result = {};
    for (const [thick, pnls] of Object.entries(thickGroups)) {
      const scrap = useScrap ? scrapInventory.filter(() => true) : [];
      result[thick] = stripPack(pnls, SHEET_W, SHEET_H, kerf, scrap);
    }
    return result;
  }, [thickGroups, useScrap, scrapInventory, kerf]);

  const allSheets = useMemo(() => Object.entries(packedByThick).flatMap(([thick, sheets]) => sheets.map((s) => ({ ...s, thickness: parseFloat(thick) }))), [packedByThick]);
  const allWaste = useMemo(() => collectWaste(allSheets, SHEET_W, SHEET_H), [allSheets]);

  const mainSheets = allSheets.filter((s) => Math.abs(s.thickness - stockT) < 0.01 && !s.isScrap);
  const scrapSheets = allSheets.filter((s) => s.isScrap);
  const backSheets = allSheets.filter((s) => Math.abs(s.thickness - stockT) >= 0.01 && !s.isScrap);
  const totalSqFt = panels.reduce((a, p) => a + (p.crossDim * p.ripDim) / 144, 0);

  const scale = isPrintMode ? 2.6 : 3.0;
  const mode = isPrintMode ? "print" : "screen";
  const theme = getTheme(mode);
  const { bg, text: textColor, heading: headingColor, accent: accentColor, card: cardBg, fontFam } = theme;

  const handlePrint = useCallback(() => {
    setIsPrintMode(true);
    setTimeout(() => { window.print(); setTimeout(() => setIsPrintMode(false), 500); }, 200);
  }, []);

  const inputStyle = { width: 80, padding: "6px 10px", fontSize: 14, background: isPrintMode ? "#fff" : "#111d2e", border: isPrintMode ? "1px solid #ccc" : "1px solid #1a3a5c", borderRadius: 4, color: isPrintMode ? "#222" : "#c0d8f0", fontFamily: fontFam };
  const labelStyle = { fontSize: 12, color: isPrintMode ? "#555" : "#6a8aaa", fontFamily: fontFam, display: "block", marginBottom: 4 };


  const isInset = backStockT >= 0.7;

  const thickLabel = (t) => nominalSize(t);

  return (
    <div ref={printRef} style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", background: bg, minHeight: "100vh", padding: "24px 20px", color: textColor }}>
      <style>{`@media print { body { background: #fff !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; } .no-print { display: none !important; } .print-section-break { page-break-before: always; } .print-sheet { break-inside: avoid; page-break-inside: avoid; } } input[type=number]::-webkit-inner-spin-button { opacity: 1; }`}</style>

      <div style={{ maxWidth: 960, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: headingColor, margin: 0, fontFamily: fontFam }}>Plywood Cut Calculator</h1>
            <p style={{ fontSize: 13, color: isPrintMode ? "#888" : "#4a6a8a", margin: "4px 0 0", fontFamily: fontFam }}>Tracksaw rip → MFT crosscut workflow</p>
          </div>
          <button className="no-print" onClick={handlePrint} style={{ padding: "8px 18px", fontSize: 13, fontWeight: 600, background: "none", border: `1px solid ${accentColor}`, borderRadius: 4, color: accentColor, cursor: "pointer", fontFamily: fontFam }}>Print Cut Sheets</button>
        </div>

        {/* Project Bar */}
        <div className="no-print" style={{ background: cardBg, borderRadius: 8, padding: "12px 16px", marginBottom: 16, border: isPrintMode ? "1px solid #ddd" : "1px solid #1a3a5c", display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
          <input
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            placeholder="Project name"
            style={{ width: 160, padding: "5px 8px", fontSize: 13, fontWeight: 600, background: isPrintMode ? "#fff" : "#111d2e", border: isPrintMode ? "1px solid #ccc" : "1px solid #1a3a5c", borderRadius: 4, color: isPrintMode ? "#222" : "#c0d8f0", fontFamily: fontFam }}
          />
          <button onClick={handleSave} style={{ padding: "5px 14px", fontSize: 12, fontWeight: 600, background: accentColor, border: "none", borderRadius: 4, color: "#fff", cursor: "pointer", fontFamily: fontFam }}>
            {activeId ? "Save" : "Save New"}
          </button>
          <button onClick={handleNew} style={{ padding: "5px 14px", fontSize: 12, fontWeight: 600, background: "none", border: `1px solid ${accentColor}`, borderRadius: 4, color: accentColor, cursor: "pointer", fontFamily: fontFam }}>
            New
          </button>
          {projects.length > 0 && (
            <select
              value={activeId || ""}
              onChange={(e) => { if (e.target.value) handleLoad(+e.target.value); }}
              style={{ padding: "5px 8px", fontSize: 12, background: isPrintMode ? "#fff" : "#111d2e", border: isPrintMode ? "1px solid #ccc" : "1px solid #1a3a5c", borderRadius: 4, color: isPrintMode ? "#222" : "#c0d8f0", fontFamily: fontFam, cursor: "pointer" }}
            >
              <option value="">Load project...</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name || "Untitled"}</option>
              ))}
            </select>
          )}
          {activeId && (
            <button onClick={() => handleDelete(activeId)} style={{ padding: "5px 10px", fontSize: 11, fontWeight: 600, background: "none", border: `1px solid ${theme.wasteText}`, borderRadius: 4, color: theme.wasteText, cursor: "pointer", fontFamily: fontFam }}>
              Delete
            </button>
          )}
          {activeId && <span style={{ fontSize: 11, color: isPrintMode ? "#888" : "#4a6a8a", fontFamily: fontFam }}>Saved</span>}
        </div>

        {/* Input Form */}
        <div className="no-print" style={{ background: cardBg, borderRadius: 8, padding: 20, marginBottom: 28, border: isPrintMode ? "1px solid #ddd" : "1px solid #1a3a5c" }}>
          {/* Row 1: Stock thickness + kerf */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "flex-end", marginBottom: 14 }}>
            <FracInput64 value={stockT} onChange={setStockT} label="Cabinet Stock (actual)" theme={theme} />
            <FracInput64 value={backStockT} onChange={setBackStockT} label="Back Stock (actual)" theme={theme} />
            <FracInput64 value={kerf} onChange={setKerf} label="Kerf" theme={theme} />
          </div>

          {/* Cabinet groups */}
          <div style={{ marginBottom: 14, paddingTop: 14, borderTop: isPrintMode ? "1px solid #ddd" : "1px solid #1a3a5c" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: headingColor, fontFamily: fontFam }}>Cabinets</div>
              <button onClick={addGroup} style={{ padding: "4px 12px", fontSize: 11, fontWeight: 600, background: "none", border: `1px solid ${accentColor}`, borderRadius: 4, color: accentColor, cursor: "pointer", fontFamily: fontFam }}>+ Add Group</button>
            </div>
            {cabGroups.map((grp, gi) => (
              <CabGroupRow key={grp.id} grp={grp} groupLabel={String.fromCharCode(65 + gi)} onChange={(g) => updateGroup(grp.id, g)} onRemove={() => removeGroup(grp.id)} canRemove={cabGroups.length > 1} theme={theme} />
            ))}
          </div>

          {/* Row 3: Toggles */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 20, alignItems: "center", paddingTop: 14, borderTop: isPrintMode ? "1px solid #ddd" : "1px solid #1a3a5c" }}>
            <Toggle value={fullTop} onChange={setFullTop} label="Full Top" theme={theme} />
            <Toggle value={fullBack} onChange={setFullBack} label="Full Back" theme={theme} />
            {fullBack && (
              <>
                <span style={{ fontSize: 11, color: isPrintMode ? "#888" : "#4a6a8a", fontFamily: fontFam }}>
                  {fmtRaw(backStockT)} {backStockT >= 0.7 ? "(inset)" : "(outside)"}
                </span>
                <Toggle value={fullBackCov} onChange={setFullBackCov} label="Full Coverage" theme={theme} />
                {!fullBackCov && (
                  <span style={{ fontSize: 11, color: isPrintMode ? "#888" : "#4a6a8a", fontFamily: fontFam }}>
                    back H: {fmtDim(rd16(cabGroups[0]?.h - kerf / 2))}
                  </span>
                )}
              </>
            )}
            <Toggle value={useScrap} onChange={setUseScrap} label="Use Scrap" theme={theme} />
          </div>
          {/* Stringer widths (only when not full top/back) */}
          {(!fullTop || !fullBack) && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "flex-end", marginTop: 12 }}>
              {!fullTop && <FracInput value={stringerTopW} onChange={setStringerTopW} label="Top Stringer W" theme={theme} min={1} max={12} />}
              {!fullBack && <FracInput value={stringerBackW} onChange={setStringerBackW} label="Back Stringer W" theme={theme} min={1} max={12} />}
            </div>
          )}
        </div>

        {/* Summary */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 16, marginBottom: 16, fontSize: 13, color: textColor, fontFamily: fontFam }}>
          <span><strong style={{ color: accentColor }}>{totalCabinets}</strong> cabinets</span>
          <span><strong style={{ color: accentColor }}>{panels.length}</strong> panels</span>
          {scrapSheets.length > 0 && <span><strong style={{ color: accentColor }}>{scrapSheets.length}</strong> scrap used</span>}
        </div>

        {/* Shopping List */}
        <div style={{ background: cardBg, borderRadius: 8, padding: "16px 20px", marginBottom: 28, border: isPrintMode ? "1px solid #ddd" : "1px solid #1a3a5c" }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: headingColor, fontFamily: fontFam, marginBottom: 12 }}>Shopping List</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", fontSize: 13, color: textColor, fontFamily: fontFam }}>
              <input type="checkbox" style={{ width: 16, height: 16, accentColor: accentColor }} />
              <span><strong>{mainSheets.length}×</strong> {thickLabel(stockT)} Plywood <span style={{ fontSize: 11, color: isPrintMode ? "#888" : "#4a6a8a" }}>(4×8 sheets)</span></span>
            </label>
            {backSheets.length > 0 && (
              <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", fontSize: 13, color: textColor, fontFamily: fontFam }}>
                <input type="checkbox" style={{ width: 16, height: 16, accentColor: accentColor }} />
                <span><strong>{backSheets.length}×</strong> {thickLabel(backSheets[0]?.thickness)} Plywood <span style={{ fontSize: 11, color: isPrintMode ? "#888" : "#4a6a8a" }}>(4×8 sheets)</span></span>
              </label>
            )}
          </div>
        </div>

        {/* Cabinet Reference — per group */}
        <div style={{ background: cardBg, borderRadius: 8, padding: "16px 20px", marginBottom: 28, border: isPrintMode ? "1px solid #ddd" : "1px solid #1a3a5c" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: headingColor, fontFamily: fontFam }}>Cabinet Reference</div>
            <span style={{ fontSize: 11, color: isPrintMode ? "#888" : "#4a6a8a", fontFamily: fontFam }}>Pocket hole · Stock: {nominalSize(stockT)} ({fmtRaw(stockT)}){fullBack ? ` · Back: ${nominalSize(backStockT)} (${fmtRaw(backStockT)})${!isInset ? " (outside)" : " (inset)"}` : ""}</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: cabGroups.length === 1 ? "1fr" : "1fr 1fr", gap: 12 }}>
            {cabGroups.map((grp, gi) => {
              const gl = String.fromCharCode(65 + gi);
              const fd = fmtDim;
              const divide = grp.qty || 1;
              const mult = grp.mult || 1;
              const totalCabs = divide * mult;
              const cabW = rd16(grp.w / divide);
              const tbW = rd16(cabW - 2 * stockT);
              const boxD = rd16(fullBack && !isInset ? grp.d - backStockT : grp.d);
              return (
                <div key={grp.id} style={{ display: "flex", alignItems: "center", gap: 14, padding: "10px 12px", background: isPrintMode ? "#f8f8f8" : "#0a1525", borderRadius: 6, border: isPrintMode ? "1px solid #e0e0e0" : "1px solid #1a3a5c" }}>
                  <CabinetReference isBP={!isPrintMode} depth={grp.d} spaceH={grp.h} cabinetW={cabW} tbW={tbW} fontFam={fontFam} fullTop={fullTop} fullBack={fullBack} />
                  <div style={{ fontSize: 11, color: textColor, fontFamily: fontFam, lineHeight: 1.9 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: headingColor, fontFamily: fontFam, marginBottom: 4 }}>Group {gl} <span style={{ fontWeight: 400, fontSize: 11, color: isPrintMode ? "#888" : "#4a6a8a" }}>×{totalCabs}</span> <span style={{ fontWeight: 400, fontSize: 11, color: isPrintMode ? "#888" : "#4a6a8a" }}>({fd(cabW)} ea)</span></div>
                    <div><span style={{ color: isPrintMode ? "#2a6db5" : "#6ab0ff" }}>Side</span> {fd(boxD)} × {fd(grp.h)}</div>
                    <div><span style={{ color: isPrintMode ? "#2d8a48" : "#70d88c" }}>{fullTop ? "Top/Bot" : "Bot"}</span> {fd(tbW)} × {fd(boxD)}</div>
                    {!fullTop && <div><span style={{ color: isPrintMode ? "#7050a0" : "#c090f0" }}>Top Str</span> {fd(tbW)} × {fd(stringerTopW)} ×2</div>}
                    {fullBack && <div><span style={{ color: isPrintMode ? "#9a7520" : "#e0c060" }}>Back</span> {fd(isInset ? tbW : cabW)} × {fd(fullBackCov ? grp.h : rd16(grp.h - kerf / 2))}</div>}
                    {!fullBack && <div><span style={{ color: isPrintMode ? "#7050a0" : "#c090f0" }}>Back Str</span> {fd(tbW)} × {fd(stringerBackW)} ×2</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Cut List */}
        <div style={{ marginBottom: 32 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, color: headingColor, fontFamily: fontFam, marginBottom: 10 }}>Cut List</h2>
          <CutList panels={panels} mode={mode} />
        </div>

        {scrapSheets.length > 0 && (
          <div style={{ marginBottom: 32 }}>
            <h2 style={{ fontSize: 16, fontWeight: 600, color: headingColor, fontFamily: fontFam, marginBottom: 14 }}>Scrap Sheets Used</h2>
            {scrapSheets.map((sheet, i) => (
              <SheetSteps key={`scrap-${i}`} sheet={sheet} sheetNum={i + 1} sheetLabel={`Scrap Sheet ${i + 1}`} scale={scale} theme={theme} />
            ))}
          </div>
        )}

        {mainSheets.length > 0 && (
          <div className="print-section-break" style={{ marginBottom: 32 }}>
            <h2 style={{ fontSize: 16, fontWeight: 600, color: headingColor, fontFamily: fontFam, marginBottom: 4 }}>{thickLabel(stockT)} Plywood — Step-by-Step Cuts</h2>
            <p style={{ fontSize: 12, color: isPrintMode ? "#888" : "#4a6a8a", fontFamily: fontFam, marginBottom: 14 }}>
              Rip first (tracksaw), then crosscuts per strip (MFT). Dims rounded down to 1/16".
            </p>
            {mainSheets.map((sheet, i) => (
              <SheetSteps key={i} sheet={sheet} sheetNum={i + 1} scale={scale} theme={theme} />
            ))}
          </div>
        )}

        {backSheets.length > 0 && (
          <div className="print-section-break" style={{ marginBottom: 32 }}>
            <h2 style={{ fontSize: 16, fontWeight: 600, color: headingColor, fontFamily: fontFam, marginBottom: 4 }}>
              {thickLabel(backSheets[0]?.thickness)} Plywood — Back Panels
            </h2>
            <p style={{ fontSize: 12, color: isPrintMode ? "#888" : "#4a6a8a", fontFamily: fontFam, marginBottom: 14 }}>Thinner stock for cabinet backs.</p>
            {backSheets.map((sheet, i) => (
              <SheetSteps key={i} sheet={sheet} sheetNum={mainSheets.length + i + 1} scale={scale} theme={theme} />
            ))}
          </div>
        )}

        <div className="no-print">
          <ScrapInventoryUI scrap={scrapInventory} setScrap={setScrapInventory} waste={allWaste} theme={theme} />
        </div>

        <div style={{ display: "flex", gap: 20, flexWrap: "wrap", padding: "12px 0", borderTop: isPrintMode ? "1px solid #ddd" : "1px solid #1a3a5c", fontSize: 12, color: isPrintMode ? "#555" : "#4a6a8a", fontFamily: fontFam }}>
          {[
            { color: isPrintMode ? "#2a6db5" : "#4A90D9", label: "Side Panels" },
            { color: isPrintMode ? "#2d8a48" : "#50B86C", label: "Top/Bottom" },
            { color: isPrintMode ? "#7050a0" : "#a070d0", label: "Stringers" },
            { color: isPrintMode ? "#9a7520" : "#c8a03c", label: "Back Panels" },
            { color: isPrintMode ? "#cc0000" : "rgba(255,100,100,0.6)", label: "Rip Line", dash: true },
          ].map(({ color, label, dash }) => (
            <div key={label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              {dash ? <svg width={18} height={14}><line x1={0} y1={7} x2={18} y2={7} stroke={color} strokeWidth={1.5} strokeDasharray="4,3" /></svg>
                : <div style={{ width: 14, height: 14, borderRadius: 2, border: `2px solid ${color}` }} />}
              <span>{label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
