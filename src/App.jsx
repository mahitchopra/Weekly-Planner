import { useState, useEffect, useLayoutEffect, useRef } from "react";
import { Check, Trash2, ChevronLeft, ChevronRight, Pencil, Flame, X, Lock } from "lucide-react";
import { store } from "./storage.js";

// ---------- constants ----------
const DAY_START = 6 * 60;
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

const FONTS =
  "@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Inter:wght@400;500;600&display=swap');";

const STYLE = `
.pl-root{--paper:#F6F5F0;--ink:#1A1C22;--muted:#767A83;--line:#E7E7DE;--line2:#DBDBD0;
  --blue:#3B72D9;--blue-deep:#2A56B0;--card:#FCFCF8;
  font-family:'Inter',ui-sans-serif,system-ui,sans-serif;color:var(--ink);min-height:100vh;
  background-color:var(--paper);
  background-image:linear-gradient(var(--line) 1px,transparent 1px),linear-gradient(90deg,var(--line) 1px,transparent 1px);
  background-size:26px 26px;padding:22px 14px 60px;-webkit-font-smoothing:antialiased;}
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
.pl-progbar{flex:1;height:5px;border-radius:3px;background:#E6E6DC;overflow:hidden;}
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
.pl-hx{opacity:0;border:none;background:none;cursor:pointer;color:#BDBEB4;padding:0;display:grid;place-items:center;}
.pl-habrow:hover .pl-hx{opacity:1;}
.pl-hx:hover{color:#E8563F;}
.pl-hcell{height:24px;border-radius:6px;border:1px solid var(--line2);background:#fff;cursor:pointer;display:grid;place-items:center;color:#fff;}
.pl-hcell.today{box-shadow:inset 0 0 0 1.5px rgba(59,114,217,.5);}
.pl-hstreak{display:flex;align-items:center;gap:3px;justify-content:flex-end;font-size:12px;font-weight:600;color:#89540E;font-variant-numeric:tabular-nums;}
.pl-hstreak.zero{color:var(--line2);}
.pl-addhabit{display:flex;gap:6px;margin-top:6px;}
.pl-addhabit input{flex:1;font:inherit;font-size:13px;border:1px solid var(--blue);border-radius:6px;padding:6px 8px;}
.pl-btn.mini{background:var(--blue);color:#fff;border-color:var(--blue);}

.pl-calscroll{overflow:auto;border:1px solid var(--line);border-radius:10px;background:var(--card);}
.pl-cal{display:grid;grid-template-columns:52px repeat(7,minmax(118px,1fr));min-width:900px;}
.pl-head-cell{position:sticky;top:0;z-index:6;background:var(--card);border-bottom:1px solid var(--line2);
  height:48px;overflow:hidden;display:flex;flex-direction:column;align-items:center;justify-content:center;}
.pl-head-cell.gutter{border-right:1px solid var(--line);}
.pl-dow{position:relative;z-index:2;font-family:'Space Grotesk',sans-serif;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);}
.pl-dnum{position:relative;z-index:2;font-family:'Space Grotesk',sans-serif;font-size:16px;font-weight:600;}
.pl-head-cell.istoday{background:#EEF3FE;}
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
.pl-bcheck{width:14px;height:14px;border-radius:50%;border:1.4px solid;background:#fff;display:grid;place-items:center;cursor:pointer;flex:0 0 auto;padding:0;}
.pl-block.done .pl-bcheck{background:currentColor;}
.pl-btitle{font-size:11.5px;font-weight:600;line-height:1.15;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;word-break:break-word;}
.pl-block.done .pl-btitle{text-decoration:line-through;}
.pl-btime{font-size:9.5px;opacity:.75;margin-top:1px;}
.pl-binput{width:100%;font:inherit;font-size:11.5px;font-weight:600;border:none;border-bottom:1px solid currentColor;background:transparent;color:inherit;padding:0;}
.pl-binput:focus{outline:none;}
.pl-binput::placeholder{color:currentColor;opacity:.5;}
.pl-btools{position:absolute;top:2px;right:3px;display:flex;gap:2px;opacity:0;transition:opacity .1s;}
.pl-block:hover .pl-btools{opacity:1;}
.pl-btools button{width:16px;height:16px;display:grid;place-items:center;border:none;background:rgba(255,255,255,.8);border-radius:4px;cursor:pointer;color:#555;padding:0;}
.pl-btools button:hover{color:#111;}
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

  const measure = () => {
    const el = calRef.current;
    if (!el) return;
    const top = el.getBoundingClientRect().top;
    const avail = Math.max(300, window.innerHeight - top - 18);
    setCalH(avail);
    setHourH(clamp((avail - HEADER_ROW) / HOURS_COUNT, 26, 74));
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
      { id, title: "", date: iso, start, duration, color: PALETTE[p.length % PALETTE.length].name, done: false, createdAt: Date.now() },
    ]);
    setEditingId(id);
  };
  const toggle = (id) => {
    const task = tasks.find((t) => t.id === id);
    if (!task) return;
    const newDone = !task.done;
    setTasks((p) => p.map((t) => (t.id === id ? { ...t, done: newDone } : t)));
    const name = (task.title || "").trim().toLowerCase();
    if (!name || !task.date) return;
    if (!habits.some((h) => (h.name || "").trim().toLowerCase() === name)) return;
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
  const cycleColor = (id) =>
    setTasks((p) =>
      p.map((t) => {
        if (t.id !== id) return t;
        const i = PALETTE.findIndex((c) => c.name === t.color);
        return { ...t, color: PALETTE[(i + 1) % PALETTE.length].name };
      })
    );
  const remove = (id) => setTasks((p) => p.filter((t) => t.id !== id));
  const rename = (id, v) => setTasks((p) => p.map((t) => (t.id === id ? { ...t, title: v } : t)));
  const rollover = () => {
    setTasks((p) => p.map((t) => (!t.done && t.date < todayIso ? { ...t, date: todayIso } : t)));
    setOffset(0);
  };
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

  const weekOver = parseLocal(wd[6]) < parseLocal(todayIso);

  const first = parseLocal(wd[0]);
  const last = parseLocal(wd[6]);
  const sameMonth = first.getMonth() === last.getMonth();
  const rangeLabel = sameMonth
    ? `${first.toLocaleDateString(undefined, { month: "long" })} ${first.getDate()} â€“ ${last.getDate()}`
    : `${first.toLocaleDateString(undefined, { month: "short", day: "numeric" })} â€“ ${last.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
  const relWeek = offset === 0 ? "This week" : offset === 1 ? "Next week" : offset === -1 ? "Last week" : `${offset > 0 ? "+" : ""}${offset} weeks`;
  const nowD = new Date(now);
  const nowMin = nowD.getHours() * 60 + nowD.getMinutes();
  const hours = [];
  for (let h = DAY_START / 60; h <= DAY_END / 60; h++) hours.push(h);

  return (
    <div className="pl-root">
      <style>{FONTS}</style>
      <style>{STYLE}</style>
      <div className="pl-wrap">
        <div className="pl-top">
          <div>
            <div className="pl-eyebrow">{relWeek}</div>
            <h1 className="pl-h1">{rangeLabel}</h1>
          </div>
          <div className="pl-nav">
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
            <button className="pl-btn roll" onClick={rollover}>
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
            <span className="pl-hlabel">Habits Â- streaks</span>
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
          <div className="pl-loading">Loading your plannerâ€¦</div>
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
                      backgroundColor: isToday ? "#FBFCFF" : undefined,
                      backgroundImage: `repeating-linear-gradient(#EDEDE5 0, #EDEDE5 1px, transparent 1px, transparent ${hourH}px)`,
                    }}
                    onClick={(e) => {
                      if (e.target === e.currentTarget) createAt(iso, e.clientY);
                    }}
                  >
                    {isToday && nowMin >= DAY_START && nowMin <= DAY_END && (
                      <div className="pl-nowline" style={{ top: (nowMin - DAY_START) * PX }} />
                    )}
                    {dayTasks.map((t) => {
                      const col = colorOf(t.color);
                      const lg = lay[t.id] || { col: 0, total: 1 };
                      const w = 100 / lg.total;
                      const isDragging = drag && drag.id === t.id;
                      const top = (t.start - DAY_START) * PX;
                      const height = Math.max((t.duration || 60) * PX, 20);
                      return (
                        <div
                          key={t.id}
                          className={`pl-block${t.done ? " done" : ""}${isDragging ? " dragging" : ""}`}
                          onPointerDown={(e) => onPointerDown(e, t)}
                          onPointerMove={onPointerMove}
                          onPointerUp={onPointerUp}
                          style={{
                            top,
                            height,
                            left: `calc(${lg.col * w}% + 2px)`,
                            width: `calc(${w}% - 4px)`,
                            borderLeftColor: col.bar,
                            background: t.done ? "#F3F3EE" : col.tint,
                            color: col.ink,
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
                                placeholder="Name this taskâ€¦"
                                defaultValue={t.title}
                                onPointerDown={(e) => e.stopPropagation()}
                                onBlur={(e) => {
                                  const v = e.target.value.trim();
                                  if (!v && !t.title) remove(t.id);
                                  else if (v) rename(t.id, v);
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
                              {fmtTime(t.start)} â€“ {fmtTime(t.start + (t.duration || 60))}
                            </div>
                          )}
                          <div className="pl-btools" data-nodrag onPointerDown={(e) => e.stopPropagation()}>
                            <button onClick={() => cycleColor(t.id)} aria-label="Color" title="Change color">
                              <span style={{ width: 9, height: 9, borderRadius: "50%", background: col.bar, display: "block" }} />
                            </button>
                            <button onClick={() => setEditingId(t.id)} aria-label="Rename">
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
        <div className="pl-hint">Click any empty slot to add a task. Drag a block to move it; drag its bottom edge to resize. Check tasks off and each day's header fills with water.</div>

        {/* Week in review â€” only once the week has finished */}
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
                        â€” your strongest day was <b>{parseLocal(bestDay.iso).toLocaleDateString(undefined, { weekday: "long" })}</b> with {bestDay.done} done.
                      </>
                    )}
                    {bestStreak.s > 0 && (
                      <>
                        {" "}
                        You carried a <b>{bestStreak.s}-day</b> streak on "{bestStreak.name}". ðŸ”¥
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
                Your week in review unlocks once <b style={{ color: "var(--ink)" }}>{relWeek.toLowerCase()}</b> wraps up. Keep the days filling â€” come back after {parseLocal(wd[6]).toLocaleDateString(undefined, { weekday: "long" })}.
              </span>
            </div>
          ))}

        {!loading && (
          <div className="pl-foot">
            <span>
              {tasks.filter((t) => !t.done).length} open Â- {tasks.filter((t) => t.done).length} done
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
