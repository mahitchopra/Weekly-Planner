import { useState, useEffect, useLayoutEffect, useRef } from "react";
import { Check, Trash2, ChevronLeft, ChevronRight, Pencil, Flame, X, Lock, Moon, Sun } from "lucide-react";
import { store } from "./storage.js";

// ---------- constants ----------
const DAY_START = 0 * 60; // 12 AM (full 24-hour day)
const DAY_END = 24 * 60;
const RANGE = DAY_END - DAY_START;
const HOURS_COUNT = RANGE / 60;
const HEADER_ROW = 48;
const SNAP = 15;

const PALETTE = [
  { name: "coral", bar: "#E8563F", tint: "#FBE7E2", ink: "#8E2A1B" },
  { name: "amber", bar: "#DD8B29", tint: "#F9EDD8", ink: "#89540E" },
  { name: "green", bar: "#3F9D57", tint: "#E2F3E6", ink: "#1F5E2F" },
  { name: "teal", bar: "#22A29C", tint: "#DAF0EF", ink: "#125955" },
  { name: "blue", bar: "#3B72D9", tint: "#E1EAFA", ink: "#1E3F86" },
  { name: "violet", bar: "#8257D9", tint: "#ECE4FA", ink: "#4A2E8C" },
  { name: "pink", bar: "#D9509A", tint: "#FAE3F0", ink: "#8A2860" },
  { name: "slate", bar: "#5B6472", tint: "#E8EAED", ink: "#333A45" },
];
const colorOf = (n) => PALETTE.find((p) => p.name === n) || PALETTE[4];

// life-area categories (color is a PALETTE name; a task's color follows its category)
const CATEGORIES = [
  { id: "academic", label: "Academic", color: "blue" },
  { id: "work", label: "Work", color: "violet" },
  { id: "health", label: "Health", color: "green" },
  { id: "personal", label: "Personal", color: "amber" },
  { id: "social", label: "Social", color: "pink" },
  { id: "chores", label: "Chores", color: "slate" },
];
const catOf = (id) => CATEGORIES.find((c) => c.id === id) || null;
const NEUTRAL = { name: "neutral", bar: "#9AA1AA", tint: "#EDEEF0", ink: "#525862" };
const taskColor = (t) => (t.category && catOf(t.category) ? colorOf(catOf(t.category).color) : NEUTRAL);
const PRIORITIES = ["low", "normal", "high"];
const norm = (s) => (s || "").trim().toLowerCase();

// wave path (periodic so a -50% shift loops seamlessly)
const WAVE_D = (() => {
  const w = 240, amp = 5, half = 15;
  let d = `M0 ${amp}`;
  let up = false;
  for (let x = 0; x < w; x += half) {
    d += ` Q ${x + half / 2} ${up ? 0 : amp * 2} ${x + half} ${amp}`;
    up = !up;
  }
  return d + ` L ${w} 60 L 0 60 Z`;
})();

// ---------- helpers ----------
const pad = (n) => String(n).padStart(2, "0");
const isoOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const todayStr = () => isoOf(new Date());
const parseLocal = (iso) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
};
const mondayOf = (iso) => {
  const d = parseLocal(iso);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
};
const weekDates = (off) => {
  const m = mondayOf(todayStr());
  m.setDate(m.getDate() + off * 7);
  return Array.from({ length: 7 }, (_, i) => {
    const x = new Date(m);
    x.setDate(m.getDate() + i);
    return isoOf(x);
  });
};
const addDays = (iso, n) => {
  const d = parseLocal(iso);
  d.setDate(d.getDate() + n);
  return isoOf(d);
};
const fmtTime = (m) => {
  const h = Math.floor(m / 60);
  const mm = m % 60;
  const ap = h < 12 || h >= 24 ? "AM" : "PM";
  let hh = h % 12;
  if (hh === 0) hh = 12;
  return `${hh}:${pad(mm)} ${ap}`;
};
const hourLabel = (h) => {
  if (h % 24 === 0) return "12 AM";
  const ap = h < 12 ? "AM" : "PM";
  let hh = h % 12;
  if (hh === 0) hh = 12;
  return `${hh} ${ap}`;
};
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const uid = () =>
  (crypto?.randomUUID && crypto.randomUUID()) || `${Date.now()}-${Math.random().toString(36).slice(2)}`;

const layout = (events) => {
  const res = {};
  let cluster = [];
  let clusterEnd = -Infinity;
  const flush = () => {
    const lanes = [];
    cluster.forEach((ev) => {
      let placed = false;
      for (let i = 0; i < lanes.length; i++) {
        if (ev.start >= lanes[i]) {
          lanes[i] = ev.end;
          res[ev.id] = { col: i };
          placed = true;
          break;
        }
      }
      if (!placed) {
        lanes.push(ev.end);
        res[ev.id] = { col: lanes.length - 1 };
      }
    });
    cluster.forEach((ev) => (res[ev.id].total = lanes.length));
    cluster = [];
  };
  events.forEach((ev) => {
    if (cluster.length && ev.start >= clusterEnd) {
      flush();
      clusterEnd = -Infinity;
    }
    cluster.push(ev);
    clusterEnd = Math.max(clusterEnd, ev.end);
  });
  flush();
  return res;
};

const streakOf = (log) => {
  let cursor = todayStr();
  if (!log[cursor]) cursor = addDays(cursor, -1);
  let s = 0;
  while (log[cursor]) {
    s++;
    cursor = addDays(cursor, -1);
  }
  return s;
};

const Wave = () => (
  <>
    <div className="pl-wave back">
      <svg viewBox="0 0 240 60" preserveAspectRatio="none">
        <path d={WAVE_D} fill="currentColor" />
      </svg>
    </div>
    <div className="pl-wave front">
      <svg viewBox="0 0 240 60" preserveAspectRatio="none">
        <path d={WAVE_D} fill="currentColor" />
      </svg>
    </div>
  </>
);

function Radar({ data, max, accent = "var(--blue)", fill = "rgba(59,114,217,.2)", ring = "var(--line2)", label = "var(--muted)" }) {
  const n = data.length;
  const cx = 110, cy = 102, R = 66;
  const ang = (i) => -Math.PI / 2 + (i * 2 * Math.PI) / n;
  const at = (i, r) => [cx + Math.cos(ang(i)) * r, cy + Math.sin(ang(i)) * r];
  const ringPts = (f) => data.map((_, i) => at(i, R * f).join(",")).join(" ");
  const poly = data.map((d, i) => at(i, (max ? d.value / max : 0) * R).join(",")).join(" ");
  return (
    <svg viewBox="0 0 220 210" width="100%" style={{ display: "block" }}>
      {[0.25, 0.5, 0.75, 1].map((f) => (
        <polygon key={f} points={ringPts(f)} fill="none" stroke={ring} strokeWidth="1" />
      ))}
      {data.map((d, i) => {
        const [x, y] = at(i, R);
        return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke={ring} strokeWidth="1" />;
      })}
      <polygon points={poly} fill={fill} stroke={accent} strokeWidth="1.5" strokeLinejoin="round" />
      {data.map((d, i) => {
        const [x, y] = at(i, (max ? d.value / max : 0) * R);
        return <circle key={i} cx={x} cy={y} r="2.6" fill={accent} />;
      })}
      {data.map((d, i) => {
        const [x, y] = at(i, R + 15);
        return (
          <text key={i} x={x} y={y} fontSize="9" fill={label} textAnchor="middle" dominantBaseline="middle">
            {d.label}
          </text>
        );
      })}
    </svg>
  );
}

const FONTS =
  "@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Inter:wght@400;500;600&display=swap');";

