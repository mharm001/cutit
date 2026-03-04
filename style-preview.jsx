import { useState } from "react";

const SHEET_W = 96;
const SHEET_H = 48;
const SCALE = 3.2;

// Sample cut layout for preview
const samplePanels = [
  { x: 0, y: 0, w: 24, h: 23.5, label: "Side 1", type: "side" },
  { x: 24, y: 0, w: 24, h: 23.5, label: "Side 2", type: "side" },
  { x: 48, y: 0, w: 24, h: 23.5, label: "Side 3", type: "side" },
  { x: 72, y: 0, w: 24, h: 23.5, label: "Side 4", type: "side" },
  { x: 0, y: 23.5, w: 18.5, h: 23.5, label: "Top 1", type: "topbot" },
  { x: 18.5, y: 23.5, w: 18.5, h: 23.5, label: "Bot 1", type: "topbot" },
  { x: 37, y: 23.5, w: 18.5, h: 23.5, label: "Top 2", type: "topbot" },
  { x: 55.5, y: 23.5, w: 18.5, h: 23.5, label: "Bot 2", type: "topbot" },
];

// Style 1: Clean SVG with colors
function CleanStyle() {
  const colors = { side: "#4A90D9", topbot: "#50B86C", waste: "#E8E8E8" };
  return (
    <svg width={SHEET_W * SCALE + 2} height={SHEET_H * SCALE + 2} style={{ border: "1px solid #ccc", borderRadius: 4, background: "#fff" }}>
      <rect x={1} y={1} width={SHEET_W * SCALE} height={SHEET_H * SCALE} fill="#f5f5f0" stroke="#999" strokeWidth={1} />
      {samplePanels.map((p, i) => (
        <g key={i}>
          <rect
            x={p.x * SCALE + 1}
            y={p.y * SCALE + 1}
            width={p.w * SCALE}
            height={p.h * SCALE}
            fill={colors[p.type]}
            stroke="#fff"
            strokeWidth={1.5}
            opacity={0.85}
            rx={2}
          />
          <text
            x={(p.x + p.w / 2) * SCALE + 1}
            y={(p.y + p.h / 2) * SCALE - 4}
            textAnchor="middle"
            fill="#fff"
            fontSize={11}
            fontWeight="600"
          >
            {p.label}
          </text>
          <text
            x={(p.x + p.w / 2) * SCALE + 1}
            y={(p.y + p.h / 2) * SCALE + 10}
            textAnchor="middle"
            fill="rgba(255,255,255,0.8)"
            fontSize={9}
          >
            {p.w}" × {p.h}"
          </text>
        </g>
      ))}
      {/* Waste area */}
      <rect x={74 * SCALE + 1} y={23.5 * SCALE + 1} width={22 * SCALE} height={23.5 * SCALE} fill={colors.waste} stroke="#ccc" strokeWidth={1} strokeDasharray="4,3" />
      <text x={85 * SCALE + 1} y={35.25 * SCALE} textAnchor="middle" fill="#999" fontSize={10}>Waste</text>
      {/* Dimension labels on edges */}
      <text x={SHEET_W * SCALE / 2} y={SHEET_H * SCALE + 18} textAnchor="middle" fill="#666" fontSize={10}>96"</text>
      <text x={-SHEET_H * SCALE / 2} y={-8} textAnchor="middle" fill="#666" fontSize={10} transform="rotate(-90)">48"</text>
    </svg>
  );
}