const STYLE = `
.pl-root{--paper:#F6F5F0;--ink:#1A1C22;--muted:#767A83;--line:#E7E7DE;--line2:#DBDBD0;
  --blue:#3B72D9;--blue-deep:#2A56B0;--card:#FCFCF8;
  --grid:#EDEDE5;--track:#E6E6DC;--cell:#ffffff;--today-col:#FBFCFF;--today-head:#EEF3FE;
  --tool-bg:rgba(255,255,255,.82);--tool-ic:#555;--panel:#ffffff;--overlay:rgba(18,20,26,.4);
  font-family:'Inter',ui-sans-serif,system-ui,sans-serif;color:var(--ink);min-height:100vh;
  background-color:var(--paper);
  background-image:linear-gradient(var(--line) 1px,transparent 1px),linear-gradient(90deg,var(--line) 1px,transparent 1px);
  background-size:26px 26px;padding:22px 14px 60px;-webkit-font-smoothing:antialiased;}
.pl-root.dark{--paper:#13151A;--ink:#E6E8EC;--muted:#8A909B;--line:#262A31;--line2:#333942;
  --blue:#5B8DEF;--blue-deep:#3B6FD6;--card:#1B1E25;
  --grid:#23262E;--track:#2A2E36;--cell:#20242B;--today-col:#1A2230;--today-head:#1C2740;
  --tool-bg:rgba(44,48,57,.9);--tool-ic:#C7CBD2;--panel:#20242C;--overlay:rgba(0,0,0,.6);}
.pl-wrap{max-width:1160px;margin:0 auto;}
.pl-top{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;flex-wrap:wrap;margin:2px 2px 12px;}
.pl-eyebrow{font-family:'Space Grotesk',sans-serif;text-transform:uppercase;letter-spacing:.26em;font-size:10.5px;font-weight:600;color:var(--muted);}
.pl-h1{font-family:'Space Grotesk',sans-serif;font-size:27px;font-weight:600;letter-spacing:-.02em;line-height:1;margin-top:4px;}
.pl-nav{display:flex;align-items:center;gap:6px;}
.pl-navbtn{width:32px;height:32px;display:grid;place-items:center;border:1px solid var(--line2);background:var(--card);border-radius:6px;cursor:pointer;color:var(--ink);}
.pl-navbtn:hover{border-color:var(--blue);color:var(--blue);}
.pl-today{font:inherit;font-size:12.5px;font-weight:600;font-family:'Space Grotesk',sans-serif;padding:0 12px;height:32px;border:1px solid var(--line2);background:var(--card);border-radius:6px;cursor:pointer;}
.pl-today.here{background:var(--blue);color:#fff;border-color:var(--blue);}
.pl-tools{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:0 2px 12px;}
.pl-btn{display:inline-flex;align-items:center;gap:6px;font:inherit;font-size:13px;font-weight:600;border-radius:7px;padding:7px 12px;cursor:pointer;border:1px solid var(--line2);background:var(--card);color:var(--ink);}
.pl-btn.roll{border-color:#E0912F;color:#89540E;background:#F9EDD8;}
.pl-prog{flex:1;min-width:150px;display:flex;align-items:center;gap:9px;}
.pl-progbar{flex:1;height:5px;border-radius:3px;background:var(--track);overflow:hidden;}
.pl-progfill{height:100%;background:linear-gradient(90deg,#3F9D57,#22A29C);transition:width .3s;}
.pl-progtxt{font-size:12px;color:var(--muted);white-space:nowrap;font-variant-numeric:tabular-nums;}

.pl-habits{background:var(--card);border:1px solid var(--line);border-radius:9px;padding:9px 12px;margin:0 2px 12px;}
.pl-habhead{display:flex;justify-content:space-between;align-items:center;margin-bottom:5px;}
.pl-hlabel{font-family:'Space Grotesk',sans-serif;font-size:10.5px;font-weight:600;text-transform:uppercase;letter-spacing:.16em;color:var(--muted);}
.pl-colhead-days{display:grid;grid-template-columns:150px repeat(7,1fr) 54px;gap:4px;margin-bottom:2px;}
.pl-colhead-days .d{text-align:center;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);}
.pl-habrow{display:grid;grid-template-columns:150px repeat(7,1fr) 54px;align-items:center;gap:4px;padding:3px 0;}
.pl-hname{display:flex;align-items:center;gap:7px;font-size:13px;min-width:0;}
.pl-hname .swatch{width:9px;height:9px;border-radius:50%;flex:0 0 auto;}
.pl-hname .htext{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.pl-hx{opacity:0;border:none;background:none;cursor:pointer;color:var(--muted);padding:0;display:grid;place-items:center;}
.pl-habrow:hover .pl-hx{opacity:1;}
.pl-hx:hover{color:#E8563F;}
.pl-hcell{height:24px;border-radius:6px;border:1px solid var(--line2);background:var(--cell);cursor:pointer;display:grid;place-items:center;color:#fff;}
.pl-hcell.today{box-shadow:inset 0 0 0 1.5px rgba(59,114,217,.5);}
.pl-hstreak{display:flex;align-items:center;gap:3px;justify-content:flex-end;font-size:12px;font-weight:600;color:#89540E;font-variant-numeric:tabular-nums;}
.pl-hstreak.zero{color:var(--line2);}
.pl-addhabit{display:flex;gap:6px;margin-top:6px;}
.pl-addhabit input{flex:1;font:inherit;font-size:13px;border:1px solid var(--blue);border-radius:6px;padding:6px 8px;background:var(--cell);color:var(--ink);}
.pl-btn.mini{background:var(--blue);color:#fff;border-color:var(--blue);}

.pl-calscroll{overflow:auto;border:1px solid var(--line);border-radius:10px;background:var(--card);}
.pl-cal{display:grid;grid-template-columns:52px repeat(7,minmax(118px,1fr));min-width:900px;}
.pl-head-cell{position:sticky;top:0;z-index:6;background:var(--card);border-bottom:1px solid var(--line2);
  height:48px;overflow:hidden;display:flex;flex-direction:column;align-items:center;justify-content:center;}
.pl-head-cell.gutter{border-right:1px solid var(--line);}
.pl-dow{position:relative;z-index:2;font-family:'Space Grotesk',sans-serif;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);}
.pl-dnum{position:relative;z-index:2;font-family:'Space Grotesk',sans-serif;font-size:16px;font-weight:600;}
.pl-head-cell.istoday{background:var(--today-head);}
.pl-head-cell.istoday .pl-dow,.pl-head-cell.istoday .pl-dnum{color:var(--blue-deep);}
.pl-gutter{position:relative;border-right:1px solid var(--line);}
.pl-hourlabel{position:absolute;right:6px;font-size:10px;color:var(--muted);transform:translateY(-6px);}
.pl-daycol{position:relative;border-right:1px solid var(--line);cursor:copy;}

/* liquid fill */
.pl-liquid{position:absolute;left:0;right:0;bottom:0;z-index:1;pointer-events:none;overflow:visible;
  background:linear-gradient(to top,rgba(52,138,182,.36),rgba(112,188,208,.16));
  transition:height 1.9s cubic-bezier(.32,1.04,.4,1), background .8s ease, opacity .5s ease;
  animation:pl-bob 3.4s ease-in-out infinite;}
.pl-liquid.full{background:linear-gradient(to top,rgba(48,152,96,.38),rgba(122,206,162,.18));
  box-shadow:inset 0 8px 16px -8px rgba(90,200,150,.5);}
.pl-wave{position:absolute;left:0;width:200%;pointer-events:none;}
.pl-wave svg{width:100%;height:100%;display:block;}
.pl-wave.back{height:10px;bottom:calc(100% - 4px);color:rgba(98,180,202,.5);animation:pl-wave 7s linear infinite;}
.pl-wave.front{height:12px;bottom:calc(100% - 5px);color:rgba(130,204,218,.72);animation:pl-wave 4.3s linear infinite reverse;}
.pl-liquid.full .pl-wave.back{color:rgba(100,198,150,.55);}
.pl-liquid.full .pl-wave.front{color:rgba(128,216,172,.78);}
@keyframes pl-wave{from{transform:translateX(0);}to{transform:translateX(-50%);}}
@keyframes pl-bob{0%,100%{transform:translateY(0);}50%{transform:translateY(2.5px);}}

.pl-nowline{position:absolute;left:0;right:0;height:2px;background:#E8563F;z-index:5;pointer-events:none;}
.pl-nowline::before{content:"";position:absolute;left:-3px;top:-3px;width:8px;height:8px;border-radius:50%;background:#E8563F;}

.pl-block{position:absolute;left:2px;right:2px;border-radius:6px;border-left:3px solid;overflow:hidden;
  padding:2px 5px;cursor:grab;user-select:none;touch-action:none;box-shadow:0 1px 2px rgba(0,0,0,.08);z-index:3;}
.pl-block:active{cursor:grabbing;}
.pl-block.dragging{z-index:20;box-shadow:0 6px 16px rgba(0,0,0,.18);opacity:.96;}
.pl-block.done{opacity:.6;}
.pl-brow{display:flex;align-items:center;gap:4px;}
.pl-bcheck{width:14px;height:14px;border-radius:50%;border:1.4px solid;background:var(--cell);display:grid;place-items:center;cursor:pointer;flex:0 0 auto;padding:0;}
.pl-block.done .pl-bcheck{background:currentColor;}
.pl-btitle{font-size:11.5px;font-weight:600;line-height:1.15;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;word-break:break-word;}
.pl-block.done .pl-btitle{text-decoration:line-through;}
.pl-btime{font-size:9.5px;opacity:.75;margin-top:1px;}
.pl-binput{width:100%;font:inherit;font-size:11.5px;font-weight:600;border:none;border-bottom:1px solid currentColor;background:transparent;color:inherit;padding:0;}
.pl-binput:focus{outline:none;}
.pl-binput::placeholder{color:currentColor;opacity:.5;}
.pl-btools{position:absolute;top:2px;right:3px;display:flex;gap:2px;opacity:0;transition:opacity .1s;}
.pl-block:hover .pl-btools{opacity:1;}
.pl-btools button{width:16px;height:16px;display:grid;place-items:center;border:none;background:var(--tool-bg);border-radius:4px;cursor:pointer;color:var(--tool-ic);padding:0;}
.pl-btools button:hover{color:var(--ink);}
.pl-resize{position:absolute;left:0;right:0;bottom:0;height:8px;cursor:ns-resize;touch-action:none;}
.pl-resize::after{content:"";position:absolute;left:50%;bottom:2px;width:18px;height:2px;border-radius:2px;background:rgba(0,0,0,.18);transform:translateX(-50%);}

.pl-hint{font-size:11.5px;color:var(--muted);margin:8px 4px 0;}

.pl-rev{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:16px 18px;margin:16px 2px 0;}
.pl-revhead{display:flex;justify-content:space-between;align-items:baseline;gap:10px;margin-bottom:14px;flex-wrap:wrap;}
.pl-revtitle{font-family:'Space Grotesk',sans-serif;font-size:16px;font-weight:600;}
.pl-revsub{font-size:12px;color:var(--muted);}
.pl-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;}
.pl-stat{border:1px solid var(--line);border-radius:8px;padding:10px 12px;}
.pl-statnum{font-family:'Space Grotesk',sans-serif;font-size:22px;font-weight:600;line-height:1;display:flex;align-items:center;gap:4px;}
.pl-statlbl{font-size:10px;text-transform:uppercase;letter-spacing:.09em;color:var(--muted);margin-top:6px;}
.pl-chart{display:flex;align-items:flex-end;gap:8px;height:104px;margin-top:16px;}
.pl-barc{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;gap:4px;height:100%;}
.pl-barn{font-size:11px;font-weight:600;font-variant-numeric:tabular-nums;color:var(--ink);}
.pl-bar{width:100%;max-width:36px;border-radius:5px 5px 3px 3px;background:linear-gradient(#3B72D9,#22A29C);min-height:3px;transition:height .35s;}
.pl-bar.today{outline:2px solid rgba(59,114,217,.4);outline-offset:1px;}
.pl-barl{font-size:10px;color:var(--muted);}
.pl-revnote{font-size:12.5px;color:var(--muted);margin-top:14px;line-height:1.55;}
.pl-revnote b{color:var(--ink);font-weight:600;}
.pl-revlock{display:flex;align-items:center;gap:10px;background:var(--card);border:1px dashed var(--line2);border-radius:10px;padding:14px 16px;margin:16px 2px 0;color:var(--muted);font-size:13px;}

.pl-foot{display:flex;justify-content:space-between;align-items:center;margin:12px 4px 0;font-size:12px;color:var(--muted);}
.pl-clear{font:inherit;font-size:12px;color:var(--muted);background:none;border:none;cursor:pointer;text-decoration:underline;text-underline-offset:2px;}
.pl-clear:hover{color:#E8563F;}
.pl-loading{padding:60px;text-align:center;color:var(--muted);}
:focus-visible{outline:2px solid var(--blue);outline-offset:2px;}
/* priorities + category marker */
.pl-block.pri-high{box-shadow:0 2px 7px rgba(0,0,0,.18);}
.pl-block.pri-low{box-shadow:none;}

/* dashboard */
.pl-dash{display:grid;grid-template-columns:1.3fr 1fr;gap:12px;margin:16px 2px 0;}
.pl-panel{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:14px 16px;}
.pl-paneltitle{font-family:'Space Grotesk',sans-serif;font-size:10.5px;font-weight:600;text-transform:uppercase;letter-spacing:.14em;color:var(--muted);margin-bottom:10px;}
.pl-leg{display:flex;flex-wrap:wrap;gap:7px 12px;margin-top:8px;justify-content:center;}
.pl-leg span{display:inline-flex;align-items:center;gap:5px;font-size:11px;color:var(--muted);}
.pl-leg i{width:8px;height:8px;border-radius:2px;display:inline-block;}
.pl-emptynote{font-size:12px;color:var(--muted);text-align:center;padding:34px 8px;line-height:1.5;}
.pl-score{display:flex;align-items:baseline;gap:6px;}
.pl-scorebig{font-family:'Space Grotesk',sans-serif;font-size:34px;font-weight:600;line-height:1;}
.pl-scoreout{font-size:13px;color:var(--muted);}
.pl-scoresub{font-size:11px;color:var(--muted);margin:3px 0 2px;line-height:1.4;}
.pl-chead{display:grid;grid-template-columns:1fr 66px 46px 96px;gap:6px;font-size:9px;text-transform:uppercase;letter-spacing:.07em;color:var(--muted);margin:14px 0 2px;}
.pl-chead span:not(:first-child){text-align:center;}
.pl-crow{display:grid;grid-template-columns:1fr 66px 46px 96px;gap:6px;align-items:center;padding:5px 0;font-size:12.5px;border-top:1px solid var(--line);}
.pl-cname{display:flex;align-items:center;gap:7px;min-width:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;}
.pl-cname i{width:9px;height:9px;border-radius:50%;flex:0 0 auto;}
.pl-ctin{display:flex;align-items:center;gap:2px;justify-content:center;font-size:11px;color:var(--muted);}
.pl-ctin input{width:40px;font:inherit;font-size:12px;text-align:center;border:1px solid var(--line2);border-radius:5px;padding:3px 2px;background:var(--cell);color:var(--ink);}
.pl-cdone{text-align:center;color:var(--muted);font-variant-numeric:tabular-nums;font-size:12px;}
.pl-cscorewrap{display:flex;align-items:center;gap:6px;}
.pl-cscore{font-weight:600;font-variant-numeric:tabular-nums;width:24px;text-align:right;font-size:12.5px;}
.pl-cbar{flex:1;height:5px;border-radius:3px;background:var(--track);overflow:hidden;}
.pl-cbar span{display:block;height:100%;border-radius:3px;transition:width .4s;}
.pl-panel.balance{background:#141416;border-color:#2b2b2f;}
.pl-panel.balance .pl-paneltitle{color:rgba(255,255,255,.55);}
.pl-hours{display:flex;gap:10px;}
.pl-hours label{flex:1;display:flex;flex-direction:column;gap:4px;font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);}
.pl-hours input{font:inherit;font-size:13px;border:1px solid var(--line2);border-radius:7px;padding:6px 8px;background:var(--cell);color:var(--ink);}

/* edit modal */
.pl-overlay{position:fixed;inset:0;background:var(--overlay);display:flex;align-items:center;justify-content:center;z-index:50;padding:16px;}
.pl-modal{width:320px;max-width:100%;background:var(--panel);border:1px solid var(--line2);border-radius:12px;padding:16px 16px 14px;box-shadow:0 16px 48px rgba(0,0,0,.35);}
.pl-modtitle{width:100%;font:inherit;font-size:15px;font-weight:600;border:none;border-bottom:1.5px solid var(--line2);background:transparent;color:var(--ink);padding:3px 0 7px;}
.pl-modtitle:focus{outline:none;border-color:var(--blue);}
.pl-modlbl{font-size:10px;text-transform:uppercase;letter-spacing:.1em;color:var(--muted);margin:15px 0 7px;font-weight:600;}
.pl-chips{display:flex;flex-wrap:wrap;gap:6px;}
.pl-chip{display:inline-flex;align-items:center;gap:5px;font:inherit;font-size:12px;border:1px solid var(--line2);background:transparent;color:var(--ink);border-radius:20px;padding:4px 10px;cursor:pointer;}
.pl-chip.on{border-color:var(--blue);background:color-mix(in srgb,var(--blue) 15%,transparent);}
.pl-chip i{width:8px;height:8px;border-radius:50%;display:inline-block;}
.pl-prio{display:flex;gap:6px;}
.pl-prio button{flex:1;font:inherit;font-size:12px;border:1px solid var(--line2);background:transparent;color:var(--ink);border-radius:7px;padding:7px 6px;cursor:pointer;text-transform:capitalize;}
.pl-prio button.on{border-color:var(--blue);background:color-mix(in srgb,var(--blue) 15%,transparent);font-weight:600;}
.pl-modfoot{display:flex;justify-content:space-between;align-items:center;margin-top:18px;}
.pl-delm{font:inherit;font-size:12.5px;color:#E8563F;background:none;border:none;cursor:pointer;}
.pl-modal.wide{width:420px;}
.pl-rollhead{display:flex;align-items:baseline;gap:8px;}
.pl-rollacts{display:flex;gap:14px;margin:4px 0 4px;}
.pl-rolllist{max-height:46vh;overflow:auto;margin:4px -4px 0;padding:0 4px;}
.pl-rollrow{display:flex;align-items:center;gap:9px;padding:7px 2px;border-top:1px solid var(--line);}
.pl-rollrow:first-child{border-top:none;}
.pl-rcb{width:18px;height:18px;border:1.5px solid var(--line2);border-radius:5px;background:var(--cell);display:grid;place-items:center;cursor:pointer;color:#fff;flex:0 0 auto;padding:0;}
.pl-rcb.on{background:var(--blue);border-color:var(--blue);}
.pl-rdot{width:9px;height:9px;border-radius:50%;flex:0 0 auto;}
.pl-rtitle{flex:1;min-width:0;font-size:13px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;}
.pl-rold{font-size:9px;text-transform:uppercase;letter-spacing:.05em;color:#E8563F;border:1px solid #E8563F;border-radius:10px;padding:1px 6px;flex:0 0 auto;}
.pl-rdate{font-size:11px;color:var(--muted);white-space:nowrap;flex:0 0 auto;font-variant-numeric:tabular-nums;}
.pl-rdel{width:22px;height:22px;display:grid;place-items:center;border:none;background:none;color:var(--muted);cursor:pointer;flex:0 0 auto;padding:0;}
.pl-rdel:hover{color:#E8563F;}

@media (max-width:720px){.pl-dash{grid-template-columns:1fr;}}
@media (max-width:560px){.pl-stats{grid-template-columns:repeat(2,1fr);}}
@media (prefers-reduced-motion:reduce){.pl-wave,.pl-liquid{animation:none!important;}.pl-liquid{transition:none!important;}*{transition:none!important;}}
`;