// Style 2: Blueprint style
function BlueprintStyle() {
  return (
    <svg width={SHEET_W * SCALE + 2} height={SHEET_H * SCALE + 2} style={{ border: "1px solid #1a3a5c", borderRadius: 4, background: "#0d1b2a" }}>
      {/* Grid lines */}
      {Array.from({ length: 9 }, (_, i) => (
        <line key={`v${i}`} x1={(i * 12) * SCALE + 1} y1={1} x2={(i * 12) * SCALE + 1} y2={SHEET_H * SCALE + 1} stroke="#1a3a5c" strokeWidth={0.5} />
      ))}
      {Array.from({ length: 5 }, (_, i) => (
        <line key={`h${i}`} x1={1} y1={(i * 12) * SCALE + 1} x2={SHEET_W * SCALE + 1} y2={(i * 12) * SCALE + 1} stroke="#1a3a5c" strokeWidth={0.5} />
      ))}
      <rect x={1} y={1} width={SHEET_W * SCALE} height={SHEET_H * SCALE} fill="none" stroke="#4A90D9" strokeWidth={1.5} />
      {samplePanels.map((p, i) => (
        <g key={i}>
          <rect
            x={p.x * SCALE + 1}
            y={p.y * SCALE + 1}
            width={p.w * SCALE}
            height={p.h * SCALE}
            fill={p.type === "side" ? "rgba(74,144,217,0.15)" : "rgba(80,184,108,0.15)"}
            stroke={p.type === "side" ? "#4A90D9" : "#50B86C"}
            strokeWidth={1}
          />
          <text
            x={(p.x + p.w / 2) * SCALE + 1}
            y={(p.y + p.h / 2) * SCALE - 4}
            textAnchor="middle"
            fill={p.type === "side" ? "#6ab0ff" : "#70d88c"}
            fontSize={11}
            fontWeight="500"
            fontFamily="monospace"
          >
            {p.label}
          </text>
          <text
            x={(p.x + p.w / 2) * SCALE + 1}
            y={(p.y + p.h / 2) * SCALE + 10}
            textAnchor="middle"
            fill="rgba(255,255,255,0.5)"
            fontSize={9}
            fontFamily="monospace"
          >
            {p.w}" × {p.h}"
          </text>
        </g>
      ))}
      {/* Waste */}
      <rect x={74 * SCALE + 1} y={23.5 * SCALE + 1} width={22 * SCALE} height={23.5 * SCALE} fill="none" stroke="#ff4444" strokeWidth={0.5} strokeDasharray="6,3" />
      <text x={85 * SCALE + 1} y={35.25 * SCALE} textAnchor="middle" fill="#ff6666" fontSize={9} fontFamily="monospace">WASTE</text>
      <text x={SHEET_W * SCALE / 2} y={SHEET_H * SCALE + 18} textAnchor="middle" fill="#4A90D9" fontSize={10} fontFamily="monospace">96.000"</text>
      <text x={-SHEET_H * SCALE / 2} y={-8} textAnchor="middle" fill="#4A90D9" fontSize={10} fontFamily="monospace" transform="rotate(-90)">48.000"</text>
    </svg>
  );
}

// Style 3: Minimal line drawing
function MinimalStyle() {
  return (
    <svg width={SHEET_W * SCALE + 2} height={SHEET_H * SCALE + 2} style={{ border: "1px solid #333", borderRadius: 4, background: "#fff" }}>
      <rect x={1} y={1} width={SHEET_W * SCALE} height={SHEET_H * SCALE} fill="none" stroke="#000" strokeWidth={1.5} />
      {samplePanels.map((p, i) => (
        <g key={i}>
          <rect
            x={p.x * SCALE + 1}
            y={p.y * SCALE + 1}
            width={p.w * SCALE}
            height={p.h * SCALE}
            fill="none"
            stroke="#000"
            strokeWidth={1}
          />
          <text
            x={(p.x + p.w / 2) * SCALE + 1}
            y={(p.y + p.h / 2) * SCALE - 4}
            textAnchor="middle"
            fill="#000"
            fontSize={11}
            fontWeight="500"
          >
            {p.label}
          </text>
          <text
            x={(p.x + p.w / 2) * SCALE + 1}
            y={(p.y + p.h / 2) * SCALE + 10}
            textAnchor="middle"
            fill="#555"
            fontSize={9}
          >
            {p.w}" × {p.h}"
          </text>
        </g>
      ))}
      {/* Waste with crosshatch */}
      <rect x={74 * SCALE + 1} y={23.5 * SCALE + 1} width={22 * SCALE} height={23.5 * SCALE} fill="none" stroke="#000" strokeWidth={0.5} strokeDasharray="3,3" />
      <line x1={74 * SCALE + 1} y1={23.5 * SCALE + 1} x2={96 * SCALE + 1} y2={47 * SCALE + 1} stroke="#ccc" strokeWidth={0.5} />
      <line x1={96 * SCALE + 1} y1={23.5 * SCALE + 1} x2={74 * SCALE + 1} y2={47 * SCALE + 1} stroke="#ccc" strokeWidth={0.5} />
      <text x={85 * SCALE + 1} y={35.25 * SCALE} textAnchor="middle" fill="#999" fontSize={9} fontStyle="italic">waste</text>
      <text x={SHEET_W * SCALE / 2} y={SHEET_H * SCALE + 18} textAnchor="middle" fill="#000" fontSize={10}>96"</text>
      <text x={-SHEET_H * SCALE / 2} y={-8} textAnchor="middle" fill="#000" fontSize={10} transform="rotate(-90)">48"</text>
    </svg>
  );
}

export default function StylePreview() {
  const [selected, setSelected] = useState(null);

  const styles = [
    { id: "clean", name: "Clean SVG with Colors", desc: "Color-coded panels with soft fills, white labels, and dimension annotations. Modern and easy to read.", Component: CleanStyle },
    { id: "blueprint", name: "Blueprint Style", desc: "Dark background with blue/green outlines, grid overlay, and monospace text. Technical drawing aesthetic.", Component: BlueprintStyle },
    { id: "minimal", name: "Minimal Line Drawing", desc: "Black and white line art with no fills. Dimensions labeled, waste areas marked with X. Print-friendly.", Component: MinimalStyle },
  ];

  return (
    <div style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", maxWidth: 1100, margin: "0 auto", padding: 24 }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 4, color: "#1a1a1a" }}>Cut Diagram Style Preview</h1>
      <p style={{ color: "#666", fontSize: 14, marginBottom: 32 }}>
        Each preview shows the same sample sheet layout — 4 side panels and 4 top/bottom panels on a 4'×8' sheet.
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 40 }}>
        {styles.map(({ id, name, desc, Component }) => (
          <div
            key={id}
            onClick={() => setSelected(id)}
            style={{
              padding: 20,
              borderRadius: 8,
              border: selected === id ? "2px solid #4A90D9" : "2px solid #e0e0e0",
              background: selected === id ? "#f0f7ff" : "#fafafa",
              cursor: "pointer",
              transition: "all 0.15s ease",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div>
                <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0, color: "#1a1a1a" }}>{name}</h2>
                <p style={{ fontSize: 13, color: "#666", margin: "4px 0 0" }}>{desc}</p>
              </div>
              <div style={{
                width: 24, height: 24, borderRadius: 12,
                border: selected === id ? "2px solid #4A90D9" : "2px solid #ccc",
                background: selected === id ? "#4A90D9" : "#fff",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                {selected === id && <div style={{ width: 8, height: 8, borderRadius: 4, background: "#fff" }} />}
              </div>
            </div>
            <div style={{ overflowX: "auto", paddingBottom: 8 }}>
              <Component />
            </div>
          </div>
        ))}
      </div>

      {selected && (
        <div style={{
          marginTop: 32, padding: 16, background: "#e8f4e8", borderRadius: 8, textAlign: "center",
          fontSize: 15, color: "#2a7a2a", fontWeight: 500,
        }}>
          Selected: <strong>{styles.find(s => s.id === selected)?.name}</strong> — tell me this is the one and I'll build the full app with it!
        </div>
      )}
    </div>
  );
}