export default function TimelinePlanner() {
  const [tasks, setTasks] = useState([]);
  const [habits, setHabits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [offset, setOffset] = useState(0);
  const [editingId, setEditingId] = useState(null);
  const [drag, setDrag] = useState(null);
  const [now, setNow] = useState(Date.now());
  const [addingHabit, setAddingHabit] = useState(false);
  const [habitDraft, setHabitDraft] = useState("");
  const [hourH, setHourH] = useState(46);
  const [calH, setCalH] = useState(620);
  const [theme, setTheme] = useState("light");
  const [panelId, setPanelId] = useState(null);
  const [catMap, setCatMap] = useState({}); // normalized task name -> category id
  const [targets, setTargets] = useState({}); // category id -> weekly target hours
  const [rollOpen, setRollOpen] = useState(false);
  const [rollSel, setRollSel] = useState(() => new Set());

  const hydrated = useRef(false);
  const dragRef = useRef(null);
  const liveRef = useRef(null);
  const colRefs = useRef({});
  const calRef = useRef(null);

  const wd = weekDates(offset);
  const PX = hourH / 60;
  const TOTAL_H = RANGE * PX;
  const todayIso = todayStr();

  useEffect(() => {
    (async () => {
      try {
        const r = await store.get("planner:tasks");
        if (r?.value) setTasks(JSON.parse(r.value));
      } catch (e) {}
      try {
        const h = await store.get("planner:habits");
        if (h?.value) setHabits(JSON.parse(h.value));
      } catch (e) {}
      try {
        const th = await store.get("planner:theme");
        if (th?.value) setTheme(th.value);
      } catch (e) {}
      try {
        const cm = await store.get("planner:catmap");
        if (cm?.value) setCatMap(JSON.parse(cm.value));
      } catch (e) {}
      try {
        const tg = await store.get("planner:targets");
        if (tg?.value) {
          let parsed = JSON.parse(tg.value);
          const catIds = CATEGORIES.map((c) => c.id);
          // migrate old single-target format {catId:hours} -> { __default: {...} }
          if (parsed && typeof parsed === "object" && Object.keys(parsed).some((k) => catIds.includes(k))) {
            parsed = { __default: parsed };
          }
          setTargets(parsed || {});
        }
      } catch (e) {}
      setLoading(false);
      hydrated.current = true;
    })();
    const id = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    if (hydrated.current) store.set("planner:tasks", JSON.stringify(tasks)).catch((e) => console.error(e));
  }, [tasks]);
  useEffect(() => {
    if (hydrated.current) store.set("planner:habits", JSON.stringify(habits)).catch((e) => console.error(e));
  }, [habits]);
  useEffect(() => {
    if (hydrated.current) store.set("planner:theme", theme).catch((e) => console.error(e));
  }, [theme]);
  useEffect(() => {
    if (hydrated.current) store.set("planner:catmap", JSON.stringify(catMap)).catch((e) => console.error(e));
  }, [catMap]);
  useEffect(() => {
    if (hydrated.current) store.set("planner:targets", JSON.stringify(targets)).catch((e) => console.error(e));
  }, [targets]);

  const measure = () => {
    const el = calRef.current;
    if (!el) return;
    const top = el.getBoundingClientRect().top;
    const avail = Math.max(300, window.innerHeight - top - 18);
    setCalH(avail);
    setHourH(clamp((avail - HEADER_ROW) / HOURS_COUNT, 34, 74));
  };
  useLayoutEffect(() => {
    measure();
    // eslint-disable-next-line
  }, [loading, habits.length, addingHabit, offset]);
  useEffect(() => {
    const f = () => measure();
    window.addEventListener("resize", f);
    return () => window.removeEventListener("resize", f);
  }, []);

  const createAt = (iso, clientY) => {
    const el = colRefs.current[iso];
    if (!el) return;
    const rect = el.getBoundingClientRect();
    let start = DAY_START + Math.round((clientY - rect.top) / PX / SNAP) * SNAP;
    start = clamp(start, DAY_START, DAY_END - 30);
    const duration = Math.min(60, DAY_END - start);
    const id = uid();
    setTasks((p) => [
      ...p,
      { id, title: "", date: iso, start, duration, category: null, priority: "normal", done: false, createdAt: Date.now() },
    ]);
    setEditingId(id);
  };
  const toggle = (id) => {
    const task = tasks.find((t) => t.id === id);
    if (!task) return;
    const newDone = !task.done;
    setTasks((p) => p.map((t) => (t.id === id ? { ...t, done: newDone } : t)));

    // If a habit shares this task's name, mirror the check into the habit for that day.
    const name = (task.title || "").trim().toLowerCase();
    if (!name || !task.date) return;
    if (!habits.some((h) => (h.name || "").trim().toLowerCase() === name)) return;
    // On un-check, only clear the habit if no other done task of the same name remains that day.
    const otherStillDone = tasks.some(
      (t) => t.id !== id && t.done && t.date === task.date && (t.title || "").trim().toLowerCase() === name
    );
    setHabits((hs) =>
      hs.map((h) => {
        if ((h.name || "").trim().toLowerCase() !== name) return h;
        const log = { ...h.log };
        if (newDone) log[task.date] = true;
        else if (!otherStillDone) delete log[task.date];
        return { ...h, log };
      })
    );
  };
  const remove = (id) => setTasks((p) => p.filter((t) => t.id !== id));
  const rename = (id, v) => setTasks((p) => p.map((t) => (t.id === id ? { ...t, title: v } : t)));
  const patch = (id, obj) => setTasks((p) => p.map((t) => (t.id === id ? { ...t, ...obj } : t)));
  // Assign a category and propagate to every task sharing the name (and remember it for future repeats)
  const assignCategory = (id, catId) => {
    const t = tasks.find((x) => x.id === id);
    if (!t) return;
    const key = norm(t.title);
    setTasks((p) => p.map((x) => (x.id === id || (key && norm(x.title) === key) ? { ...x, category: catId } : x)));
    if (key) setCatMap((m) => { const n = { ...m }; if (catId) n[key] = catId; else delete n[key]; return n; });
  };
  // Inline naming: inherit a remembered category for repeated task names
  const commitName = (id, v) => {
    const name = v.trim();
    setTasks((p) =>
      p.map((t) => (t.id === id ? { ...t, title: name, category: t.category || catMap[norm(name)] || null } : t))
    );
  };
  const setTitleCat = (id, v) =>
    setTasks((p) => p.map((t) => (t.id === id ? { ...t, title: v, category: t.category || catMap[norm(v)] || null } : t)));
  const setTarget = (catId, v) =>
    setTargets((m) => {
      const base = m[wk0] || effTargets;
      const wk = { ...base };
      if (v === "" || v == null) delete wk[catId];
      else wk[catId] = Number(v);
      return { ...m, [wk0]: wk };
    });
  const setPlannedHours = (id, h) => {
    const t = tasks.find((x) => x.id === id);
    if (!t) return;
    const mins = clamp(Math.round(((Number(h) || 0) * 60) / SNAP) * SNAP, SNAP, DAY_END - t.start);
    patch(id, { duration: mins });
  };
  const setActualHours = (id, h) =>
    patch(id, { actualMin: h === "" || h == null ? null : Math.max(0, Math.round(Number(h) * 60)) });
  const recentCutoff = addDays(todayIso, -14); // only the last 2 weeks are rolled by default
  const openRollover = () => {
    const recentIds = tasks.filter((t) => !t.done && t.date < todayIso && t.date >= recentCutoff).map((t) => t.id);
    setRollSel(new Set(recentIds));
    setRollOpen(true);
  };
  const toggleRoll = (id) =>
    setRollSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const deleteFromRoll = (id) => {
    remove(id);
    setRollSel((s) => { const n = new Set(s); n.delete(id); return n; });
  };
  const doRollover = () => {
    setTasks((p) => p.map((t) => (rollSel.has(t.id) ? { ...t, date: todayIso } : t)));
    setRollOpen(false);
    setOffset(0);
  };
  const deleteOlder = () => setTasks((p) => p.filter((t) => !(!t.done && t.date < recentCutoff)));
  const pending = tasks.filter((t) => !t.done && t.date < todayIso).length;

  const onPointerDown = (e, task) => {
    if (e.target.closest("[data-nodrag]")) return;
    const mode = e.target.closest("[data-resize]") ? "resize" : "move";
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { id: task.id, mode, origStart: task.start, origDur: task.duration || 60, origDate: task.date, startY: e.clientY, pointerId: e.pointerId };
    liveRef.current = { start: task.start, duration: task.duration || 60, date: task.date };
    setDrag({ id: task.id, mode, ...liveRef.current });
  };
  const onPointerMove = (e) => {
    const c = dragRef.current;
    if (!c || c.pointerId !== e.pointerId) return;
    const deltaMin = Math.round((e.clientY - c.startY) / PX / SNAP) * SNAP;
    if (c.mode === "move") {
      const start = clamp(c.origStart + deltaMin, DAY_START, DAY_END - c.origDur);
      let date = c.origDate;
      for (const iso of wd) {
        const el = colRefs.current[iso];
        if (!el) continue;
        const r = el.getBoundingClientRect();
        if (e.clientX >= r.left && e.clientX <= r.right) {
          date = iso;
          break;
        }
      }
      liveRef.current = { start, duration: c.origDur, date };
    } else {
      const duration = clamp(c.origDur + deltaMin, SNAP, DAY_END - c.origStart);
      liveRef.current = { start: c.origStart, duration, date: c.origDate };
    }
    setDrag({ id: c.id, mode: c.mode, ...liveRef.current });
  };
  const onPointerUp = (e) => {
    const c = dragRef.current;
    if (!c || c.pointerId !== e.pointerId) return;
    const { start, duration, date } = liveRef.current;
    setTasks((p) => p.map((t) => (t.id === c.id ? { ...t, start, duration, date } : t)));
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch (_) {}
    dragRef.current = null;
    setDrag(null);
  };

  const addHabit = () => {
    const n = habitDraft.trim();
    if (!n) return setAddingHabit(false);
    setHabits((p) => [...p, { id: uid(), name: n, color: PALETTE[p.length % PALETTE.length].name, log: {} }]);
    setHabitDraft("");
  };
  const toggleHabit = (id, iso) =>
    setHabits((p) =>
      p.map((h) => {
        if (h.id !== id) return h;
        const log = { ...h.log };
        if (log[iso]) delete log[iso];
        else log[iso] = true;
        return { ...h, log };
      })
    );
  const removeHabit = (id) => setHabits((p) => p.filter((h) => h.id !== id));

  const eff = (t) => (drag && drag.id === t.id ? { ...t, start: drag.start, duration: drag.duration, date: drag.date } : t);
  const perDay = wd.map((iso) => {
    const list = tasks.filter((t) => t.date === iso);
    return { iso, total: list.length, done: list.filter((x) => x.done).length };
  });
  const pctByIso = Object.fromEntries(perDay.map((d) => [d.iso, d.total ? d.done / d.total : 0]));
  const weekTotal = perDay.reduce((s, d) => s + d.total, 0);
  const weekDone = perDay.reduce((s, d) => s + d.done, 0);
  const weekPct = weekTotal ? weekDone / weekTotal : 0;
  const rate = weekTotal ? Math.round(weekPct * 100) : 0;
  const maxDone = Math.max(1, ...perDay.map((d) => d.done));
  const bestDay = perDay.reduce((a, b) => (b.done > a.done ? b : a), perDay[0]);
  const habitCheckins = habits.reduce((s, h) => s + wd.filter((iso) => h.log[iso]).length, 0);
  const bestStreak = habits
    .map((h) => ({ name: h.name, s: streakOf(h.log) }))
    .reduce((a, b) => (b.s > a.s ? b : a), { name: "", s: 0 });
  const wk0 = wd[0];
  const priorTargetKeys = Object.keys(targets)
    .filter((k) => /^\d{4}-\d{2}-\d{2}$/.test(k) && k < wk0)
    .sort();
  const effTargets =
    targets[wk0] || (priorTargetKeys.length ? targets[priorTargetKeys[priorTargetKeys.length - 1]] : null) || targets.__default || {};
  const catStats = CATEGORIES.map((c) => {
    const inWeek = tasks.filter((t) => wd.includes(t.date) && t.category === c.id);
    const doneMin = inWeek.reduce((s, t) => s + (t.actualMin != null ? t.actualMin : t.done ? t.duration || 60 : 0), 0);
    const plannedMin = inWeek.reduce((s, t) => s + (t.duration || 60), 0);
    const target = Number(effTargets[c.id]) || 0;
    const doneH = doneMin / 60;
    const plannedH = plannedMin / 60;
    const score = target > 0 ? Math.min(10, (doneH / target) * 10) : null;
    return { ...c, target, doneH, plannedH, score };
  });
  const scored = catStats.filter((c) => c.score != null);
  const overall = scored.length ? scored.reduce((s, c) => s + c.score, 0) / scored.length : null;
  const panelTask = panelId ? tasks.find((t) => t.id === panelId) : null;
  const rollCands = tasks
    .filter((t) => !t.done && t.date < todayIso)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.start - b.start));
  const olderCount = rollCands.filter((t) => t.date < recentCutoff).length;

  const weekOver = parseLocal(wd[6]) < parseLocal(todayIso);

  const first = parseLocal(wd[0]);
  const last = parseLocal(wd[6]);
  const sameMonth = first.getMonth() === last.getMonth();
  const rangeLabel = sameMonth
    ? `${first.toLocaleDateString(undefined, { month: "long" })} ${first.getDate()} \u2013 ${last.getDate()}`
    : `${first.toLocaleDateString(undefined, { month: "short", day: "numeric" })} \u2013 ${last.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
  const relWeek = offset === 0 ? "This week" : offset === 1 ? "Next week" : offset === -1 ? "Last week" : `${offset > 0 ? "+" : ""}${offset} weeks`;
  const nowD = new Date(now);
  const nowMin = nowD.getHours() * 60 + nowD.getMinutes();
  const hours = [];
  for (let h = DAY_START / 60; h <= DAY_END / 60; h++) hours.push(h);

  return (
    <div className={`pl-root${theme === "dark" ? " dark" : ""}`}>
      <style>{FONTS}</style>
      <style>{STYLE}</style>
      <div className="pl-wrap">
        <div className="pl-top">
          <div>
            <div className="pl-eyebrow">{relWeek}</div>
            <h1 className="pl-h1">{rangeLabel}</h1>
          </div>
          <div className="pl-nav">
            <button className="pl-navbtn" onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))} aria-label="Toggle dark mode" title="Toggle dark mode">
              {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
            </button>
            <button className="pl-navbtn" onClick={() => setOffset((o) => o - 1)} aria-label="Previous week">
              <ChevronLeft size={18} />
            </button>
            <button className={`pl-today${offset === 0 ? " here" : ""}`} onClick={() => setOffset(0)}>
              Today
            </button>
            <button className="pl-navbtn" onClick={() => setOffset((o) => o + 1)} aria-label="Next week">
              <ChevronRight size={18} />
            </button>
          </div>
        </div>

        <div className="pl-tools">
          {pending > 0 && (
            <button className="pl-btn roll" onClick={openRollover}>
              <ChevronRight size={14} /> Roll over {pending} pending
            </button>
          )}
          <div className="pl-prog">
            <div className="pl-progbar">
              <div className="pl-progfill" style={{ width: `${Math.round(weekPct * 100)}%` }} />
            </div>
            <span className="pl-progtxt">
              {weekDone}/{weekTotal} done
            </span>
          </div>
        </div>

        {/* Habits */}
        <div className="pl-habits">
          <div className="pl-habhead">
            <span className="pl-hlabel">Habits {"\u00B7"} streaks</span>
            {!addingHabit && (
              <button className="pl-clear" style={{ textDecoration: "none" }} onClick={() => setAddingHabit(true)}>
                + Habit
              </button>
            )}
          </div>
          {(habits.length > 0 || addingHabit) && (
            <div className="pl-colhead-days">
              <span />
              {wd.map((iso) => (
                <span key={iso} className="d">
                  {parseLocal(iso).toLocaleDateString(undefined, { weekday: "narrow" })}
                </span>
              ))}
              <span />
            </div>
          )}
          {habits.map((h) => {
            const col = colorOf(h.color);
            const s = streakOf(h.log);
            return (
              <div key={h.id} className="pl-habrow">
                <div className="pl-hname">
                  <span className="swatch" style={{ background: col.bar }} />
                  <span className="htext">{h.name}</span>
                  <button className="pl-hx" onClick={() => removeHabit(h.id)} aria-label="Remove habit">
                    <X size={12} />
                  </button>
                </div>
                {wd.map((iso) => (
                  <button
                    key={iso}
                    className={`pl-hcell${iso === todayIso ? " today" : ""}`}
                    style={h.log[iso] ? { background: col.bar, borderColor: col.bar } : undefined}
                    onClick={() => toggleHabit(h.id, iso)}
                    aria-label={`${h.name} ${iso}`}
                  >
                    {h.log[iso] && <Check size={13} strokeWidth={3} />}
                  </button>
                ))}
                <span className={`pl-hstreak${s === 0 ? " zero" : ""}`}>
                  <Flame size={13} /> {s}
                </span>
              </div>
            );
          })}
          {addingHabit && (
            <div className="pl-addhabit">
              <input
                autoFocus
                placeholder="Name a habit (e.g. Read 20 min)"
                value={habitDraft}
                onChange={(e) => setHabitDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") addHabit();
                  if (e.key === "Escape") setAddingHabit(false);
                }}
                onBlur={() => !habitDraft.trim() && setAddingHabit(false)}
              />
              <button className="pl-btn mini" onClick={addHabit}>
                Add
              </button>
            </div>
          )}
          {habits.length === 0 && !addingHabit && (
            <div className="pl-hint" style={{ margin: "2px 0 0" }}>
              Track daily habits here and watch your streak grow. Add one to start.
            </div>
          )}
        </div>

        {/* Timeline */}
        {loading ? (
          <div className="pl-loading">Loading your planner...</div>
        ) : (
          <div className="pl-calscroll" ref={calRef} style={{ maxHeight: calH }}>
            <div className="pl-cal">
              <div className="pl-head-cell gutter" />
              {wd.map((iso) => {
                const d = parseLocal(iso);
                const isToday = iso === todayIso;
                const pct = pctByIso[iso] || 0;
                return (
                  <div key={iso} className={`pl-head-cell${isToday ? " istoday" : ""}`}>
                    <div className={`pl-liquid${pct >= 1 ? " full" : ""}`} style={{ height: `${pct * 100}%`, opacity: pct > 0 ? 1 : 0 }}>
                      {pct > 0 && <Wave />}
                    </div>
                    <div className="pl-dow">{d.toLocaleDateString(undefined, { weekday: "short" })}</div>
                    <div className="pl-dnum">{d.getDate()}</div>
                  </div>
                );
              })}

              <div className="pl-gutter" style={{ height: TOTAL_H }}>
                {hours.map((h) => (
                  <div key={h} className="pl-hourlabel" style={{ top: (h * 60 - DAY_START) * PX }}>
                    {hourLabel(h)}
                  </div>
                ))}
              </div>

              {wd.map((iso) => {
                const isToday = iso === todayIso;
                const dayTasks = tasks
                  .map(eff)
                  .filter((t) => t.date === iso)
                  .sort((a, b) => a.start - b.start)
                  .map((t) => ({ ...t, end: t.start + (t.duration || 60) }));
                const lay = layout(dayTasks);
                return (
                  <div
                    key={iso}
                    className="pl-daycol"
                    ref={(el) => (colRefs.current[iso] = el)}
                    style={{
                      height: TOTAL_H,
                      backgroundColor: isToday ? "var(--today-col)" : undefined,
                      backgroundImage: `repeating-linear-gradient(var(--grid) 0, var(--grid) 1px, transparent 1px, transparent ${hourH}px)`,
                    }}
                    onClick={(e) => {
                      if (e.target === e.currentTarget) createAt(iso, e.clientY);
                    }}
                  >
                    {isToday && nowMin >= DAY_START && nowMin <= DAY_END && (
                      <div className="pl-nowline" style={{ top: (nowMin - DAY_START) * PX }} />
                    )}
                    {dayTasks.map((t) => {
                      const col = taskColor(t);
                      const lg = lay[t.id] || { col: 0, total: 1 };
                      const w = 100 / lg.total;
                      const isDragging = drag && drag.id === t.id;
                      const top = (t.start - DAY_START) * PX;
                      const height = Math.max((t.duration || 60) * PX, 11);
                      const prio = t.priority || "normal";
                      const bdark = theme === "dark";
                      return (
                        <div
                          key={t.id}
                          className={`pl-block${t.done ? " done" : ""}${isDragging ? " dragging" : ""} pri-${prio}`}
                          onPointerDown={(e) => onPointerDown(e, t)}
                          onPointerMove={onPointerMove}
                          onPointerUp={onPointerUp}
                          style={{
                            top,
                            height,
                            left: `calc(${lg.col * w}% + 2px)`,
                            width: `calc(${w}% - 4px)`,
                            borderLeftColor: col.bar,
                            borderLeftWidth: prio === "high" ? 6 : prio === "low" ? 2 : 3,
                            background: t.done ? "var(--cell)" : bdark ? "rgba(255,255,255,.07)" : col.tint,
                            color: t.done ? "var(--muted)" : bdark ? col.bar : col.ink,
                          }}
                        >
                          <div className="pl-brow">
                            <button
                              className="pl-bcheck"
                              data-nodrag
                              onPointerDown={(e) => e.stopPropagation()}
                              onClick={() => toggle(t.id)}
                              style={{ borderColor: col.bar, color: col.bar }}
                              aria-label={t.done ? "Mark not done" : "Mark done"}
                            >
                              {t.done && <Check size={9} strokeWidth={3.5} />}
                            </button>
                            {editingId === t.id ? (
                              <input
                                className="pl-binput"
                                data-nodrag
                                autoFocus
                                placeholder="Name this task..."
                                defaultValue={t.title}
                                onPointerDown={(e) => e.stopPropagation()}
                                onBlur={(e) => {
                                  const v = e.target.value.trim();
                                  if (!v && !t.title) remove(t.id);
                                  else if (v) commitName(t.id, v);
                                  setEditingId(null);
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") e.target.blur();
                                  if (e.key === "Escape") {
                                    if (!t.title) remove(t.id);
                                    setEditingId(null);
                                  }
                                }}
                              />
                            ) : (
                              <span className="pl-btitle">{t.title || "Untitled"}</span>
                            )}
                          </div>
                          {height > 30 && (
                            <div className="pl-btime">
                              {fmtTime(t.start)} {"\u2013"} {fmtTime(t.start + (t.duration || 60))}
                            </div>
                          )}
                          <div className="pl-btools" data-nodrag onPointerDown={(e) => e.stopPropagation()}>
                            <button onClick={() => setPanelId(t.id)} aria-label="Edit task" title="Edit (category, priority, color)">
                              <Pencil size={11} />
                            </button>
                            <button onClick={() => remove(t.id)} aria-label="Delete">
                              <Trash2 size={11} />
                            </button>
                          </div>
                          <div className="pl-resize" data-resize aria-label="Resize" />
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        )}
        <div className="pl-hint">Click any empty slot to add a task. Drag a block to move it; drag its bottom edge to resize. Open the pencil on a task to set its category, priority and color.</div>

        {!loading && (
          <div className="pl-dash">
            <div className="pl-panel">
              <div className="pl-paneltitle">Weekly score {"\u00B7"} {relWeek.toLowerCase()}</div>
              <div className="pl-score">
                <span className="pl-scorebig">{overall != null ? overall.toFixed(1) : "--"}</span>
                <span className="pl-scoreout">/ 10</span>
              </div>
              <div className="pl-scoresub">Targets are per week and carry over until you change them.</div>
              <div className="pl-chead">
                <span>Life area</span>
                <span>Target</span>
                <span>Done</span>
                <span>Score</span>
              </div>
              {catStats.map((c) => (
                <div key={c.id} className="pl-crow">
                  <span className="pl-cname">
                    <i style={{ background: colorOf(c.color).bar }} />
                    {c.label}
                  </span>
                  <span className="pl-ctin">
                    <input
                      type="number"
                      min="0"
                      step="0.5"
                      value={targets[c.id] ?? ""}
                      placeholder="--"
                      onChange={(e) => setTarget(c.id, e.target.value)}
                    />
                    h
                  </span>
                  <span className="pl-cdone">{c.doneH.toFixed(1)}h</span>
                  <span className="pl-cscorewrap">
                    <span className="pl-cscore">{c.score != null ? c.score.toFixed(1) : "--"}</span>
                    <span className="pl-cbar">
                      <span style={{ width: `${(c.score || 0) * 10}%`, background: colorOf(c.color).bar }} />
                    </span>
                  </span>
                </div>
              ))}
            </div>
            <div className="pl-panel balance">
              <div className="pl-paneltitle">Life balance {"\u00B7"} out of 10</div>
              {scored.length ? (
                <Radar
                  data={catStats.map((c) => ({ label: c.label, value: c.score || 0 }))}
                  max={10}
                  accent="#F0473A"
                  fill="rgba(240,71,58,.32)"
                  ring="rgba(255,255,255,.16)"
                  label="rgba(255,255,255,.82)"
                />
              ) : (
                <div className="pl-emptynote" style={{ color: "rgba(255,255,255,.55)" }}>
                  Set a weekly hour target on the left and give some tasks a category to light up your balance.
                </div>
              )}
            </div>
          </div>
        )}

        {/* Week in review - only once the week has finished */}
        {!loading &&
          (weekOver ? (
            <div className="pl-rev">
              <div className="pl-revhead">
                <span className="pl-revtitle">Week in review</span>
                <span className="pl-revsub">{rangeLabel}</span>
              </div>
              <div className="pl-stats">
                <div className="pl-stat">
                  <div className="pl-statnum">
                    {weekDone}
                    <span style={{ fontSize: 13, color: "#767A83", fontWeight: 500 }}>/ {weekTotal}</span>
                  </div>
                  <div className="pl-statlbl">Tasks done</div>
                </div>
                <div className="pl-stat">
                  <div className="pl-statnum">{rate}%</div>
                  <div className="pl-statlbl">Completion</div>
                </div>
                <div className="pl-stat">
                  <div className="pl-statnum">{habitCheckins}</div>
                  <div className="pl-statlbl">Habit check-ins</div>
                </div>
                <div className="pl-stat">
                  <div className="pl-statnum" style={{ color: bestStreak.s ? "#89540E" : "#767A83" }}>
                    <Flame size={18} /> {bestStreak.s}
                  </div>
                  <div className="pl-statlbl">Best streak</div>
                </div>
              </div>
              <div className="pl-chart">
                {perDay.map((d) => (
                  <div key={d.iso} className="pl-barc">
                    <span className="pl-barn">{d.done || ""}</span>
                    <div className={`pl-bar${d.iso === todayIso ? " today" : ""}`} style={{ height: `${(d.done / maxDone) * 100}%` }} />
                    <span className="pl-barl">{parseLocal(d.iso).toLocaleDateString(undefined, { weekday: "narrow" })}</span>
                  </div>
                ))}
              </div>
              <div className="pl-revnote">
                {weekDone > 0 ? (
                  <>
                    You completed <b>{weekDone}</b> of {weekTotal} planned tasks ({rate}%)
                    {bestDay && bestDay.done > 0 && (
                      <>
                        {" "}
                        {"\u2014"} your strongest day was <b>{parseLocal(bestDay.iso).toLocaleDateString(undefined, { weekday: "long" })}</b> with {bestDay.done} done.
                      </>
                    )}
                    {bestStreak.s > 0 && (
                      <>
                        {" "}
                        You carried a <b>{bestStreak.s}-day</b> streak on "{bestStreak.name}". {"\uD83D\uDD25"}
                      </>
                    )}
                  </>
                ) : (
                  "This week wrapped up with nothing checked off. A fresh week is a clean slate."
                )}
              </div>
            </div>
          ) : (
            <div className="pl-revlock">
              <Lock size={15} />
              <span>
                Your week in review unlocks once <b style={{ color: "var(--ink)" }}>{relWeek.toLowerCase()}</b> wraps up. Keep the days filling {"\u2014"} come back after {parseLocal(wd[6]).toLocaleDateString(undefined, { weekday: "long" })}.
              </span>
            </div>
          ))}

        {panelTask && (
          <div className="pl-overlay" onClick={() => setPanelId(null)}>
            <div className="pl-modal" onClick={(e) => e.stopPropagation()}>
              <input
                className="pl-modtitle"
                autoFocus
                placeholder="Task name"
                value={panelTask.title}
                onChange={(e) => setTitleCat(panelTask.id, e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") setPanelId(null);
                }}
              />

              <div className="pl-modlbl">Category</div>
              <div className="pl-chips">
                <button className={`pl-chip${!panelTask.category ? " on" : ""}`} onClick={() => assignCategory(panelTask.id, null)}>
                  None
                </button>
                {CATEGORIES.map((c) => (
                  <button
                    key={c.id}
                    className={`pl-chip${panelTask.category === c.id ? " on" : ""}`}
                    onClick={() => assignCategory(panelTask.id, c.id)}
                  >
                    <i style={{ background: colorOf(c.color).bar }} /> {c.label}
                  </button>
                ))}
              </div>

              <div className="pl-modlbl">Priority</div>
              <div className="pl-prio">
                {PRIORITIES.map((pr) => (
                  <button
                    key={pr}
                    className={(panelTask.priority || "normal") === pr ? "on" : ""}
                    onClick={() => patch(panelTask.id, { priority: pr })}
                  >
                    {pr}
                  </button>
                ))}
              </div>

              <div className="pl-modlbl">Hours</div>
              <div className="pl-hours">
                <label>
                  Planned
                  <input
                    type="number"
                    min="0"
                    step="0.25"
                    value={(panelTask.duration || 60) / 60}
                    onChange={(e) => setPlannedHours(panelTask.id, e.target.value)}
                  />
                </label>
                <label>
                  Actual
                  <input
                    type="number"
                    min="0"
                    step="0.25"
                    placeholder="--"
                    value={panelTask.actualMin != null ? panelTask.actualMin / 60 : ""}
                    onChange={(e) => setActualHours(panelTask.id, e.target.value)}
                  />
                </label>
              </div>

              <div className="pl-modfoot">
                <button className="pl-delm" onClick={() => { remove(panelTask.id); setPanelId(null); }}>
                  Delete task
                </button>
                <button className="pl-btn mini" onClick={() => setPanelId(null)}>
                  Done
                </button>
              </div>
            </div>
          </div>
        )}

        {rollOpen && (
          <div className="pl-overlay" onClick={() => setRollOpen(false)}>
            <div className="pl-modal wide" onClick={(e) => e.stopPropagation()}>
              <div className="pl-rollhead">
                <span className="pl-revtitle">Roll over unfinished</span>
                <span className="pl-revsub">to {parseLocal(todayIso).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
              </div>
              <div className="pl-modlbl" style={{ marginTop: 8 }}>
                Last 2 weeks are checked by default{olderCount > 0 ? ` \u00B7 ${olderCount} older left unchecked` : ""}
              </div>
              <div className="pl-rollacts">
                <button className="pl-clear" style={{ textDecoration: "none" }} onClick={() => setRollSel(new Set(rollCands.map((t) => t.id)))}>
                  Select all
                </button>
                <button className="pl-clear" style={{ textDecoration: "none" }} onClick={() => setRollSel(new Set())}>
                  Clear
                </button>
              </div>
              <div className="pl-rolllist">
                {rollCands.length === 0 && <div className="pl-emptynote">Nothing to roll over {"\u2014"} you're all caught up.</div>}
                {rollCands.map((t) => {
                  const col = taskColor(t);
                  const n = Math.round((parseLocal(todayIso) - parseLocal(t.date)) / 86400000);
                  const older = t.date < recentCutoff;
                  const sel = rollSel.has(t.id);
                  return (
                    <div key={t.id} className="pl-rollrow">
                      <button className={`pl-rcb${sel ? " on" : ""}`} onClick={() => toggleRoll(t.id)} aria-label="Toggle rollover">
                        {sel && <Check size={12} strokeWidth={3} />}
                      </button>
                      <span className="pl-rdot" style={{ background: col.bar }} />
                      <span className="pl-rtitle">{t.title || "Untitled"}</span>
                      {older && <span className="pl-rold">2+ wks</span>}
                      <span className="pl-rdate">{n}d ago</span>
                      <button className="pl-rdel" onClick={() => deleteFromRoll(t.id)} aria-label="Delete task">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  );
                })}
              </div>
              <div className="pl-modfoot">
                {olderCount > 0 ? (
                  <button className="pl-delm" onClick={deleteOlder}>
                    Delete {olderCount} older than 2 weeks
                  </button>
                ) : (
                  <span />
                )}
                <span style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <button className="pl-clear" onClick={() => setRollOpen(false)}>
                    Cancel
                  </button>
                  <button className="pl-btn mini" onClick={doRollover}>
                    Roll over {rollSel.size}
                  </button>
                </span>
              </div>
            </div>
          </div>
        )}

        {!loading && (
          <div className="pl-foot">
            <span>
              {tasks.filter((t) => !t.done).length} open {"\u00B7"} {tasks.filter((t) => t.done).length} done
            </span>
            {tasks.some((t) => t.done) && (
              <button className="pl-clear" onClick={() => setTasks((p) => p.filter((t) => !t.done))}>
                Clear completed
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}