import { useState, useEffect, useMemo, useRef } from "react";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, ReferenceLine, Cell, CartesianGrid
} from "recharts";
import { loadTrades, saveTrade, saveAll, removeTrade, useCloud } from "./storage.js";

const G = "#a5b285";   // sage olive — wins/positive
const R = "#8a4339";   // oxblood — losses/negative
const GOLD = "#c6a44c"; // brass — brand accent
const APP_PIN = import.meta.env.VITE_APP_PIN || "1234";
const PIN_KEY = "tn-pin-ok";

const SETUPS = ["Breakout","Pullback","Reversal","Momentum","Gap Fill","VWAP Reclaim","Support/Resistance","Earnings","Scalp","Other"];
const EMOTIONS = ["Disciplined","Confident","Neutral","Anxious","FOMO","Revenge","Impatient","Overconfident"];
const GRADES = ["A+","A","B","C","D"];

const blank = () => ({
  id: Date.now(),
  date: new Date().toISOString().slice(0,10),
  time: "",
  symbol: "",
  direction: "Long",
  setup: "Breakout",
  entry: "",
  exit: "",
  size: "",
  pnl: "",
  rMultiple: "",
  grade: "A",
  emotion: "Neutral",
  notes: "",
  screenshots: [],
  screenshotsTouched: false,
});

const fmt$ = (n) => {
  const v = parseFloat(n) || 0;
  return (v >= 0 ? "+$" : "-$") + Math.abs(v).toFixed(2);
};
const fmtN = (n, d=2) => {
  const v = parseFloat(n) || 0;
  return (v >= 0 ? "+" : "") + v.toFixed(d);
};
const pnlColor = (n) => (parseFloat(n) || 0) >= 0 ? G : R;

function exportCsv(trades) {
  const cols = ["id","date","time","symbol","direction","setup","entry","exit","size","pnl","rMultiple","grade","emotion","notes"];
  const esc = (v) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [cols.join(",")];
  trades.forEach(t => lines.push(cols.map(c => esc(t[c])).join(",")));
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `tradevault-${new Date().toISOString().slice(0,10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function App() {
  return <TradingJournal />;
}

function PinModal({ onPass, onCancel, title="Confirm PIN", subtitle="Required to add or modify trades" }) {
  const [pin, setPin] = useState("");
  const [err, setErr] = useState(false);
  const [shake, setShake] = useState(false);
  const submit = () => {
    if (pin === APP_PIN) {
      try { sessionStorage.setItem(PIN_KEY, "1"); } catch {}
      onPass();
    } else {
      setErr(true); setShake(true);
      setTimeout(() => setShake(false), 400);
      setPin("");
    }
  };
  return (
    <div style={{
      position:"fixed",inset:0,zIndex:1000,
      background:"rgba(8,8,16,0.85)",backdropFilter:"blur(6px)",
      display:"flex",alignItems:"center",justifyContent:"center",
      fontFamily:"'Manrope',sans-serif"
    }} onClick={onCancel}>
      <style>{`
        @keyframes pinShake { 0%,100%{transform:translateX(0)} 25%{transform:translateX(-8px)} 75%{transform:translateX(8px)} }
        .pin-shake { animation: pinShake 0.4s ease; }
      `}</style>
      <div className={shake?"pin-shake":""} onClick={e=>e.stopPropagation()} style={{
        background:"#121e34",border:"1px solid #1c2c45",borderRadius:14,
        padding:32,minWidth:300,textAlign:"center",
        boxShadow:"0 20px 60px rgba(0,0,0,0.5)"
      }}>
        <img src="/logo.webp" alt="Mahmudur TradeVault" style={{width:160,height:"auto",objectFit:"contain",marginBottom:8}}/>
        <div style={{fontFamily:"'Manrope',sans-serif",fontWeight:700,fontSize:14,color:"#eee0bf",lineHeight:1.2,marginTop:4}}>{title}</div>
        <div style={{fontSize:11,color:"#7e8aa4",marginTop:6,letterSpacing:1,fontFamily:"'JetBrains Mono',monospace"}}>{subtitle}</div>
        <input
          type="password" inputMode="numeric" autoFocus value={pin}
          onChange={e=>{setPin(e.target.value);setErr(false);}}
          onKeyDown={e=>{if(e.key==="Enter")submit();if(e.key==="Escape")onCancel();}}
          placeholder="• • • •"
          style={{
            width:"100%",marginTop:20,background:"#0e1a2e",border:`1px solid ${err?R:"#26385a"}`,
            borderRadius:8,padding:"14px 16px",color:GOLD,
            fontSize:22,fontFamily:"'JetBrains Mono',monospace",
            textAlign:"center",letterSpacing:8,outline:"none"
          }}
        />
        <div style={{display:"flex",gap:8,marginTop:12}}>
          <button onClick={onCancel} style={{
            flex:1,background:"transparent",border:"1px solid #26385a",borderRadius:8,
            padding:"11px",color:"#7a8aa8",fontWeight:600,fontSize:12,cursor:"pointer",
            letterSpacing:1,textTransform:"uppercase",fontFamily:"'Manrope',sans-serif"
          }}>Cancel</button>
          <button onClick={submit} style={{
            flex:2,background:GOLD,border:"none",borderRadius:8,
            padding:"11px",color:"#0a0a0a",fontWeight:700,fontSize:12,cursor:"pointer",
            letterSpacing:1,textTransform:"uppercase",fontFamily:"'Manrope',sans-serif"
          }}>Confirm</button>
        </div>
        {err && <div style={{color:R,fontSize:11,marginTop:10,fontFamily:"'JetBrains Mono',monospace"}}>incorrect pin</div>}
      </div>
    </div>
  );
}

function Brand({size="header", showLock=false, onLock}) {
  const hero = size==="hero";
  return (
    <div style={{display:"inline-flex",flexDirection:"column",alignItems:"center",gap:hero?10:0}}>
      <div style={{
        width:hero?56:30,height:hero?56:30,
        border:`1px solid ${GOLD}`,
        transform:"rotate(45deg)",
        display:"flex",alignItems:"center",justifyContent:"center",
        background:"rgba(201,168,64,0.04)"
      }}>
        <span style={{
          transform:"rotate(-45deg)",
          color:GOLD,fontFamily:"'Cormorant Garamond',serif",fontStyle:"italic",
          fontWeight:500,fontSize:hero?28:16,lineHeight:1
        }}>M</span>
      </div>
      {hero ? (
        <>
          <div style={{
            fontFamily:"'Cormorant Garamond',serif",fontStyle:"italic",fontWeight:500,
            fontSize:34,color:"#eee0bf",letterSpacing:1,lineHeight:1,marginTop:6
          }}>Mahmudur</div>
          <div style={{display:"flex",alignItems:"center",gap:10,marginTop:2}}>
            <div style={{width:30,height:1,background:GOLD,opacity:0.5}}/>
            <span style={{
              fontFamily:"'Manrope',sans-serif",fontWeight:700,fontSize:11,
              color:GOLD,letterSpacing:6,textTransform:"uppercase"
            }}>Trade Note</span>
            <div style={{width:30,height:1,background:GOLD,opacity:0.5}}/>
          </div>
          <div style={{fontSize:9,color:"#4a5a78",letterSpacing:3,fontFamily:"'JetBrains Mono',monospace",marginTop:8}}>EST · MMXXVI</div>
        </>
      ) : (
        <div style={{display:"flex",flexDirection:"column",alignItems:"flex-start",marginLeft:10,position:"absolute",left:64,top:10}}>
          <span style={{fontFamily:"'Cormorant Garamond',serif",fontStyle:"italic",fontWeight:500,fontSize:15,color:"#eee0bf",lineHeight:1}}>Mahmudur</span>
          <span style={{fontFamily:"'Manrope',sans-serif",fontWeight:700,fontSize:8,color:GOLD,letterSpacing:3,textTransform:"uppercase",marginTop:2}}>Trade Note</span>
        </div>
      )}
      {showLock && (
        <button onClick={onLock} title="Lock" style={{
          position:"absolute",right:24,top:14,background:"transparent",border:"1px solid #26385a",
          borderRadius:6,padding:"5px 10px",color:"#7a8aa8",fontSize:10,cursor:"pointer",
          fontFamily:"'JetBrains Mono',monospace",letterSpacing:1
        }}>LOCK</button>
      )}
    </div>
  );
}

function TradingJournal() {
  const [trades, setTrades] = useState([]);
  const [view, setView] = useState("dashboard");
  const [form, setForm] = useState(blank());
  const [selected, setSelected] = useState(null);
  const [filter, setFilter] = useState({ symbol: "", dir: "All", result: "All", setup: "All" });
  const [loaded, setLoaded] = useState(false);
  const [unlocked, setUnlocked] = useState(() => {
    try { return sessionStorage.getItem(PIN_KEY) === "1"; } catch { return false; }
  });
  const [pendingAction, setPendingAction] = useState(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const [lightbox, setLightbox] = useState(null); // {urls:[], index:0}
  const [isMobile, setIsMobile] = useState(() => typeof window !== "undefined" && window.innerWidth < 640);
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 640);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  const fileRef = useRef();

  const showToast = (msg, type="info") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const requireUnlock = (action) => {
    if (unlocked) action();
    else setPendingAction(() => action);
  };
  const lock = () => {
    try { sessionStorage.removeItem(PIN_KEY); } catch {}
    setUnlocked(false);
  };

  const reloadTrades = async () => {
    try {
      const data = await loadTrades();
      setTrades(data);
      setSelected(s => s ? (data.find(d => d.id === s.id) || s) : s);
    } catch (e) { console.error(e); }
  };
  useEffect(() => {
    (async () => { await reloadTrades(); setLoaded(true); })();
  }, []);

  const imgRetryRef = useRef(0);
  const onImgError = () => {
    const now = Date.now();
    if (now - imgRetryRef.current < 5000) return;
    imgRetryRef.current = now;
    reloadTrades();
  };

  const [ledger, setLedger] = useState([]);
  const [ledgerModal, setLedgerModal] = useState(null);
  const reloadLedger = async () => {
    try {
      const r = await fetch("/api/ledger");
      if (!r.ok) throw new Error("api " + r.status);
      setLedger(await r.json());
    } catch (e) { console.warn("ledger load failed:", e); }
  };
  useEffect(() => { reloadLedger(); }, []);

  const [strategyRules, setStrategyRules] = useState([]);
  const [checkedRules, setCheckedRules] = useState({});
  useEffect(() => {
    if (view !== "add") return;
    (async () => {
      try {
        const r = await fetch("/api/strategy");
        if (!r.ok) return;
        const list = await r.json();
        setStrategyRules(list.filter(x => x.type === "Rule").sort((a,b)=>a.order-b.order));
      } catch {}
    })();
    setCheckedRules({});
  }, [view, form.id]);
  const allRulesChecked = strategyRules.length > 0 && strategyRules.every(r => checkedRules[r.id]);

  const addTrade = async () => {
    if (!form.symbol) { showToast("Symbol is required", "err"); return; }
    if (form.pnl === "" || form.pnl == null) { showToast("P&L is required", "err"); return; }
    setSaving(true);
    const t = { ...form, id: Date.now() };
    const updated = [...trades, t].sort((a,b) => new Date(a.date)-new Date(b.date));
    setTrades(updated);
    try {
      await saveTrade(t);
      if (!useCloud) await saveAll(updated);
      showToast("Saved to Notion ✓", "ok");
      setForm(blank()); setView("journal");
    } catch (e) {
      console.error("save failed:", e);
      showToast("Save failed: " + (e?.message || "unknown"), "err");
      setTrades(trades);
    } finally { setSaving(false); }
  };

  const updateTrade = async () => {
    setSaving(true);
    const updated = trades.map(t => t.id === form.id ? form : t);
    setTrades(updated);
    try {
      await saveTrade(form);
      if (!useCloud) await saveAll(updated);
      showToast("Updated ✓", "ok");
      setSelected(form); setView("detail");
    } catch (e) {
      console.error("update failed:", e);
      showToast("Update failed: " + (e?.message || "unknown"), "err");
    } finally { setSaving(false); }
  };

  const deleteTrade = async (id) => {
    const prev = trades;
    const updated = trades.filter(t => t.id !== id);
    setTrades(updated);
    try {
      await removeTrade(id);
      if (!useCloud) await saveAll(updated);
      showToast("Deleted ✓", "ok");
      setSelected(null); setView("journal");
    } catch (e) {
      console.error("delete failed:", e);
      showToast("Delete failed: " + (e?.message || "unknown"), "err");
      setTrades(prev);
    }
  };

  const handleFile = (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    Promise.all(files.map(f => new Promise((res, rej) => {
      const rd = new FileReader();
      rd.onload = ev => res(ev.target.result);
      rd.onerror = rej;
      rd.readAsDataURL(f);
    }))).then(urls => {
      setForm(p => ({
        ...p,
        screenshots: [...(p.screenshots || []), ...urls],
        screenshotsTouched: true,
      }));
    }).catch(err => { console.error(err); showToast("Image read failed", "err"); });
    e.target.value = "";
  };

  const removeScreenshot = (idx) => {
    setForm(p => ({
      ...p,
      screenshots: (p.screenshots || []).filter((_, i) => i !== idx),
      screenshotsTouched: true,
    }));
  };

  const metrics = useMemo(() => {
    if (!trades.length) return null;
    const sorted = [...trades].sort((a,b) => new Date(a.date)-new Date(b.date));
    const wins = sorted.filter(t => (parseFloat(t.pnl)||0) > 0);
    const losses = sorted.filter(t => (parseFloat(t.pnl)||0) < 0);
    const totalPnl = sorted.reduce((a,t) => a + (parseFloat(t.pnl)||0), 0);
    const winRate = (wins.length / sorted.length) * 100;
    const grossProfit = wins.reduce((a,t) => a + (parseFloat(t.pnl)||0), 0);
    const grossLoss = Math.abs(losses.reduce((a,t) => a + (parseFloat(t.pnl)||0), 0));
    const profitFactor = grossLoss > 0 ? grossProfit/grossLoss : grossProfit > 0 ? 999 : 0;
    const avgWin = wins.length ? grossProfit/wins.length : 0;
    const avgLoss = losses.length ? grossLoss/losses.length : 0;
    const expectancy = (winRate/100)*avgWin - ((100-winRate)/100)*avgLoss;
    const pnls = sorted.map(t => parseFloat(t.pnl)||0);
    const bestTrade = Math.max(...pnls);
    const worstTrade = Math.min(...pnls);

    let cum = 0, peak = 0, maxDD = 0;
    const equity = sorted.map(t => {
      cum += parseFloat(t.pnl)||0;
      if (cum > peak) peak = cum;
      const dd = peak - cum; if (dd > maxDD) maxDD = dd;
      return { date: t.date.slice(5), eq: parseFloat(cum.toFixed(2)), pnl: parseFloat(t.pnl)||0 };
    });

    let mxW=0, mxL=0, cW=0, cL=0;
    sorted.forEach(t => {
      const p = parseFloat(t.pnl)||0;
      if (p>0){cW++;cL=0;if(cW>mxW)mxW=cW;}else{cL++;cW=0;if(cL>mxL)mxL=cL;}
    });
    let streak=0, streakType="win";
    const rev = [...sorted].reverse();
    const lp = parseFloat(rev[0]?.pnl)||0;
    streakType = lp>=0?"win":"loss";
    for (const t of rev){const p=parseFloat(t.pnl)||0;if((p>=0&&streakType==="win")||(p<0&&streakType==="loss"))streak++;else break;}

    const dm = {};
    sorted.forEach(t=>{const d=t.date;if(!dm[d])dm[d]=0;dm[d]+=(parseFloat(t.pnl)||0);});
    const daily = Object.entries(dm).sort(([a],[b])=>new Date(a)-new Date(b)).slice(-30)
      .map(([d,p])=>({date:d.slice(5),pnl:parseFloat(p.toFixed(2))}));

    const sm = {};
    sorted.forEach(t=>{if(!sm[t.symbol])sm[t.symbol]={pnl:0,n:0};sm[t.symbol].pnl+=(parseFloat(t.pnl)||0);sm[t.symbol].n++;});
    const symbols = Object.entries(sm).sort(([,a],[,b])=>b.pnl-a.pnl).slice(0,6)
      .map(([s,d])=>({s,pnl:parseFloat(d.pnl.toFixed(2)),n:d.n}));

    const setM = {};
    sorted.forEach(t=>{const s=t.setup||"Other";if(!setM[s])setM[s]={pnl:0,n:0,w:0};setM[s].pnl+=(parseFloat(t.pnl)||0);setM[s].n++;if((parseFloat(t.pnl)||0)>0)setM[s].w++;});
    const setupPerf = Object.entries(setM).sort(([,a],[,b])=>b.pnl-a.pnl)
      .map(([s,d])=>({s,pnl:parseFloat(d.pnl.toFixed(2)),n:d.n,wr:((d.w/d.n)*100).toFixed(0)}));

    return {totalPnl,winRate,profitFactor,avgWin,avgLoss,expectancy,bestTrade,worstTrade,
      equity,maxDD,mxW,mxL,streak,streakType,daily,symbols,setupPerf,
      total:sorted.length,nWins:wins.length,nLosses:losses.length};
  }, [trades]);

  const filtered = useMemo(() => [...trades]
    .sort((a,b)=>new Date(b.date)-new Date(a.date))
    .filter(t=>{
      if(filter.symbol && !t.symbol.toLowerCase().includes(filter.symbol.toLowerCase())) return false;
      if(filter.dir!=="All" && t.direction!==filter.dir) return false;
      if(filter.result==="Win" && (parseFloat(t.pnl)||0)<=0) return false;
      if(filter.result==="Loss" && (parseFloat(t.pnl)||0)>=0) return false;
      if(filter.setup!=="All" && t.setup!==filter.setup) return false;
      return true;
    }), [trades, filter]);

  const S = styles;

  if (!loaded) return <div style={S.root}><div style={{color:"#5a6b88",margin:"auto",fontFamily:"monospace"}}>Loading…</div></div>;

  return (
    <div style={isMobile ? {...S.root, height:"auto", minHeight:"100dvh", overflow:"visible"} : S.root}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700&family=Manrope:wght@400;500;600;700;800&family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400;1,500;1,600&family=Cinzel:wght@400;500;600;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        html { scroll-behavior: smooth; }
        html, body { background: radial-gradient(ellipse at top, #14233e 0%, #0b1424 55%, #07101c 100%); background-attachment: fixed; overscroll-behavior:none; -webkit-overflow-scrolling:touch; color:#eee0bf; }
        ::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-track { background: #0e1a2e; }
        ::-webkit-scrollbar-thumb { background: #2a3a55; border-radius: 2px; }
        input, textarea, select { outline: none; }
        input::placeholder, textarea::placeholder { color: #4a5a78; }
      `}</style>

      {isMobile ? (
        <>
          <div style={{position:"sticky",top:0,zIndex:50,background:"#0e1a2e",boxShadow:"0 2px 8px rgba(0,0,0,0.4)"}}>
            <div style={{...S.header, justifyContent:"center", position:"relative"}}>
              <img src="/logo.webp" alt="Mahmudur TradeVault" style={{height:42,width:"auto",objectFit:"contain"}}/>
              <div style={{position:"absolute",right:12,top:"50%",transform:"translateY(-50%)",display:"flex",alignItems:"center",gap:8}}>
                {metrics && <span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:11,color:pnlColor(metrics.totalPnl),fontWeight:700}}>{fmt$(metrics.totalPnl)}</span>}
                <button onClick={lock} title={unlocked?"Lock":"Locked"} style={{
                  background:unlocked?"rgba(201,168,64,0.08)":"transparent",
                  border:`1px solid ${unlocked?GOLD+"55":"#26385a"}`,borderRadius:6,
                  padding:"5px 8px",color:unlocked?GOLD:"#7a8aa8",fontSize:12,cursor:"pointer",
                  fontFamily:"'JetBrains Mono',monospace"
                }}>{unlocked?"🔓":"🔒"}</button>
              </div>
            </div>
            <div style={{
              display:"flex",background:"#0e1a2e",borderBottom:"1px solid #14223a",
              justifyContent:"space-around",flexShrink:0
            }}>
              {[["dashboard","Dashboard"],["journal","Journal"],["add","Trade Entry"],["strategy","Strategy"],["target","Target"],["portfolio","Portfolio"]].map(([v,l])=>{
                const active = view===v || ((view==="detail"||view==="edit") && v==="journal");
                return (
                  <button key={v} onClick={()=>{
                    if (v==="add") requireUnlock(()=>{setForm(blank());setView("add");});
                    else setView(v);
                  }} style={{
                    flex:1,background:"transparent",border:"none",
                    padding:"10px 2px",
                    color:active?"#eee0bf":"#7e8aa4",
                    fontSize:10,fontFamily:"'Cinzel',serif",fontWeight:active?600:500,
                    cursor:"pointer",letterSpacing:1.5,whiteSpace:"nowrap",textTransform:"uppercase",
                    borderBottom:`2px solid ${active?GOLD:"transparent"}`
                  }}>{l}</button>
                );
              })}
            </div>
          </div>
        </>
      ) : (
        <div style={S.header}>
          <div style={{display:"flex",alignItems:"center",gap:8,position:"relative",flexShrink:0}}>
            <img src="/logo.webp" alt="Mahmudur TradeVault" style={{height:44,width:"auto",objectFit:"contain"}}/>
          </div>
          <div style={S.nav}>
            {[["dashboard","◆ Dashboard"],["journal","≡ Journal"],["add","+ Trade Entry"],["strategy","§ Strategy"],["target","◎ Target"],["portfolio","◈ Portfolio"]].map(([v,l])=>(
              <button key={v} onClick={()=>{
                if (v==="add") requireUnlock(()=>{setForm(blank());setView("add");});
                else setView(v);
              }} style={{...S.navBtn,
                ...(view===v||((view==="detail"||view==="edit")&&v==="journal")?S.navBtnActive:{})}}>
                {l}
              </button>
            ))}
          </div>
          <div style={S.headerRight}>
            {metrics && <span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:13,color:pnlColor(metrics.totalPnl),fontWeight:700}}>
              {fmt$(metrics.totalPnl)}
            </span>}
            <button onClick={lock} title={unlocked?"Lock writes":"Currently locked"} style={{
              background:unlocked?"rgba(201,168,64,0.08)":"transparent",
              border:`1px solid ${unlocked?GOLD+"55":"#26385a"}`,borderRadius:6,
              padding:"5px 10px",color:unlocked?GOLD:"#7a8aa8",fontSize:10,cursor:"pointer",
              fontFamily:"'JetBrains Mono',monospace",letterSpacing:1
            }}>{unlocked?"🔓 UNLOCKED":"🔒 LOCKED"}</button>
          </div>
        </div>
      )}

      <div style={isMobile ? {...S.body, flex:"none", overflowY:"visible", overscrollBehavior:"auto"} : S.body}>
        {view==="dashboard" && (
          <div style={S.page}>
            {!metrics ? (
              <div style={S.empty}>
                <div style={{fontSize:48,marginBottom:16}}>📊</div>
                <div style={{fontFamily:"'Manrope',sans-serif",fontWeight:700,fontSize:20,color:"#eee0bf",marginBottom:8}}>No trades yet</div>
                <div style={{color:"#5a6b88",fontSize:13,marginBottom:24}}>Start logging your trades to see advanced analytics</div>
                <button style={S.primaryBtn} onClick={()=>requireUnlock(()=>{setForm(blank());setView("add");})}>Log First Trade</button>
              </div>
            ) : (
              <>
                {metrics.streakType === "loss" && metrics.streak >= 3 && (
                  <div style={{
                    marginBottom:14,padding:"14px 18px",borderRadius:10,
                    background:"linear-gradient(135deg, rgba(138,67,57,0.18), rgba(138,67,57,0.04))",
                    border:`1px solid ${R}66`,
                    display:"flex",alignItems:"center",gap:14
                  }}>
                    <div style={{fontSize:22,lineHeight:1}}>⚠</div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontFamily:"'Cinzel',serif",fontSize:12,letterSpacing:2,color:R,textTransform:"uppercase",fontWeight:600}}>Step Back · {metrics.streak} Losses In A Row</div>
                      <div style={{fontFamily:"'Cormorant Garamond',serif",fontStyle:"italic",fontSize:15,color:"#eee0bf",marginTop:4}}>Review your rules before next entry. Patience over revenge.</div>
                    </div>
                    <button onClick={()=>setView("strategy")} style={{
                      background:"transparent",border:`1px solid ${R}66`,borderRadius:6,
                      padding:"6px 14px",color:R,fontSize:10,cursor:"pointer",
                      fontFamily:"'Cinzel',serif",letterSpacing:2,textTransform:"uppercase",fontWeight:600,
                      flexShrink:0
                    }}>Rules</button>
                  </div>
                )}

                <div style={S.kpiRow}>
                  {[
                    {label:"Total P&L", value:fmt$(metrics.totalPnl), color:pnlColor(metrics.totalPnl), sub:`${metrics.total} trades`},
                    {label:"Win Rate", value:`${metrics.winRate.toFixed(1)}%`, color:metrics.winRate>=50?G:R, sub:`${metrics.nWins}W / ${metrics.nLosses}L`},
                    {label:"Profit Factor", value:metrics.profitFactor>=999?"∞":metrics.profitFactor.toFixed(2), color:metrics.profitFactor>=1?G:R, sub:"Gross P / Gross L"},
                    {label:"Expectancy", value:fmt$(metrics.expectancy), color:pnlColor(metrics.expectancy), sub:"Per trade avg"},
                  ].map(k=>(
                    <div key={k.label} style={S.kpiCard}>
                      <div style={S.kpiLabel}>{k.label}</div>
                      <div style={{...S.kpiValue,color:k.color}}>{k.value}</div>
                      <div style={S.kpiSub}>{k.sub}</div>
                    </div>
                  ))}
                </div>

                <EquityCard ledger={ledger} trades={trades} onAdd={()=>requireUnlock(()=>setLedgerModal({date:new Date().toISOString().slice(0,10),type:"Deposit",amount:"",note:""}))} onDelete={(id)=>requireUnlock(async()=>{
                  if(!confirm("Delete this entry?")) return;
                  try { await fetch(`/api/ledger?id=${encodeURIComponent(id)}`,{method:"DELETE"}); await reloadLedger(); showToast("Entry deleted","ok"); } catch(e){ showToast("Delete failed","err"); }
                })}/>

                <div style={{...S.card, marginBottom:14}}>
                  <div style={S.cardHeader}>
                    <span style={S.cardTitle}>Calendar Heatmap</span>
                    <span style={{fontSize:11,color:"#4a5a78",fontFamily:"'JetBrains Mono',monospace"}}>last 12 weeks · daily P&L</span>
                  </div>
                  <CalendarHeatmap trades={trades}/>
                </div>

                <div style={S.chartsRow}>
                  <div style={{...S.card, flex:"2 1 320px", minWidth:280}}>
                    <div style={S.cardHeader}>
                      <span style={S.cardTitle}>Equity Curve</span>
                      <span style={{fontSize:11,color:"#4a5a78",fontFamily:"'JetBrains Mono',monospace"}}>cumulative P&L</span>
                    </div>
                    <ResponsiveContainer width="100%" height={180}>
                      <LineChart data={metrics.equity} margin={{top:5,right:10,left:0,bottom:0}}>
                        <defs>
                          <linearGradient id="eqGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={G} stopOpacity={0.15}/>
                            <stop offset="95%" stopColor={G} stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1c2c45" vertical={false}/>
                        <XAxis dataKey="date" tick={{fill:"#4a5a78",fontSize:9,fontFamily:"'JetBrains Mono',monospace"}} tickLine={false} axisLine={false} interval="preserveStartEnd"/>
                        <YAxis tick={{fill:"#4a5a78",fontSize:9,fontFamily:"'JetBrains Mono',monospace"}} tickLine={false} axisLine={false} tickFormatter={v=>`$${v}`} width={52}/>
                        <ReferenceLine y={0} stroke="#2a3a55" strokeDasharray="3 3"/>
                        <Tooltip contentStyle={{background:"#121e34",border:"1px solid #26385a",borderRadius:6,fontFamily:"'JetBrains Mono',monospace",fontSize:11}} labelStyle={{color:"#9caac4"}} formatter={(v)=>[`$${v.toFixed(2)}`,"Equity"]}/>
                        <Line type="monotone" dataKey="eq" stroke={G} strokeWidth={2} dot={false} activeDot={{r:4,fill:G,strokeWidth:0}}/>
                      </LineChart>
                    </ResponsiveContainer>
                  </div>

                  <div style={{...S.card, flex:"1.5 1 280px", minWidth:260}}>
                    <div style={S.cardHeader}>
                      <span style={S.cardTitle}>Daily P&L</span>
                      <span style={{fontSize:11,color:"#4a5a78",fontFamily:"'JetBrains Mono',monospace"}}>last 30 days</span>
                    </div>
                    <ResponsiveContainer width="100%" height={180}>
                      <BarChart data={metrics.daily} margin={{top:5,right:5,left:0,bottom:0}}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1c2c45" vertical={false}/>
                        <XAxis dataKey="date" tick={{fill:"#4a5a78",fontSize:9,fontFamily:"'JetBrains Mono',monospace"}} tickLine={false} axisLine={false} interval="preserveStartEnd"/>
                        <YAxis tick={{fill:"#4a5a78",fontSize:9,fontFamily:"'JetBrains Mono',monospace"}} tickLine={false} axisLine={false} tickFormatter={v=>`$${v}`} width={52}/>
                        <ReferenceLine y={0} stroke="#2a3a55"/>
                        <Tooltip contentStyle={{background:"#121e34",border:"1px solid #26385a",borderRadius:6,fontFamily:"'JetBrains Mono',monospace",fontSize:11}} formatter={(v)=>[`$${v.toFixed(2)}`,"P&L"]}/>
                        <Bar dataKey="pnl" radius={[3,3,0,0]}>
                          {metrics.daily.map((d,i)=><Cell key={i} fill={d.pnl>=0?G:R} fillOpacity={0.85}/>)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div style={S.chartsRow}>
                  <div style={{...S.card, flex:"1 1 260px", minWidth:240}}>
                    <div style={S.cardHeader}><span style={S.cardTitle}>Advanced Metrics</span></div>
                    <div style={{display:"flex",flexDirection:"column",gap:8,marginTop:4}}>
                      {[
                        {l:"Max Drawdown", v:`-$${metrics.maxDD.toFixed(2)}`, c:R},
                        {l:"Avg Win", v:fmt$(metrics.avgWin), c:G},
                        {l:"Avg Loss", v:`-$${metrics.avgLoss.toFixed(2)}`, c:R},
                        {l:"Best Trade", v:fmt$(metrics.bestTrade), c:G},
                        {l:"Worst Trade", v:fmt$(metrics.worstTrade), c:R},
                        {l:"Max Consec. Wins", v:metrics.mxW, c:G},
                        {l:"Max Consec. Losses", v:metrics.mxL, c:R},
                        {l:"Current Streak", v:`${metrics.streak} ${metrics.streakType}`, c:metrics.streakType==="win"?G:R},
                      ].map(m=>(
                        <div key={m.l} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"5px 0",borderBottom:"1px solid #14223a"}}>
                          <span style={{fontSize:11,color:"#7e8aa4",fontFamily:"'Manrope',sans-serif"}}>{m.l}</span>
                          <span style={{fontSize:12,color:m.c,fontFamily:"'JetBrains Mono',monospace",fontWeight:700}}>{m.v}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div style={{...S.card, flex:"1.4 1 280px", minWidth:260}}>
                    <div style={S.cardHeader}><span style={S.cardTitle}>Top Symbols</span></div>
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={metrics.symbols} layout="vertical" margin={{top:0,right:10,left:10,bottom:0}}>
                        <XAxis type="number" tick={{fill:"#4a5a78",fontSize:9,fontFamily:"'JetBrains Mono',monospace"}} tickLine={false} axisLine={false} tickFormatter={v=>`$${v}`}/>
                        <YAxis type="category" dataKey="s" tick={{fill:"#bbb29a",fontSize:11,fontFamily:"'JetBrains Mono',monospace"}} tickLine={false} axisLine={false} width={55}/>
                        <ReferenceLine x={0} stroke="#2a3a55"/>
                        <Tooltip contentStyle={{background:"#121e34",border:"1px solid #26385a",borderRadius:6,fontFamily:"'JetBrains Mono',monospace",fontSize:11}} formatter={(v,n,p)=>[`$${v.toFixed(2)}`,p.payload.s]}/>
                        <Bar dataKey="pnl" radius={[0,3,3,0]}>
                          {metrics.symbols.map((d,i)=><Cell key={i} fill={d.pnl>=0?G:R} fillOpacity={0.85}/>)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  <div style={{...S.card, flex:"1.2 1 260px", minWidth:240}}>
                    <div style={S.cardHeader}><span style={S.cardTitle}>Setup Performance</span></div>
                    <div style={{overflowY:"auto",maxHeight:210,marginTop:4}}>
                      {metrics.setupPerf.map(s=>(
                        <div key={s.s} style={{padding:"6px 0",borderBottom:"1px solid #14223a"}}>
                          <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
                            <span style={{fontSize:11,color:"#cec2a3",fontFamily:"'Manrope',sans-serif",fontWeight:600}}>{s.s}</span>
                            <span style={{fontSize:11,color:pnlColor(s.pnl),fontFamily:"'JetBrains Mono',monospace",fontWeight:700}}>{fmt$(s.pnl)}</span>
                          </div>
                          <div style={{display:"flex",gap:12}}>
                            <span style={{fontSize:10,color:"#5a6b88",fontFamily:"'JetBrains Mono',monospace"}}>{s.n} trades</span>
                            <span style={{fontSize:10,color:parseFloat(s.wr)>=50?G:R,fontFamily:"'JetBrains Mono',monospace"}}>{s.wr}% WR</span>
                          </div>
                          <div style={{marginTop:4,height:2,background:"#1c2c45",borderRadius:1}}>
                            <div style={{width:`${s.wr}%`,height:"100%",background:parseFloat(s.wr)>=50?G:R,borderRadius:1,opacity:0.6}}/>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {view==="journal" && (
          <div style={S.page}>
            <div style={S.filterRow}>
              <input placeholder="Symbol…" value={filter.symbol} onChange={e=>setFilter(p=>({...p,symbol:e.target.value}))} style={S.filterInput}/>
              {[{k:"dir",opts:["All","Long","Short"]},{k:"result",opts:["All","Win","Loss"]},{k:"setup",opts:["All",...SETUPS]}].map(({k,opts})=>(
                <select key={k} value={filter[k]} onChange={e=>setFilter(p=>({...p,[k]:e.target.value}))} style={S.filterSelect}>
                  {opts.map(o=><option key={o} value={o}>{o}</option>)}
                </select>
              ))}
              <span style={{marginLeft:"auto",fontSize:11,color:"#4a5a78",fontFamily:"'JetBrains Mono',monospace"}}>{filtered.length} trade{filtered.length!==1?"s":""}</span>
              <button onClick={()=>exportCsv(filtered)} title="Export filtered trades to CSV" style={{
                background:"transparent",border:`1px solid ${GOLD}55`,borderRadius:6,
                padding:"7px 12px",color:GOLD,fontSize:10,cursor:"pointer",
                fontFamily:"'Cinzel',serif",letterSpacing:2,textTransform:"uppercase",fontWeight:600
              }}>↓ Export</button>
            </div>

            {filtered.length===0 ? (
              <div style={S.empty}>
                <div style={{fontSize:36,marginBottom:12}}>📂</div>
                <div style={{color:"#5a6b88",fontSize:13}}>No trades match your filters</div>
              </div>
            ) : (
              <div style={S.tableWrap}>
                <table style={S.table}>
                  <thead>
                    <tr>
                      {["Date","Symbol","Dir","Setup","Entry","Exit","Size","P&L","R","Grade","Emotion",""].map(h=>(
                        <th key={h} style={S.th}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(t=>{
                      const p = parseFloat(t.pnl)||0;
                      return (
                        <tr key={t.id} style={S.tr} onClick={()=>{setSelected(t);setView("detail");}} onMouseEnter={e=>e.currentTarget.style.background="#16243c"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                          <td style={{...S.td,...S.tdMono}}>{t.date}</td>
                          <td style={{...S.td,fontFamily:"'JetBrains Mono',monospace",fontWeight:700,color:"#eee0bf"}}>{t.symbol}</td>
                          <td style={{...S.td}}><span style={{...S.dirBadge,background:t.direction==="Long"?"rgba(0,229,160,0.1)":"rgba(255,69,96,0.1)",color:t.direction==="Long"?G:R}}>{t.direction}</span></td>
                          <td style={{...S.td,color:"#7a8aa8",fontSize:11}}>{t.setup}</td>
                          <td style={{...S.td,...S.tdMono}}>{t.entry?`$${parseFloat(t.entry).toFixed(2)}`:"-"}</td>
                          <td style={{...S.td,...S.tdMono}}>{t.exit?`$${parseFloat(t.exit).toFixed(2)}`:"-"}</td>
                          <td style={{...S.td,...S.tdMono}}>{t.size||"-"}</td>
                          <td style={{...S.td,...S.tdMono,color:pnlColor(p),fontWeight:700}}>{fmt$(p)}</td>
                          <td style={{...S.td,...S.tdMono,color:t.rMultiple?pnlColor(parseFloat(t.rMultiple)):"#4a5a78"}}>{t.rMultiple?fmtN(t.rMultiple)+"R":"-"}</td>
                          <td style={{...S.td}}><span style={{...S.gradeBadge,...gradeStyle(t.grade)}}>{t.grade}</span></td>
                          <td style={{...S.td,fontSize:11,color:"#5a6b88"}}>{t.emotion}</td>
                          <td style={{...S.td,textAlign:"right"}}>
                            {(t.screenshots||[]).length > 0 && (
                              <span style={{fontSize:10,color:GOLD,fontFamily:"'JetBrains Mono',monospace"}}>📷 {t.screenshots.length}</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {(view==="add"||view==="edit") && (
          <div style={S.page}>
            <div style={{fontFamily:"'Cormorant Garamond',serif",fontStyle:"italic",fontWeight:500,fontSize:28,color:"#eee0bf",marginBottom:6,letterSpacing:0.5}}>
              {view==="edit"?"Edit Trade":"Log New Trade"}
            </div>
            <div style={{fontFamily:"'Cinzel',serif",fontSize:10,color:GOLD,letterSpacing:3,textTransform:"uppercase",marginBottom:22}}>
              {view==="edit"?"Revise the entry":"A disciplined record"}
            </div>

            {view==="add" && strategyRules.length > 0 && (
              <div style={{...S.card, marginBottom:18, borderColor: GOLD+"44"}}>
                <div style={S.cardHeader}>
                  <span style={S.cardTitle}>Pre-Trade Checklist</span>
                  <span style={{fontSize:10,color: allRulesChecked?G:"#7e8aa4",fontFamily:"'JetBrains Mono',monospace",letterSpacing:1}}>
                    {Object.values(checkedRules).filter(Boolean).length}/{strategyRules.length} {allRulesChecked?"✓ ready":"required"}
                  </span>
                </div>
                <div style={{display:"flex",flexDirection:"column",gap:8}}>
                  {strategyRules.map(r => (
                    <label key={r.id} style={{
                      display:"flex",gap:10,alignItems:"flex-start",cursor:"pointer",
                      padding:"8px 10px",borderRadius:6,
                      background: checkedRules[r.id]?"rgba(165,178,133,0.08)":"transparent",
                      border:`1px solid ${checkedRules[r.id]?G+"44":"#1c2c45"}`,
                      transition:"all 0.15s"
                    }}>
                      <input type="checkbox" checked={!!checkedRules[r.id]}
                        onChange={(e)=>setCheckedRules(p=>({...p,[r.id]:e.target.checked}))}
                        style={{marginTop:3,accentColor:GOLD,width:16,height:16,flexShrink:0,cursor:"pointer"}}/>
                      <span style={{fontSize:13,color: checkedRules[r.id]?"#eee0bf":"#a8a886",lineHeight:1.5,fontFamily:"'Manrope',sans-serif"}}>{r.text}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
            <div style={S.formGrid}>
              <Field label="Date"><input type="date" style={S.input} value={form.date} onChange={e=>setForm(p=>({...p,date:e.target.value}))}/></Field>
              <Field label="Time (optional)"><input type="time" style={S.input} value={form.time} onChange={e=>setForm(p=>({...p,time:e.target.value}))}/></Field>
              <Field label="Symbol *"><input placeholder="AAPL, BTC, SPY…" style={S.input} value={form.symbol} onChange={e=>setForm(p=>({...p,symbol:e.target.value.toUpperCase()}))}/></Field>
              <Field label="Direction">
                <div style={{display:"flex",gap:8}}>
                  {["Long","Short"].map(d=>(
                    <button key={d} onClick={()=>setForm(p=>({...p,direction:d}))} style={{...S.toggleBtn,flex:1,
                      background:form.direction===d?(d==="Long"?"rgba(0,229,160,0.15)":"rgba(255,69,96,0.15)"):"transparent",
                      color:form.direction===d?(d==="Long"?G:R):"#5a6b88",
                      borderColor:form.direction===d?(d==="Long"?G:R):"#26385a"}}>{d}</button>
                  ))}
                </div>
              </Field>

              <Field label="Entry Price"><input type="number" placeholder="0.00" style={S.input} value={form.entry} onChange={e=>setForm(p=>({...p,entry:e.target.value}))}/></Field>
              <Field label="Exit Price"><input type="number" placeholder="0.00" style={S.input} value={form.exit} onChange={e=>setForm(p=>({...p,exit:e.target.value}))}/></Field>
              <Field label="Size / Shares"><input type="number" placeholder="100" style={S.input} value={form.size} onChange={e=>setForm(p=>({...p,size:e.target.value}))}/></Field>
              <Field label="P&L ($) *"><input type="number" placeholder="+250.00 or -80.00" style={{...S.input,color:form.pnl?(parseFloat(form.pnl)>=0?G:R):"inherit"}} value={form.pnl} onChange={e=>setForm(p=>({...p,pnl:e.target.value}))}/></Field>

              <Field label="R-Multiple"><input type="number" placeholder="2.5" style={S.input} value={form.rMultiple} onChange={e=>setForm(p=>({...p,rMultiple:e.target.value}))}/></Field>
              <Field label="Setup">
                <select style={S.input} value={form.setup} onChange={e=>setForm(p=>({...p,setup:e.target.value}))}>
                  {SETUPS.map(s=><option key={s} value={s}>{s}</option>)}
                </select>
              </Field>
              <Field label="Grade">
                <div style={{display:"flex",gap:6}}>
                  {GRADES.map(g=>(
                    <button key={g} onClick={()=>setForm(p=>({...p,grade:g}))} style={{...S.toggleBtn,flex:1,fontSize:11,
                      background:form.grade===g?"rgba(201,168,64,0.15)":"transparent",
                      color:form.grade===g?GOLD:"#5a6b88",borderColor:form.grade===g?GOLD:"#26385a"}}>{g}</button>
                  ))}
                </div>
              </Field>
              <Field label="Emotion">
                <select style={S.input} value={form.emotion} onChange={e=>setForm(p=>({...p,emotion:e.target.value}))}>
                  {EMOTIONS.map(e=><option key={e} value={e}>{e}</option>)}
                </select>
              </Field>

              <div style={{gridColumn:"1/-1"}}>
                <Field label="Trade Notes / Reasoning">
                  <textarea placeholder="What was your thesis? How did you manage the trade? What would you do differently?" style={{...S.input,height:90,resize:"vertical",lineHeight:1.5}} value={form.notes} onChange={e=>setForm(p=>({...p,notes:e.target.value}))}/>
                </Field>
              </div>

              <div style={{gridColumn:"1/-1"}}>
                <Field label={`Screenshots (chart setup / result) — ${(form.screenshots||[]).length} attached`}>
                  <div style={{display:"flex",gap:10,flexWrap:"wrap",alignItems:"flex-start"}}>
                    <input ref={fileRef} type="file" accept="image/*" multiple style={{display:"none"}} onChange={handleFile}/>
                    <button style={{...S.uploadBtn}} onClick={()=>fileRef.current.click()}>
                      📷 {(form.screenshots||[]).length ? "Add More" : "Upload Images"}
                    </button>
                    {(form.screenshots||[]).map((src, i) => (
                      <div key={i} style={{position:"relative"}}>
                        <img src={src} alt={`shot-${i+1}`}
                          style={{height:80,width:80,objectFit:"cover",borderRadius:6,border:"1px solid #26385a"}}
                        />
                        <button onClick={()=>removeScreenshot(i)} title="Remove" style={{
                          position:"absolute",top:-6,right:-6,background:"#A56250",border:"none",
                          borderRadius:"50%",width:20,height:20,color:"#fff",fontSize:12,cursor:"pointer",
                          display:"flex",alignItems:"center",justifyContent:"center",lineHeight:1
                        }}>×</button>
                      </div>
                    ))}
                  </div>
                  {view==="edit" && (form.screenshots||[]).some(s=>typeof s==="string"&&!s.startsWith("data:")) && form.screenshotsTouched && (
                    <div style={{fontSize:10,color:"#A56250",marginTop:8,fontFamily:"'JetBrains Mono',monospace"}}>
                      ⚠ Editing images: existing Notion images will be re-uploaded as fresh copies.
                    </div>
                  )}
                </Field>
              </div>
            </div>

            <div style={{display:"flex",gap:10,marginTop:24}}>
              <button
                disabled={saving || (view==="add" && strategyRules.length>0 && !allRulesChecked)}
                style={{...S.primaryBtn,
                  opacity: (saving || (view==="add" && strategyRules.length>0 && !allRulesChecked)) ? 0.5 : 1,
                  cursor: saving?"wait":((view==="add"&&!allRulesChecked&&strategyRules.length>0)?"not-allowed":"pointer")
                }}
                title={view==="add" && !allRulesChecked && strategyRules.length>0 ? "Complete the pre-trade checklist first" : ""}
                onClick={view==="edit"?updateTrade:addTrade}>
                {saving ? "Saving…" : (view==="edit"?"Update Trade":"Save Trade")}
              </button>
              <button disabled={saving} style={S.ghostBtn} onClick={()=>{if(view==="edit"){setView("detail");}else{setView("journal");}}}>Cancel</button>
            </div>
          </div>
        )}

        {view==="detail" && selected && (
          <div style={S.page}>
            <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:24}}>
              <button style={S.backBtn} onClick={()=>setView("journal")}>← Back</button>
              <div style={{fontFamily:"'JetBrains Mono',monospace",fontWeight:700,fontSize:22,color:"#eee0bf"}}>{selected.symbol}</div>
              <span style={{...S.dirBadge,background:selected.direction==="Long"?"rgba(0,229,160,0.1)":"rgba(255,69,96,0.1)",color:selected.direction==="Long"?G:R,fontSize:12,padding:"4px 10px"}}>{selected.direction}</span>
              <span style={{marginLeft:"auto",fontFamily:"'JetBrains Mono',monospace",fontWeight:700,fontSize:22,color:pnlColor(selected.pnl)}}>{fmt$(selected.pnl)}</span>
            </div>

            <div style={{display:"flex",gap:16,flexWrap:"wrap"}}>
              <div style={{...S.card,flex:1,minWidth:280}}>
                <div style={S.cardHeader}><span style={S.cardTitle}>Trade Details</span>
                  <div style={{display:"flex",gap:6}}>
                    <button style={{...S.ghostBtn,padding:"4px 10px",fontSize:11}} onClick={()=>requireUnlock(()=>{setForm({...selected});setView("edit");})}>Edit</button>
                    <button style={{...S.ghostBtn,padding:"4px 10px",fontSize:11,color:R,borderColor:R}} onClick={()=>requireUnlock(()=>deleteTrade(selected.id))}>Delete</button>
                  </div>
                </div>
                <div style={{display:"flex",flexDirection:"column",gap:8}}>
                  {[
                    {l:"Date",v:`${selected.date}${selected.time?" "+selected.time:""}`},
                    {l:"Entry",v:selected.entry?`$${parseFloat(selected.entry).toFixed(4)}`:"-"},
                    {l:"Exit",v:selected.exit?`$${parseFloat(selected.exit).toFixed(4)}`:"-"},
                    {l:"Size",v:selected.size||"-"},
                    {l:"P&L",v:fmt$(selected.pnl),c:pnlColor(selected.pnl)},
                    {l:"R-Multiple",v:selected.rMultiple?fmtN(selected.rMultiple)+"R":"-",c:selected.rMultiple?pnlColor(parseFloat(selected.rMultiple)):"#4a5a78"},
                    {l:"Setup",v:selected.setup||"-"},
                    {l:"Grade",v:selected.grade,c:GOLD},
                    {l:"Emotion",v:selected.emotion||"-"},
                  ].map(m=>(
                    <div key={m.l} style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:"1px solid #14223a"}}>
                      <span style={{fontSize:12,color:"#7e8aa4",fontFamily:"'Manrope',sans-serif"}}>{m.l}</span>
                      <span style={{fontSize:12,color:m.c||"#d6c89a",fontFamily:"'JetBrains Mono',monospace",fontWeight:600}}>{m.v}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{flex:1.5,minWidth:280,display:"flex",flexDirection:"column",gap:16}}>
                {selected.notes && (
                  <div style={S.card}>
                    <div style={S.cardHeader}><span style={S.cardTitle}>Notes</span></div>
                    <p style={{fontSize:13,color:"#a8a886",lineHeight:1.7,fontFamily:"'Manrope',sans-serif",whiteSpace:"pre-wrap"}}>{selected.notes}</p>
                  </div>
                )}
                {(selected.screenshots||[]).length > 0 && (
                  <div style={S.card}>
                    <div style={S.cardHeader}>
                      <span style={S.cardTitle}>Chart Screenshots</span>
                      <span style={{fontSize:11,color:"#4a5a78",fontFamily:"'JetBrains Mono',monospace"}}>{selected.screenshots.length} {selected.screenshots.length===1?"image":"images"}</span>
                    </div>
                    <div style={{display:"grid",gridTemplateColumns:selected.screenshots.length===1?"1fr":"repeat(auto-fill,minmax(150px,1fr))",gap:10,marginTop:4}}>
                      {selected.screenshots.map((src, i) => (
                        <div key={i} onClick={()=>setLightbox({urls:selected.screenshots,index:i})}
                          style={{display:"block",lineHeight:0,cursor:"zoom-in"}}>
                          <img src={src} alt={`chart-${i+1}`} onError={onImgError}
                            style={{width:"100%",borderRadius:6,border:"1px solid #1c2c45"}}/>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {!selected.notes && (selected.screenshots||[]).length === 0 && (
                  <div style={{...S.card,color:"#36465e",fontSize:13,fontFamily:"'Manrope',sans-serif"}}>No notes or screenshots attached.</div>
                )}
              </div>
            </div>
          </div>
        )}

        {view==="strategy" && (
          <div style={S.page}><StrategyPage requireUnlock={requireUnlock} showToast={showToast}/></div>
        )}

        {view==="target" && (
          <div style={S.page}><TargetPage requireUnlock={requireUnlock} unlocked={unlocked} showToast={showToast} ledger={ledger} trades={trades} /></div>
        )}

        {view==="portfolio" && (
          <div style={S.page}><PortfolioPage requireUnlock={requireUnlock} showToast={showToast} ledger={ledger} trades={trades}
            onCloseTrade={async (trade) => {
              try {
                await saveTrade(trade);
                await reloadTrades();
                showToast("Position closed — journal entry added ✓", "ok");
              } catch (e) {
                showToast("Position closed. Journal save failed: " + (e.message || "unknown"), "err");
              }
            }}
          /></div>
        )}
      </div>

      {ledgerModal && (
        <LedgerModal
          entry={ledgerModal}
          onChange={setLedgerModal}
          onClose={()=>setLedgerModal(null)}
          onSave={async (entry) => {
            try {
              const r = await fetch("/api/ledger", {
                method:"POST", headers:{"Content-Type":"application/json"},
                body: JSON.stringify(entry),
              });
              if (!r.ok) throw new Error("api " + r.status);
              await reloadLedger();
              setLedgerModal(null);
              showToast("Entry saved ✓","ok");
            } catch (e) {
              console.error(e);
              showToast("Save failed: " + (e.message||"err"),"err");
            }
          }}
        />
      )}

      {lightbox && (
        <Lightbox
          urls={lightbox.urls}
          index={lightbox.index}
          onChange={(i)=>setLightbox(l=>l?{...l,index:i}:l)}
          onClose={()=>setLightbox(null)}
        />
      )}

      {pendingAction && (
        <PinModal
          onPass={() => {
            setUnlocked(true);
            const fn = pendingAction;
            setPendingAction(null);
            try { fn(); } catch (e) { console.error(e); }
          }}
          onCancel={() => setPendingAction(null)}
        />
      )}

      {toast && (
        <div style={{
          position:"fixed",bottom:24,left:"50%",transform:"translateX(-50%)",
          zIndex:2000,
          background: toast.type==="ok" ? "rgba(0,229,160,0.12)" : toast.type==="err" ? "rgba(255,69,96,0.12)" : "#121e34",
          border: `1px solid ${toast.type==="ok" ? G : toast.type==="err" ? R : "#26385a"}`,
          color: toast.type==="ok" ? G : toast.type==="err" ? R : "#cec2a3",
          padding:"12px 20px",borderRadius:8,
          fontSize:13,fontFamily:"'JetBrains Mono',monospace",fontWeight:600,
          backdropFilter:"blur(8px)",
          boxShadow:"0 8px 24px rgba(0,0,0,0.4)",
          maxWidth:"90vw",wordBreak:"break-word"
        }}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}

function CalendarHeatmap({ trades }) {
  const data = useMemo(() => {
    const map = {};
    trades.forEach(t => {
      const d = t.date;
      if (!d) return;
      map[d] = (map[d] || 0) + (parseFloat(t.pnl) || 0);
    });
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const start = new Date(today);
    start.setDate(start.getDate() - 83);
    while (start.getDay() !== 1) start.setDate(start.getDate() - 1);
    const weeks = [];
    const cur = new Date(start);
    for (let w = 0; w < 13; w++) {
      const col = [];
      for (let i = 0; i < 7; i++) {
        const iso = cur.toISOString().slice(0, 10);
        const pnl = map[iso];
        col.push({ iso, dow: cur.getDay(), pnl, future: cur > today });
        cur.setDate(cur.getDate() + 1);
      }
      weeks.push(col);
    }
    const vals = Object.values(map).filter(v => v !== 0);
    const max = vals.length ? Math.max(...vals.map(Math.abs)) : 1;
    return { weeks, max };
  }, [trades]);

  const cellSize = 14, gap = 3;
  const color = (pnl) => {
    if (pnl === undefined) return "#14223a";
    if (pnl === 0) return "#1c2c45";
    const t = Math.min(1, Math.abs(pnl) / data.max);
    const intensity = 0.25 + 0.75 * t;
    return pnl > 0 ? `rgba(165,178,133,${intensity})` : `rgba(138,67,57,${intensity})`;
  };

  const months = [];
  let lastMonth = -1;
  data.weeks.forEach((col, wi) => {
    const m = new Date(col[0].iso).getMonth();
    if (m !== lastMonth) {
      months.push({ wi, label: new Date(col[0].iso).toLocaleString("en", { month: "short" }) });
      lastMonth = m;
    }
  });

  return (
    <div style={{overflowX:"auto",padding:"4px 0"}}>
      <div style={{display:"flex",gap:6,minWidth:280}}>
        <div style={{display:"flex",flexDirection:"column",gap,fontSize:9,color:"#4a5a78",fontFamily:"'JetBrains Mono',monospace",paddingTop:18}}>
          {["M","T","W","T","F","S","S"].map((d,i)=>(
            <div key={i} style={{height:cellSize,lineHeight:`${cellSize}px`}}>{i%2===0?d:""}</div>
          ))}
        </div>
        <div>
          <div style={{display:"flex",gap,height:14,marginBottom:4,fontSize:9,color:"#7e8aa4",fontFamily:"'JetBrains Mono',monospace"}}>
            {data.weeks.map((_, wi) => {
              const m = months.find(x => x.wi === wi);
              return <div key={wi} style={{width:cellSize,textAlign:"left"}}>{m ? m.label : ""}</div>;
            })}
          </div>
          <div style={{display:"flex",gap}}>
            {data.weeks.map((col, wi) => (
              <div key={wi} style={{display:"flex",flexDirection:"column",gap}}>
                {col.map((d, di) => (
                  <div key={di}
                    title={d.future ? "" : `${d.iso}${d.pnl !== undefined ? " · " + (d.pnl >= 0 ? "+" : "") + "$" + d.pnl.toFixed(2) : " · no trade"}`}
                    style={{
                      width:cellSize,height:cellSize,borderRadius:3,
                      background: d.future ? "transparent" : color(d.pnl),
                      border: d.future ? "1px dashed #1c2c45" : "1px solid rgba(0,0,0,0.15)"
                    }}/>
                ))}
              </div>
            ))}
          </div>
          <div style={{display:"flex",alignItems:"center",gap:6,marginTop:10,fontSize:10,color:"#7e8aa4",fontFamily:"'JetBrains Mono',monospace"}}>
            <span>loss</span>
            <div style={{width:cellSize,height:cellSize,background:color(-data.max),borderRadius:3}}/>
            <div style={{width:cellSize,height:cellSize,background:color(-data.max*0.5),borderRadius:3}}/>
            <div style={{width:cellSize,height:cellSize,background:"#1c2c45",borderRadius:3}}/>
            <div style={{width:cellSize,height:cellSize,background:color(data.max*0.5),borderRadius:3}}/>
            <div style={{width:cellSize,height:cellSize,background:color(data.max),borderRadius:3}}/>
            <span>win</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function EquityCard({ ledger, trades, onAdd, onDelete }) {
  const sum = (arr, fn) => arr.reduce((a, x) => a + fn(x), 0);
  const tradesPnl = sum(trades, t => parseFloat(t.pnl) || 0);
  const starting = sum(ledger.filter(e => e.type === "Starting"), e => e.amount || 0);
  const deposits = sum(ledger.filter(e => e.type === "Deposit"), e => e.amount || 0);
  const withdrawals = sum(ledger.filter(e => e.type === "Withdrawal"), e => e.amount || 0);
  const adjustments = sum(ledger.filter(e => e.type === "Adjustment"), e => e.amount || 0);
  const equity = starting + deposits - withdrawals + adjustments + tradesPnl;

  const moneyOf = (n) => (n >= 0 ? "+$" : "-$") + Math.abs(n).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2});

  return (
    <div style={{...styles.card, marginBottom:14, padding:18, borderColor: GOLD+"33"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
        <div>
          <div style={{...styles.cardTitle, color:GOLD}}>Account Equity</div>
          <div style={{fontSize:10,color:"#7e8aa4",fontFamily:"'JetBrains Mono',monospace",marginTop:3,letterSpacing:1}}>{ledger.length} ledger entries · {trades.length} trades</div>
        </div>
        <button onClick={onAdd} style={{
          background:"transparent",border:`1px solid ${GOLD}66`,borderRadius:6,
          padding:"6px 14px",color:GOLD,fontSize:10,cursor:"pointer",
          fontFamily:"'Cinzel',serif",letterSpacing:2,textTransform:"uppercase",fontWeight:600
        }}>+ Add Entry</button>
      </div>

      <div style={{
        display:"flex",alignItems:"baseline",gap:14,marginBottom:14,
        padding:"14px 18px",borderRadius:8,
        background:"linear-gradient(135deg, rgba(198,164,76,0.10), rgba(198,164,76,0.02))",
        border:`1px solid ${GOLD}33`
      }}>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontFamily:"'Cinzel',serif",fontSize:9,letterSpacing:3,color:"#7e8aa4",textTransform:"uppercase"}}>Current Equity</div>
          <div style={{fontFamily:"'JetBrains Mono',monospace",fontWeight:700,fontSize:28,color:GOLD,marginTop:4,lineHeight:1}}>
            ${equity.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})}
          </div>
        </div>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(120px, 1fr))",gap:8,marginBottom:12}}>
        <EquityStat label="Starting" value={moneyOf(starting)}/>
        <EquityStat label="Deposits" value={moneyOf(deposits)} color={G}/>
        <EquityStat label="Withdrawals" value={moneyOf(-withdrawals)} color={R}/>
        <EquityStat label="Trade P&L" value={moneyOf(tradesPnl)} color={tradesPnl>=0?G:R}/>
        {adjustments !== 0 && <EquityStat label="Adjustments" value={moneyOf(adjustments)}/>}
      </div>

      {ledger.length > 0 && (
        <details style={{marginTop:8}}>
          <summary style={{cursor:"pointer",fontSize:11,color:"#7e8aa4",fontFamily:"'JetBrains Mono',monospace",letterSpacing:1,padding:"4px 0"}}>
            ▸ history ({ledger.length})
          </summary>
          <div style={{marginTop:10,maxHeight:200,overflowY:"auto",overscrollBehavior:"contain"}}>
            {[...ledger].reverse().map(e => (
              <div key={e.id} style={{
                display:"flex",alignItems:"center",gap:10,padding:"8px 6px",
                borderBottom:"1px solid #1a221c",fontSize:12
              }}>
                <span style={{fontFamily:"'JetBrains Mono',monospace",color:"#7e8aa4",fontSize:11,width:80,flexShrink:0}}>{e.date}</span>
                <span style={{
                  fontFamily:"'Cinzel',serif",fontSize:9,letterSpacing:1.5,textTransform:"uppercase",fontWeight:600,
                  color: e.type==="Deposit"?G:e.type==="Withdrawal"?R:GOLD,
                  width:90,flexShrink:0
                }}>{e.type}</span>
                <span style={{flex:1,fontSize:11,color:"#a8a886",fontFamily:"'Manrope',sans-serif",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{e.note}</span>
                <span style={{fontFamily:"'JetBrains Mono',monospace",color: e.type==="Withdrawal"?R:G,fontWeight:700,fontSize:12}}>
                  {e.type==="Withdrawal"?"-":"+"}${(e.amount||0).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})}
                </span>
                <button onClick={()=>onDelete(e.id)} style={{
                  background:"transparent",border:"1px solid #2a3a55",borderRadius:4,
                  width:22,height:22,color:R,fontSize:12,cursor:"pointer",lineHeight:1,
                  display:"flex",alignItems:"center",justifyContent:"center"
                }}>×</button>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

function EquityStat({ label, value, color }) {
  return (
    <div style={{padding:"10px 12px",border:"1px solid #1c2c45",borderRadius:6,background:"#0e1a2e"}}>
      <div style={{fontFamily:"'Cinzel',serif",fontSize:9,letterSpacing:2,color:"#7e8aa4",textTransform:"uppercase",marginBottom:3}}>{label}</div>
      <div style={{fontFamily:"'JetBrains Mono',monospace",fontWeight:700,fontSize:14,color:color||"#eee0bf"}}>{value}</div>
    </div>
  );
}

function LedgerModal({ entry, onChange, onClose, onSave }) {
  const [busy, setBusy] = useState(false);
  const TYPES = ["Starting","Deposit","Withdrawal","Adjustment"];
  const submit = async () => {
    if (!entry.amount || isNaN(Number(entry.amount))) return alert("Enter a valid amount");
    setBusy(true);
    await onSave({ ...entry, amount: Number(entry.amount) });
    setBusy(false);
  };
  return (
    <div onClick={onClose} style={{
      position:"fixed",inset:0,zIndex:1000,
      background:"rgba(7,16,28,0.85)",backdropFilter:"blur(6px)",
      display:"flex",alignItems:"center",justifyContent:"center",padding:20,
      fontFamily:"'Manrope',sans-serif"
    }}>
      <div onClick={(e)=>e.stopPropagation()} style={{
        background:"#121e34",border:"1px solid #1c2c45",borderRadius:14,
        padding:24,width:"100%",maxWidth:380,
        boxShadow:"0 20px 60px rgba(0,0,0,0.5)"
      }}>
        <div style={{fontFamily:"'Cormorant Garamond',serif",fontStyle:"italic",fontWeight:500,fontSize:22,color:"#eee0bf",textAlign:"center"}}>New Ledger Entry</div>
        <div style={{fontFamily:"'Cinzel',serif",fontSize:9,letterSpacing:3,color:GOLD,textAlign:"center",textTransform:"uppercase",marginTop:4,marginBottom:18}}>Deposit · Withdrawal · Adjustment</div>

        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          <div>
            <div style={{fontFamily:"'Cinzel',serif",fontSize:9,letterSpacing:2,color:"#7e8aa4",textTransform:"uppercase",marginBottom:6}}>Type</div>
            <div style={{display:"flex",gap:6}}>
              {TYPES.map(t => (
                <button key={t} onClick={()=>onChange({...entry,type:t})} style={{
                  flex:1,padding:"8px 4px",
                  background: entry.type===t ? (t==="Deposit"?"rgba(165,178,133,0.15)":t==="Withdrawal"?"rgba(138,67,57,0.15)":"rgba(198,164,76,0.15)") : "transparent",
                  border:`1px solid ${entry.type===t ? (t==="Deposit"?G:t==="Withdrawal"?R:GOLD) : "#26385a"}`,
                  color: entry.type===t ? (t==="Deposit"?G:t==="Withdrawal"?R:GOLD) : "#7e8aa4",
                  borderRadius:6,fontSize:10,cursor:"pointer",
                  fontFamily:"'Cinzel',serif",letterSpacing:1,textTransform:"uppercase",fontWeight:600
                }}>{t}</button>
              ))}
            </div>
          </div>

          <div>
            <div style={{fontFamily:"'Cinzel',serif",fontSize:9,letterSpacing:2,color:"#7e8aa4",textTransform:"uppercase",marginBottom:6}}>Date</div>
            <input type="date" value={entry.date} onChange={(e)=>onChange({...entry,date:e.target.value})} style={{
              width:"100%",background:"#0e1a2e",border:"1px solid #1c2c45",borderRadius:6,
              padding:"10px 12px",color:"#eee0bf",fontSize:14,fontFamily:"'JetBrains Mono',monospace"
            }}/>
          </div>

          <div>
            <div style={{fontFamily:"'Cinzel',serif",fontSize:9,letterSpacing:2,color:"#7e8aa4",textTransform:"uppercase",marginBottom:6}}>Amount ($)</div>
            <input type="number" autoFocus value={entry.amount} placeholder="0.00"
              onChange={(e)=>onChange({...entry,amount:e.target.value})}
              onKeyDown={(e)=>e.key==="Enter"&&submit()}
              style={{
                width:"100%",background:"#0e1a2e",border:"1px solid #1c2c45",borderRadius:6,
                padding:"10px 12px",color:GOLD,fontSize:18,fontWeight:700,fontFamily:"'JetBrains Mono',monospace"
              }}/>
          </div>

          <div>
            <div style={{fontFamily:"'Cinzel',serif",fontSize:9,letterSpacing:2,color:"#7e8aa4",textTransform:"uppercase",marginBottom:6}}>Note (optional)</div>
            <input value={entry.note} placeholder="e.g. Initial deposit, broker withdrawal..."
              onChange={(e)=>onChange({...entry,note:e.target.value})}
              style={{
                width:"100%",background:"#0e1a2e",border:"1px solid #1c2c45",borderRadius:6,
                padding:"10px 12px",color:"#eee0bf",fontSize:13,fontFamily:"'Manrope',sans-serif"
              }}/>
          </div>
        </div>

        <div style={{display:"flex",gap:8,marginTop:20}}>
          <button onClick={onClose} disabled={busy} style={{
            flex:1,background:"transparent",border:"1px solid #26385a",borderRadius:8,
            padding:"11px",color:"#7e8aa4",fontWeight:600,fontSize:11,cursor:"pointer",
            fontFamily:"'Cinzel',serif",letterSpacing:2,textTransform:"uppercase"
          }}>Cancel</button>
          <button onClick={submit} disabled={busy} style={{
            flex:2,background:GOLD,border:"none",borderRadius:8,
            padding:"11px",color:"#0a0a0a",fontWeight:700,fontSize:11,cursor:busy?"wait":"pointer",
            fontFamily:"'Cinzel',serif",letterSpacing:2,textTransform:"uppercase",
            opacity:busy?0.6:1
          }}>{busy?"Saving…":"Save Entry"}</button>
        </div>
      </div>
    </div>
  );
}

function StrategyPage({ requireUnlock, showToast }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editId, setEditId] = useState(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/strategy");
        if (!r.ok) throw new Error("api " + r.status);
        const list = await r.json();
        setItems(list);
      } catch (e) { console.warn("strategy load failed:", e); }
      setLoading(false);
    })();
  }, []);

  const rules = items.filter(i => i.type === "Rule").sort((a,b)=>a.order-b.order);
  const lessons = items.filter(i => i.type === "Lesson").sort((a,b)=>a.order-b.order);

  const save = (item) => requireUnlock(async () => {
    if (!item.text.trim()) { showToast && showToast("Empty text", "err"); return; }
    setBusy(true);
    try {
      const r = await fetch("/api/strategy", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify(item),
      });
      if (!r.ok) throw new Error("api " + r.status);
      setItems(prev => {
        const idx = prev.findIndex(p => p.id === item.id);
        if (idx >= 0) { const copy = [...prev]; copy[idx] = item; return copy; }
        return [...prev, item];
      });
      setEditId(null); setDraft("");
      showToast && showToast("Saved ✓", "ok");
    } catch (e) {
      console.error(e);
      showToast && showToast("Save failed: " + (e.message||"err"), "err");
    } finally { setBusy(false); }
  });

  const remove = (id) => requireUnlock(async () => {
    if (!confirm("Delete this item?")) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/strategy?id=${encodeURIComponent(id)}`, { method:"DELETE" });
      if (!r.ok) throw new Error("api " + r.status);
      setItems(prev => prev.filter(p => p.id !== id));
      showToast && showToast("Deleted ✓", "ok");
    } catch (e) {
      console.error(e);
      showToast && showToast("Delete failed", "err");
    } finally { setBusy(false); }
  });

  const startEdit = (item) => requireUnlock(() => { setEditId(item.id); setDraft(item.text); });
  const startAdd = (type) => requireUnlock(() => {
    const list = type === "Rule" ? rules : lessons;
    const nextOrder = list.length ? Math.max(...list.map(x=>x.order)) + 1 : 1;
    const nextId = `${type.toLowerCase()}-${Date.now()}`;
    setEditId(nextId);
    setDraft("");
    setItems(prev => [...prev, { id: nextId, type, order: nextOrder, text: "", _isNew: true }]);
  });

  const cancelEdit = () => {
    setItems(prev => prev.filter(p => !p._isNew));
    setEditId(null); setDraft("");
  };

  return (
    <div>
      <div style={{textAlign:"center",marginBottom:24}}>
        <div style={{fontFamily:"'Cormorant Garamond',serif",fontStyle:"italic",fontWeight:500,fontSize:30,color:"#eee0bf",letterSpacing:1,lineHeight:1.1}}>Trading Rules &amp; Lessons</div>
        <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:10,marginTop:8}}>
          <div style={{width:40,height:1,background:GOLD,opacity:0.5}}/>
          <span style={{fontSize:10,color:GOLD,fontFamily:"'JetBrains Mono',monospace",letterSpacing:4,textTransform:"uppercase"}}>The Playbook</span>
          <div style={{width:40,height:1,background:GOLD,opacity:0.5}}/>
        </div>
      </div>

      <StrategyDiagram />

      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(280px, 1fr))",gap:14,marginTop:20}}>
        <RuleCard
          title="Trading Rules" subtitle="Setup checklist" accent={GOLD}
          items={rules} loading={loading} busy={busy}
          editId={editId} draft={draft} setDraft={setDraft}
          onEdit={startEdit} onCancel={cancelEdit} onDelete={remove}
          onSave={(it)=>save({...it, text:draft})}
          onAdd={()=>startAdd("Rule")}
        />
        <RuleCard
          title="Lessons Learned" subtitle="From mistakes" accent="#A56250"
          items={lessons} loading={loading} busy={busy}
          editId={editId} draft={draft} setDraft={setDraft}
          onEdit={startEdit} onCancel={cancelEdit} onDelete={remove}
          onSave={(it)=>save({...it, text:draft})}
          onAdd={()=>startAdd("Lesson")}
        />
      </div>

      <div style={{
        marginTop:20,padding:24,
        background:"linear-gradient(135deg, rgba(201,168,64,0.08), rgba(201,168,64,0.02))",
        border:`1px solid ${GOLD}55`,borderRadius:12,textAlign:"center"
      }}>
        <div style={{fontSize:9,color:GOLD,letterSpacing:4,fontFamily:"'JetBrains Mono',monospace",marginBottom:10}}>KEY REMINDER</div>
        <div style={{fontFamily:"'Cormorant Garamond',serif",fontStyle:"italic",fontSize:20,color:"#eee0bf",lineHeight:1.5,maxWidth:600,margin:"0 auto"}}>
          Patience is part of the strategy. Wait for confirmation, follow the structure, avoid emotional entries.
        </div>
        <div style={{marginTop:12,fontSize:11,color:GOLD,fontFamily:"'JetBrains Mono',monospace",letterSpacing:3,textTransform:"uppercase"}}>
          Discipline · Creates · Consistency
        </div>
      </div>
    </div>
  );
}

function RuleCard({ title, subtitle, accent, items, loading, busy, editId, draft, setDraft, onEdit, onCancel, onDelete, onSave, onAdd }) {
  return (
    <div style={{...styles.card, padding:20, borderColor: accent + "33"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16,paddingBottom:10,borderBottom:`1px solid ${accent}22`}}>
        <div>
          <div style={{fontFamily:"'Manrope',sans-serif",fontWeight:800,fontSize:14,color:"#eee0bf",letterSpacing:0.3}}>{title}</div>
          <div style={{fontSize:9,color:accent,fontFamily:"'JetBrains Mono',monospace",letterSpacing:2,textTransform:"uppercase",marginTop:3}}>{subtitle}</div>
        </div>
        <button onClick={onAdd} disabled={busy} style={{
          background:"transparent",border:`1px solid ${accent}66`,borderRadius:6,
          padding:"5px 10px",color:accent,fontSize:11,cursor:"pointer",
          fontFamily:"'JetBrains Mono',monospace",letterSpacing:1,fontWeight:700
        }}>+ ADD</button>
      </div>
      {loading && <div style={{fontSize:12,color:"#4a5a78",fontFamily:"'JetBrains Mono',monospace"}}>loading…</div>}
      <ol style={{listStyle:"none",padding:"0 4px 0 0",margin:0,display:"flex",flexDirection:"column",gap:10,maxHeight:380,overflowY:"auto",overscrollBehavior:"contain"}}>
        {items.map((it, i) => {
          const editing = editId === it.id;
          return (
            <li key={it.id} style={{display:"flex",gap:10,alignItems:"flex-start"}}>
              <span style={{
                flexShrink:0,fontFamily:"'JetBrains Mono',monospace",fontSize:10,
                color:accent,fontWeight:700,minWidth:18,paddingTop:6
              }}>{String(i+1).padStart(2,"0")}</span>
              <div style={{flex:1,minWidth:0}}>
                {editing ? (
                  <div>
                    <textarea
                      autoFocus value={draft}
                      onChange={(e)=>setDraft(e.target.value)}
                      style={{
                        width:"100%",background:"#0e1a2e",border:`1px solid ${accent}55`,
                        borderRadius:6,padding:"8px 10px",color:"#eee0bf",
                        fontSize:13,fontFamily:"'Manrope',sans-serif",lineHeight:1.5,
                        minHeight:60,resize:"vertical",outline:"none"
                      }}
                    />
                    <div style={{display:"flex",gap:6,marginTop:6}}>
                      <button disabled={busy} onClick={()=>onSave(it)} style={{
                        background:accent,border:"none",borderRadius:6,padding:"5px 12px",
                        color:"#0a0a0a",fontSize:11,cursor:"pointer",fontWeight:700,
                        fontFamily:"'JetBrains Mono',monospace",letterSpacing:1
                      }}>SAVE</button>
                      <button disabled={busy} onClick={onCancel} style={{
                        background:"transparent",border:"1px solid #26385a",borderRadius:6,
                        padding:"5px 12px",color:"#7a8aa8",fontSize:11,cursor:"pointer",
                        fontFamily:"'JetBrains Mono',monospace",letterSpacing:1
                      }}>CANCEL</button>
                    </div>
                  </div>
                ) : (
                  <div style={{display:"flex",gap:8,alignItems:"flex-start",justifyContent:"space-between"}}>
                    <span style={{fontSize:13,color:"#d6c89a",lineHeight:1.55,fontFamily:"'Manrope',sans-serif"}}>{it.text}</span>
                    <div style={{display:"flex",gap:4,flexShrink:0}}>
                      <button onClick={()=>onEdit(it)} title="Edit" style={iconBtn(accent)}>✎</button>
                      <button onClick={()=>onDelete(it.id)} title="Delete" style={iconBtn("#A56250")}>×</button>
                    </div>
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function iconBtn(color) {
  return {
    background:"transparent",border:`1px solid ${color}33`,borderRadius:4,
    width:24,height:24,color:color,fontSize:12,cursor:"pointer",
    display:"flex",alignItems:"center",justifyContent:"center",
    fontFamily:"'JetBrains Mono',monospace",padding:0
  };
}

function StrategyDiagram() {
  return (
    <div style={{...styles.card, padding:16}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
        <span style={styles.cardTitle}>Setup Diagram</span>
        <span style={{fontSize:10,color:"#4a5a78",fontFamily:"'JetBrains Mono',monospace"}}>HIGH · OTE · DEMAND · TP</span>
      </div>
      <svg viewBox="0 0 800 280" style={{width:"100%",height:"auto",display:"block"}} preserveAspectRatio="xMidYMid meet">
        <defs>
          <linearGradient id="oteGrad2" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={GOLD} stopOpacity="0.22"/>
            <stop offset="100%" stopColor={GOLD} stopOpacity="0.04"/>
          </linearGradient>
          <linearGradient id="demandGrad2" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={G} stopOpacity="0.22"/>
            <stop offset="100%" stopColor={G} stopOpacity="0.04"/>
          </linearGradient>
        </defs>

        {/* HIGH line */}
        <line x1="20" y1="50" x2="780" y2="50" stroke={GOLD} strokeWidth="0.6" strokeDasharray="4 4" opacity="0.6"/>
        <text x="24" y="44" fill={GOLD} fontSize="10" fontFamily="JetBrains Mono, monospace">HIGH</text>

        {/* TP line */}
        <line x1="20" y1="30" x2="780" y2="30" stroke={G} strokeWidth="0.6" strokeDasharray="4 4" opacity="0.8"/>
        <text x="776" y="24" fill={G} fontSize="10" fontFamily="JetBrains Mono, monospace" textAnchor="end">TP · 1:3</text>

        {/* Demand zone */}
        <rect x="20" y="105" width="760" height="35" fill="url(#demandGrad2)" stroke={G} strokeWidth="0.5" strokeDasharray="3 3"/>
        <text x="28" y="126" fill={G} fontSize="10" fontFamily="JetBrains Mono, monospace" fontWeight="700">DEMAND ZONE · ENTRY</text>

        {/* OTE / Premium zone */}
        <rect x="20" y="160" width="760" height="40" fill="url(#oteGrad2)" stroke={GOLD} strokeWidth="0.5" strokeDasharray="3 3"/>
        <text x="28" y="183" fill={GOLD} fontSize="10" fontFamily="JetBrains Mono, monospace" fontWeight="700">OTE · PREMIUM ZONE (0.618 / 0.79)</text>

        {/* SL line */}
        <line x1="20" y1="225" x2="780" y2="225" stroke={R} strokeWidth="0.6" strokeDasharray="4 4" opacity="0.8"/>
        <text x="776" y="220" fill={R} fontSize="10" fontFamily="JetBrains Mono, monospace" textAnchor="end">SL</text>

        {/* LOW line */}
        <line x1="20" y1="250" x2="780" y2="250" stroke="#8b9bb8" strokeWidth="0.5" strokeDasharray="4 4" opacity="0.5"/>
        <text x="24" y="266" fill="#8b9bb8" fontSize="10" fontFamily="JetBrains Mono, monospace">LOW</text>

        {/* Price path: start near high → drop through demand to OTE → bounce up into demand → break up to TP */}
        <path d="M 40 80 L 90 60 L 140 90 L 190 130 L 240 175 L 290 195 L 340 165 L 390 130 L 440 115 L 490 90 L 550 65 L 620 45 L 700 35"
              fill="none" stroke="#d6c89a" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>

        {/* Markers */}
        <circle cx="90" cy="60" r="4" fill={GOLD}/>
        <text x="90" y="74" fill={GOLD} fontSize="9" fontFamily="JetBrains Mono, monospace" textAnchor="middle">High mark</text>

        <circle cx="290" cy="195" r="4" fill={GOLD}/>
        <text x="290" y="216" fill={GOLD} fontSize="9" fontFamily="JetBrains Mono, monospace" textAnchor="middle">OTE touch</text>

        <circle cx="440" cy="115" r="5" fill={G} stroke="#121e34" strokeWidth="1"/>
        <text x="440" y="100" fill={G} fontSize="10" fontFamily="JetBrains Mono, monospace" textAnchor="middle" fontWeight="700">ENTRY · CHOCH</text>

        {/* Arrow to TP */}
        <line x1="500" y1="85" x2="700" y2="35" stroke={G} strokeWidth="0.8" strokeDasharray="3 4" opacity="0.6"/>
        <polygon points="700,35 692,30 692,40" fill={G}/>
      </svg>
    </div>
  );
}

const START_CAPITAL = 1000;
const TARGET_COUNT = 50;
const TARGET_RATE = 0.10;

function buildTargetRows() {
  const rows = [];
  let balance = START_CAPITAL;
  for (let i = 1; i <= TARGET_COUNT; i++) {
    const gain = balance * TARGET_RATE;
    balance += gain;
    rows.push({ step: i, gain: round2(gain), balance: round2(balance) });
  }
  return rows;
}
function round2(n) { return Math.round(n * 100) / 100; }
function money(n) {
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function TargetPage({ requireUnlock, showToast, ledger = [], trades = [] }) {
  const rows = useMemo(() => buildTargetRows(), []);
  const [doneMap, setDoneMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/targets");
        if (!r.ok) throw new Error("api " + r.status);
        const list = await r.json();
        const m = {};
        list.forEach(t => { if (t.done) m[t.step] = { done:true, completedAt:t.completedAt }; });
        setDoneMap(m);
      } catch (e) { console.warn("targets load failed:", e); }
      setLoading(false);
    })();
  }, []);

  const toggle = (step) => requireUnlock(async () => {
    const next = !doneMap[step]?.done;
    setBusy(step);
    const optimistic = { ...doneMap };
    if (next) optimistic[step] = { done:true, completedAt: new Date().toISOString() };
    else delete optimistic[step];
    setDoneMap(optimistic);
    try {
      const r = await fetch("/api/targets", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ step, done: next }),
      });
      if (!r.ok) throw new Error("api " + r.status);
      showToast && showToast(next ? `Target ${step} marked done` : `Target ${step} cleared`, "ok");
    } catch (e) {
      console.error("toggle failed:", e);
      showToast && showToast("Save failed: " + (e?.message||"unknown"), "err");
      setDoneMap(doneMap);
    } finally { setBusy(null); }
  });

  const completed = Object.values(doneMap).filter(t => t.done).length;
  const lastDone = Math.max(0, ...rows.filter(r => doneMap[r.step]?.done).map(r => r.step));

  const _sum = (arr, fn) => arr.reduce((a, x) => a + fn(x), 0);
  const equity = _sum(ledger.filter(e=>e.type==="Starting"),e=>e.amount||0)
               + _sum(ledger.filter(e=>e.type==="Deposit"),e=>e.amount||0)
               - _sum(ledger.filter(e=>e.type==="Withdrawal"),e=>e.amount||0)
               + _sum(ledger.filter(e=>e.type==="Adjustment"),e=>e.amount||0)
               + _sum(trades, t=>parseFloat(t.pnl)||0);

  const nextStep = lastDone < TARGET_COUNT ? lastDone + 1 : null;
  const nextTargetBalance = nextStep ? rows[nextStep - 1].balance : null;
  const dueTarget = nextTargetBalance !== null ? equity - nextTargetBalance : null;

  return (
    <div>
      <div style={{textAlign:"center",marginBottom:24}}>
        <div style={{fontFamily:"'Cormorant Garamond',serif",fontStyle:"italic",fontWeight:500,fontSize:30,color:"#eee0bf",letterSpacing:1,lineHeight:1.1}}>Compounding Targets</div>
        <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:10,marginTop:8}}>
          <div style={{width:40,height:1,background:GOLD,opacity:0.5}}/>
          <span style={{fontSize:10,color:GOLD,fontFamily:"'JetBrains Mono',monospace",letterSpacing:4,textTransform:"uppercase"}}>10% × 50 Steps</span>
          <div style={{width:40,height:1,background:GOLD,opacity:0.5}}/>
        </div>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(160px, 1fr))",gap:10,marginBottom:16}}>
        <StatCard label="Starting" value={money(START_CAPITAL)} sub="Capital base"/>
        <StatCard label="Progress" value={`${completed} / ${TARGET_COUNT}`} sub={`${Math.round(completed/TARGET_COUNT*100)}% complete`} color={GOLD}/>
        <StatCard label="Current Balance" value={money(equity)} sub="Live account" color={G}/>
        {nextTargetBalance !== null && (
          <StatCard
            label="Due Target"
            value={(dueTarget >= 0 ? "+$" : "-$") + Math.abs(dueTarget).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})}
            sub={`Step ${nextStep} · target $${money(nextTargetBalance)}`}
            color={dueTarget >= 0 ? G : R}
          />
        )}
        <StatCard label="Final Target" value={money(rows[rows.length-1].balance)} sub="At step 50"/>
      </div>

      <div style={{...styles.card, padding:0, overflow:"hidden"}}>
        <div style={{padding:"12px 16px",borderBottom:"1px solid #1c2c45",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <span style={styles.cardTitle}>Steps</span>
          <span style={{fontSize:11,color:"#4a5a78",fontFamily:"'JetBrains Mono',monospace"}}>{loading?"loading…":`${completed}/${TARGET_COUNT}`}</span>
        </div>
        <div style={{overflowX:"auto"}}>
          <table style={{width:"100%",borderCollapse:"collapse",minWidth:480}}>
            <thead>
              <tr style={{background:"#0e1a2e"}}>
                <th style={tgTh}>#</th>
                <th style={tgTh}>Gain (10%)</th>
                <th style={tgTh}>Balance</th>
                <th style={{...tgTh,textAlign:"center"}}>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const done = !!doneMap[r.step]?.done;
                const isBusy = busy === r.step;
                return (
                  <tr key={r.step} style={{borderBottom:"1px solid #14223a",background: done?"rgba(212,184,110,0.04)":"transparent"}}>
                    <td style={{...tgTd,fontFamily:"'JetBrains Mono',monospace",color:done?GOLD:"#8b9bb8",fontWeight:700,width:42}}>{String(r.step).padStart(2,"0")}</td>
                    <td style={{...tgTd,fontFamily:"'JetBrains Mono',monospace",color:G}}>+{money(r.gain)}</td>
                    <td style={{...tgTd,fontFamily:"'JetBrains Mono',monospace",color:"#eee0bf",fontWeight:600}}>{money(r.balance)}</td>
                    <td style={{...tgTd,textAlign:"center",width:90}}>
                      <button disabled={isBusy} onClick={()=>toggle(r.step)} style={{
                        background: done?"rgba(212,184,110,0.15)":"transparent",
                        border:`1px solid ${done?GOLD:"#26385a"}`,borderRadius:6,
                        padding:"5px 12px",color: done?GOLD:"#7a8aa8",fontSize:11,
                        cursor:isBusy?"wait":"pointer",fontFamily:"'JetBrains Mono',monospace",
                        fontWeight:700,letterSpacing:1,opacity:isBusy?0.5:1,
                        minWidth:70
                      }}>{isBusy?"…":(done?"✓ DONE":"MARK")}</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, sub, color }) {
  return (
    <div style={{...styles.kpiCard}}>
      <div style={styles.kpiLabel}>{label}</div>
      <div style={{...styles.kpiValue, fontSize:20, color:color||"#eee0bf"}}>{value}</div>
      <div style={styles.kpiSub}>{sub}</div>
    </div>
  );
}

const tgTh = {textAlign:"left",padding:"10px 14px",fontSize:9,color:"#4a5a78",letterSpacing:1,textTransform:"uppercase",fontFamily:"'JetBrains Mono',monospace",borderBottom:"1px solid #1c2c45",whiteSpace:"nowrap"};
const tgTd = {padding:"11px 14px",fontSize:12};

function PortfolioPage({ requireUnlock, showToast, ledger = [], trades = [], onCloseTrade }) {
  const PKEY = "tn-portfolio-v1";
  // Leverage presets: label shown to user → margin % stored internally
  // e.g. 10× leverage means you put up 10% of the buy price as margin
  const LEV_PRESETS = [
    { lbl: "1×",  pct: "100" },
    { lbl: "2×",  pct: "50"  },
    { lbl: "5×",  pct: "20"  },
    { lbl: "10×", pct: "10"  },
    { lbl: "20×", pct: "5"   },
  ];

  const blankForm = () => ({
    symbol: "", name: "",
    buyDate: new Date().toISOString().slice(0, 10),
    buyPrice: "", shares: "", levPct: "100",
  });

  const [holdings, setHoldings] = useState(() => {
    try { return JSON.parse(localStorage.getItem(PKEY) || "[]"); } catch { return []; }
  });
  const [quotes, setQuotes] = useState({});
  const [form, setForm] = useState(blankForm());
  const [showForm, setShowForm] = useState(false);
  const [lookingUp, setLookingUp] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [editH, setEditH] = useState(null);
  const [closeModal, setCloseModal] = useState(null); // { id, symbol, sellPrice, sellDate }

  // Get margin % from a holding — handles old format where leverage was a multiplier
  const getLevPct = (h) => {
    if (h.levPct != null) return Number(h.levPct);
    if (h.leverage != null && h.leverage > 0) return 100 / h.leverage;
    return 100;
  };

  const persist = (next) => {
    setHoldings(next);
    try { localStorage.setItem(PKEY, JSON.stringify(next)); } catch {}
  };

  const syncSave = (item) => {
    fetch("/api/portfolio", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(item),
    }).then(r => { if (!r.ok) throw new Error("api " + r.status); })
      .catch(e => { console.warn("portfolio sync save failed:", e); showToast("Cloud save failed — check Notion setup", "err"); });
  };

  const syncDelete = (id) => {
    fetch(`/api/portfolio?id=${encodeURIComponent(id)}`, { method: "DELETE" })
      .then(r => { if (!r.ok) throw new Error("api " + r.status); })
      .catch(e => { console.warn("portfolio sync delete failed:", e); showToast("Cloud delete failed", "err"); });
  };

  const fetchQuote = async (sym) => {
    const r = await fetch(`/api/quote?symbol=${encodeURIComponent(sym)}`);
    const j = await r.json().catch(() => ({ error: String(r.status) }));
    if (!r.ok) throw new Error(j.error || String(r.status));
    return j;
  };

  const loadQuotes = (list) => {
    const syms = [...new Set(list.filter(h => !h.status || h.status === "open").map(h => h.symbol))];
    if (!syms.length) return;
    setRefreshing(true);
    Promise.allSettled(syms.map(s => fetchQuote(s))).then(res => {
      setQuotes(prev => {
        const next = { ...prev };
        res.forEach((r, i) => {
          if (r.status === "fulfilled") {
            const q = r.value;
            next[syms[i]] = { price: q.price, high52w: q.high52w, low52w: q.low52w };
          }
        });
        return next;
      });
    }).finally(() => setRefreshing(false));
  };

  useEffect(() => {
    let cached = [];
    try { cached = JSON.parse(localStorage.getItem(PKEY) || "[]"); } catch {}

    fetch("/api/portfolio")
      .then(r => r.ok ? r.json() : Promise.reject("api " + r.status))
      .then(list => {
        if (list.length === 0 && cached.length > 0) {
          // Notion database is empty but local data exists — migrate it up
          setHoldings(cached);
          loadQuotes(cached);
          cached.forEach(h => syncSave(h));
          return;
        }
        setHoldings(list);
        try { localStorage.setItem(PKEY, JSON.stringify(list)); } catch {}
        loadQuotes(list);
      })
      .catch(() => {
        // API not reachable — use local cache
        if (cached.length) { setHoldings(cached); loadQuotes(cached); }
      });
  }, []);

  const lookup = async (target, setTarget) => {
    const sym = target.symbol.trim().toUpperCase();
    if (!sym) return;
    setLookingUp(true);
    try {
      const q = await fetchQuote(sym);
      setTarget(p => ({ ...p, symbol: q.symbol, name: q.name }));
      setQuotes(p => ({ ...p, [q.symbol]: { price: q.price, high52w: q.high52w, low52w: q.low52w } }));
    } catch (e) {
      showToast("Symbol not found: " + e.message, "err");
    } finally { setLookingUp(false); }
  };

  const doRefresh = async () => {
    const syms = [...new Set(holdings.filter(h => !h.status || h.status === "open").map(h => h.symbol))];
    if (!syms.length) return;
    setRefreshing(true);
    try {
      const res = await Promise.allSettled(syms.map(s => fetchQuote(s)));
      setQuotes(prev => {
        const next = { ...prev };
        res.forEach((r, i) => {
          if (r.status === "fulfilled") {
            const q = r.value; next[syms[i]] = { price: q.price, high52w: q.high52w, low52w: q.low52w };
          }
        });
        return next;
      });
      showToast("Prices updated ✓", "ok");
    } catch { showToast("Refresh failed", "err"); }
    finally { setRefreshing(false); }
  };

  const addHolding = () => {
    const sym = form.symbol.trim().toUpperCase();
    if (!sym || !form.buyPrice || !form.shares) {
      showToast("Symbol, buy price, and shares are required", "err"); return;
    }
    const lp = Math.min(100, Math.max(0.01, parseFloat(form.levPct) || 100));
    const h = {
      id: String(Date.now()), symbol: sym, name: form.name || sym,
      buyDate: form.buyDate, buyPrice: parseFloat(form.buyPrice),
      shares: parseFloat(form.shares), levPct: lp, status: "open",
    };
    persist([...holdings, h]);
    syncSave(h);
    if (!quotes[sym]) {
      fetchQuote(sym).then(q => setQuotes(p => ({ ...p, [sym]: { price: q.price, high52w: q.high52w, low52w: q.low52w } }))).catch(() => {});
    }
    setForm(blankForm());
    setShowForm(false);
    showToast("Holding added ✓", "ok");
  };

  const saveEdit = () => {
    if (!editH.buyPrice || !editH.shares) { showToast("Buy price and shares are required", "err"); return; }
    const lp = Math.min(100, Math.max(0.01, parseFloat(editH.levPct) || 100));
    const updated = { ...editH, buyPrice: parseFloat(editH.buyPrice), shares: parseFloat(editH.shares), levPct: lp };
    delete updated.leverage; // clear old field if present
    persist(holdings.map(x => x.id === updated.id ? updated : x));
    syncSave(updated);
    if (!quotes[updated.symbol]) {
      fetchQuote(updated.symbol).then(q => setQuotes(p => ({ ...p, [updated.symbol]: { price: q.price, high52w: q.high52w, low52w: q.low52w } }))).catch(() => {});
    }
    setEditH(null);
    showToast("Updated ✓", "ok");
  };

  const removeHolding = (id) => requireUnlock(() => {
    if (!confirm("Remove this holding?")) return;
    persist(holdings.filter(h => h.id !== id));
    syncDelete(id);
    showToast("Removed ✓", "ok");
  });

  const closePosition = async () => {
    if (!closeModal?.sellPrice) { showToast("Enter a sell price", "err"); return; }
    const { id: hId, sellDate } = closeModal;
    const sellPrice = parseFloat(closeModal.sellPrice);
    const h = holdings.find(x => x.id === hId);
    const next = holdings.map(x => x.id === hId ? {
      ...x, status: "closed", sellPrice, sellDate,
    } : x);
    persist(next);
    const closedH = next.find(x => x.id === hId);
    if (closedH) syncSave(closedH);
    setCloseModal(null);
    if (h && onCloseTrade) {
      const pnl = parseFloat(((sellPrice - h.buyPrice) * h.shares).toFixed(2));
      await onCloseTrade({
        id: Date.now(),
        date: sellDate || new Date().toISOString().slice(0, 10),
        time: "",
        symbol: h.symbol,
        direction: "Long",
        setup: "Other",
        entry: h.buyPrice,
        exit: sellPrice,
        size: h.shares,
        pnl,
        rMultiple: "",
        grade: "A",
        emotion: "Neutral",
        notes: `Portfolio close — ${h.name || h.symbol}`,
        screenshots: [],
        screenshotsTouched: false,
      });
    } else {
      showToast("Position closed ✓", "ok");
    }
  };

  const totals = useMemo(() => {
    let inv = 0, gl = 0;
    // Only open positions count toward live totals
    holdings.filter(h => !h.status || h.status === "open").forEach(h => {
      const q = quotes[h.symbol];
      const lp = getLevPct(h);
      inv += h.buyPrice * h.shares * (lp / 100);
      if (q?.price != null) gl += (q.price - h.buyPrice) * h.shares;
    });
    const cur = inv + gl;
    const glPct = inv > 0 ? (gl / inv) * 100 : 0;
    return { inv, cur, gl, glPct };
  }, [holdings, quotes]);

  const fmtUSD = (n) => "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // Shared leverage selector used in both Add form and Edit modal
  const LevSelector = ({ levPct, onChange }) => {
    const cur = String(levPct);
    const isPreset = LEV_PRESETS.some(x => x.pct === cur);
    return (
      <div>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 6 }}>
          {LEV_PRESETS.map(({ lbl, pct }) => (
            <button key={pct} onClick={() => onChange(pct)} style={{
              ...styles.toggleBtn, flex: "0 0 auto", padding: "8px 10px",
              fontSize: 11, fontFamily: "'JetBrains Mono',monospace",
              background: cur === pct ? "rgba(198,164,76,0.15)" : "transparent",
              color: cur === pct ? GOLD : "#5a6b88",
              borderColor: cur === pct ? GOLD : "#26385a",
            }}>{lbl}</button>
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <input type="number" min="0.01" max="100" placeholder="Custom %"
            style={{ ...styles.input, flex: 1 }}
            value={isPreset ? "" : levPct}
            onChange={e => onChange(e.target.value)}
          />
          <span style={{ fontSize: 10, color: "#7e8aa4", fontFamily: "'JetBrains Mono',monospace", whiteSpace: "nowrap" }}>% margin</span>
        </div>
        <div style={{ fontSize: 10, color: "#4a5a78", fontFamily: "'JetBrains Mono',monospace", marginTop: 4 }}>
          {parseFloat(levPct) < 100
            ? `${parseFloat(levPct).toFixed(0)}% of buy price = ${(100 / parseFloat(levPct)).toFixed(1)}× leverage`
            : "No leverage — full price invested"}
        </div>
      </div>
    );
  };

  const openHoldings = holdings.filter(h => !h.status || h.status === "open");
  const closedHoldings = holdings.filter(h => h.status === "closed");

  const accountEquity = useMemo(() => {
    const s = (arr, fn) => arr.reduce((a, x) => a + fn(x), 0);
    return s(ledger.filter(e => e.type === "Starting"), e => e.amount || 0)
         + s(ledger.filter(e => e.type === "Deposit"), e => e.amount || 0)
         - s(ledger.filter(e => e.type === "Withdrawal"), e => e.amount || 0)
         + s(ledger.filter(e => e.type === "Adjustment"), e => e.amount || 0)
         + s(trades, t => parseFloat(t.pnl) || 0);
  }, [ledger, trades]);

  const lookupSym = form.symbol.trim().toUpperCase();
  const lookupQ = quotes[lookupSym];
  const formLevPct = Math.min(100, Math.max(0.01, parseFloat(form.levPct) || 100));
  const formFullPos = form.buyPrice && form.shares ? parseFloat(form.buyPrice) * parseFloat(form.shares) : null;
  const formAmt = formFullPos != null ? formFullPos * (formLevPct / 100) : null;

  return (
    <div>
      <div style={{ textAlign: "center", marginBottom: 20 }}>
        <div style={{ fontFamily: "'Cormorant Garamond',serif", fontStyle: "italic", fontWeight: 500, fontSize: 30, color: "#eee0bf", letterSpacing: 1, lineHeight: 1.1 }}>
          Stock Portfolio
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginTop: 8 }}>
          <div style={{ width: 40, height: 1, background: GOLD, opacity: 0.5 }} />
          <span style={{ fontSize: 10, color: GOLD, fontFamily: "'JetBrains Mono',monospace", letterSpacing: 4, textTransform: "uppercase" }}>Holdings Tracker</span>
          <div style={{ width: 40, height: 1, background: GOLD, opacity: 0.5 }} />
        </div>
      </div>

      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "12px 18px", marginBottom: 14, borderRadius: 10,
        background: "linear-gradient(135deg, rgba(198,164,76,0.10), rgba(198,164,76,0.02))",
        border: `1px solid ${GOLD}33`
      }}>
        <div style={{ fontFamily: "'Cinzel',serif", fontSize: 9, letterSpacing: 3, color: "#7e8aa4", textTransform: "uppercase" }}>Account Equity</div>
        <div style={{ fontFamily: "'JetBrains Mono',monospace", fontWeight: 700, fontSize: 22, color: GOLD }}>
          ${accountEquity.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </div>
      </div>

      {holdings.length > 0 && (
        <div style={styles.kpiRow}>
          {[
            { label: "Total Invested", value: fmtUSD(totals.inv), color: "#eee0bf", sub: "margin capital" },
            { label: "Current Value", value: fmtUSD(totals.cur), color: pnlColor(totals.gl) },
            { label: "Total Gain / Loss", value: fmt$(totals.gl), color: pnlColor(totals.gl) },
            { label: "Return %", value: fmtN(totals.glPct) + "%", color: pnlColor(totals.glPct), sub: `${openHoldings.length} open · ${closedHoldings.length} closed` },
            { label: "Available Balance", value: fmtUSD(accountEquity - totals.inv - Math.abs(totals.gl)), color: GOLD, sub: "equity − invested − P&L" },
          ].map(k => (
            <div key={k.label} style={styles.kpiCard}>
              <div style={styles.kpiLabel}>{k.label}</div>
              <div style={{ ...styles.kpiValue, fontSize: 18, color: k.color }}>{k.value}</div>
              {k.sub && <div style={styles.kpiSub}>{k.sub}</div>}
            </div>
          ))}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
        <button onClick={() => { if (showForm) setShowForm(false); else requireUnlock(() => setShowForm(true)); }} style={{
          background: showForm ? "rgba(198,164,76,0.15)" : "transparent",
          border: `1px solid ${showForm ? GOLD : GOLD + "66"}`,
          borderRadius: 6, padding: "8px 16px", color: GOLD, fontSize: 11, cursor: "pointer",
          fontFamily: "'Cinzel',serif", letterSpacing: 2, textTransform: "uppercase", fontWeight: 600
        }}>{showForm ? "✕ Close" : "+ Add Holding"}</button>
        {holdings.length > 0 && (
          <button onClick={doRefresh} disabled={refreshing} style={{
            background: "transparent", border: "1px solid #26385a", borderRadius: 6,
            padding: "8px 16px", color: refreshing ? "#4a5a78" : "#9caac4", fontSize: 11,
            cursor: refreshing ? "wait" : "pointer",
            fontFamily: "'Cinzel',serif", letterSpacing: 2, textTransform: "uppercase", fontWeight: 600, opacity: refreshing ? 0.6 : 1
          }}>{refreshing ? "Updating…" : "⟳ Refresh Prices"}</button>
        )}
      </div>

      {showForm && (
        <div style={{ ...styles.card, marginBottom: 16, borderColor: GOLD + "44" }}>
          <div style={styles.cardHeader}>
            <span style={styles.cardTitle}>New Holding</span>
            <span style={{ fontSize: 11, color: "#4a5a78", fontFamily: "'JetBrains Mono',monospace" }}>Type symbol → Lookup → fill details</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
            <Field label="Symbol *">
              <div style={{ display: "flex", gap: 6 }}>
                <input placeholder="AAPL, TSLA…" style={{ ...styles.input, flex: 1, textTransform: "uppercase" }}
                  value={form.symbol} onChange={e => setForm(p => ({ ...p, symbol: e.target.value.toUpperCase(), name: "" }))}
                  onKeyDown={e => { if (e.key === "Enter") lookup(form, setForm); }}/>
                <button onClick={() => lookup(form, setForm)} disabled={lookingUp || !form.symbol.trim()} style={{
                  background: "transparent", border: `1px solid ${GOLD}66`, borderRadius: 6,
                  padding: "0 12px", color: GOLD, fontSize: 11,
                  cursor: lookingUp || !form.symbol.trim() ? "wait" : "pointer",
                  fontFamily: "'Cinzel',serif", letterSpacing: 1, textTransform: "uppercase",
                  fontWeight: 700, opacity: lookingUp || !form.symbol.trim() ? 0.4 : 1, whiteSpace: "nowrap", flexShrink: 0
                }}>{lookingUp ? "…" : "Lookup"}</button>
              </div>
            </Field>
            <Field label="Company Name">
              <input placeholder="Auto-filled on lookup" style={{ ...styles.input, color: form.name ? "#eee0bf" : undefined }}
                value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}/>
            </Field>
            <Field label="Buy Date">
              <input type="date" style={styles.input} value={form.buyDate} onChange={e => setForm(p => ({ ...p, buyDate: e.target.value }))}/>
            </Field>
            <Field label="Buy Price ($) *">
              <input type="number" placeholder="0.00" style={styles.input} value={form.buyPrice} onChange={e => setForm(p => ({ ...p, buyPrice: e.target.value }))}/>
            </Field>
            <Field label="Shares *">
              <input type="number" placeholder="0" style={styles.input} value={form.shares} onChange={e => setForm(p => ({ ...p, shares: e.target.value }))}/>
            </Field>
            <div style={{ gridColumn: "1 / -1" }}>
              <Field label="Leverage">
                <LevSelector levPct={form.levPct} onChange={v => setForm(p => ({ ...p, levPct: v }))}/>
              </Field>
            </div>
            <Field label="Amount Invested (Margin)">
              <div style={{ ...styles.input, background: "#0a1220", border: "1px solid #1c2c45", color: GOLD, fontWeight: 700, cursor: "default" }}>
                {formAmt != null ? fmtUSD(formAmt) : <span style={{ color: "#4a5a78" }}>—</span>}
              </div>
            </Field>
            {formFullPos != null && formLevPct < 100 && (
              <Field label="Full Position Size">
                <div style={{ ...styles.input, background: "#0a1220", border: `1px solid ${GOLD}44`, color: "#9caac4", fontWeight: 600, cursor: "default" }}>
                  {fmtUSD(formFullPos)}
                  <span style={{ fontSize: 10, color: "#7e8aa4", marginLeft: 8, fontFamily: "'JetBrains Mono',monospace" }}>({(100 / formLevPct).toFixed(1)}× position)</span>
                </div>
              </Field>
            )}
          </div>
          {lookupSym && lookupQ && (
            <div style={{ marginTop: 12, padding: "10px 14px", background: "#0e1a2e", borderRadius: 6, border: "1px solid #1c2c45", display: "flex", gap: 28, flexWrap: "wrap" }}>
              {[
                { label: "Current Price", value: lookupQ.price, color: GOLD },
                { label: "52W High", value: lookupQ.high52w, color: G },
                { label: "52W Low", value: lookupQ.low52w, color: R },
              ].map(({ label, value, color }) => (
                <div key={label}>
                  <span style={{ fontSize: 9, color: "#4a5a78", fontFamily: "'JetBrains Mono',monospace", letterSpacing: 1, textTransform: "uppercase" }}>{label} · </span>
                  <span style={{ fontFamily: "'JetBrains Mono',monospace", color, fontWeight: 700, fontSize: 13 }}>{value != null ? `$${value.toFixed(2)}` : "—"}</span>
                </div>
              ))}
            </div>
          )}
          <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
            <button onClick={addHolding} style={styles.primaryBtn}>Save Holding</button>
            <button onClick={() => setShowForm(false)} style={styles.ghostBtn}>Cancel</button>
          </div>
        </div>
      )}

      {openHoldings.length === 0 && closedHoldings.length === 0 ? (
        <div style={styles.empty}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>📈</div>
          <div style={{ fontFamily: "'Manrope',sans-serif", fontWeight: 700, fontSize: 20, color: "#eee0bf", marginBottom: 8 }}>No holdings yet</div>
          <div style={{ color: "#5a6b88", fontSize: 13, marginBottom: 24 }}>Add your first stock to start tracking your portfolio</div>
          <button style={styles.primaryBtn} onClick={() => requireUnlock(() => setShowForm(true))}>Add First Holding</button>
        </div>
      ) : (
        <>
          {openHoldings.length > 0 && (
            <>
              <div style={{ ...styles.cardHeader, marginBottom: 8 }}>
                <span style={styles.cardTitle}>Open Positions</span>
                <span style={{ fontSize: 11, color: "#4a5a78", fontFamily: "'JetBrains Mono',monospace" }}>{openHoldings.length} active</span>
              </div>
              <div style={styles.tableWrap}>
                <table style={{ ...styles.table, minWidth: 1160 }}>
                  <thead>
                    <tr>
                      {["Symbol","Company","Buy Date","Buy Price","Shares","Lev","Invested","Current Price","52W High","52W Low","Current Value","Gain/Loss $","Gain/Loss %",""].map(h => (
                        <th key={h} style={styles.th}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {openHoldings.map(h => {
                      const q = quotes[h.symbol] || {};
                      const hasPx = q.price != null;
                      const lp = getLevPct(h);
                      const levMult = lp < 100 ? (100 / lp) : 1;
                      const amt = h.buyPrice * h.shares * (lp / 100);
                      const gl = hasPx ? (q.price - h.buyPrice) * h.shares : 0;
                      const curVal = amt + (hasPx ? gl : 0);
                      const glPct = amt > 0 ? (gl / amt) * 100 : 0;
                      const c = pnlColor(gl);
                      return (
                        <tr key={h.id} style={styles.tr}
                          onMouseEnter={e => e.currentTarget.style.background = "#16243c"}
                          onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                          <td style={{ ...styles.td, fontFamily: "'JetBrains Mono',monospace", fontWeight: 700, color: GOLD }}>{h.symbol}</td>
                          <td style={{ ...styles.td, color: "#cec2a3", fontSize: 11, maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{h.name}</td>
                          <td style={{ ...styles.td, ...styles.tdMono, color: "#7e8aa4" }}>{h.buyDate}</td>
                          <td style={{ ...styles.td, ...styles.tdMono }}>${h.buyPrice.toFixed(2)}</td>
                          <td style={{ ...styles.td, ...styles.tdMono }}>{h.shares.toLocaleString()}</td>
                          <td style={{ ...styles.td, textAlign: "center" }}>
                            <span style={{
                              display: "inline-block", padding: "2px 7px", borderRadius: 4,
                              fontSize: 10, fontWeight: 700, fontFamily: "'JetBrains Mono',monospace",
                              background: levMult > 1 ? "rgba(198,164,76,0.15)" : "rgba(90,107,136,0.12)",
                              color: levMult > 1 ? GOLD : "#5a6b88",
                              border: `1px solid ${levMult > 1 ? GOLD + "55" : "#2a3a55"}`
                            }}>{levMult > 1 ? `${levMult.toFixed(0)}×` : "1×"}</span>
                          </td>
                          <td style={{ ...styles.td, ...styles.tdMono, color: "#9caac4" }}>{fmtUSD(amt)}</td>
                          <td style={{ ...styles.td, ...styles.tdMono, color: hasPx ? GOLD : "#4a5a78", fontWeight: 700 }}>
                            {hasPx ? `$${q.price.toFixed(2)}` : <span style={{ fontSize: 10, color: "#3a4a62" }}>loading…</span>}
                          </td>
                          <td style={{ ...styles.td, ...styles.tdMono, color: hasPx && q.high52w != null ? G : "#4a5a78" }}>
                            {hasPx && q.high52w != null ? `$${q.high52w.toFixed(2)}` : "—"}
                          </td>
                          <td style={{ ...styles.td, ...styles.tdMono, color: hasPx && q.low52w != null ? R : "#4a5a78" }}>
                            {hasPx && q.low52w != null ? `$${q.low52w.toFixed(2)}` : "—"}
                          </td>
                          <td style={{ ...styles.td, ...styles.tdMono, fontWeight: 600, color: hasPx ? "#eee0bf" : "#4a5a78" }}>
                            {hasPx ? fmtUSD(curVal) : "—"}
                          </td>
                          <td style={{ ...styles.td, ...styles.tdMono, fontWeight: 700, color: hasPx ? c : "#4a5a78" }}>
                            {hasPx ? fmt$(gl) : "—"}
                          </td>
                          <td style={{ ...styles.td, ...styles.tdMono, fontWeight: 700, color: hasPx ? c : "#4a5a78" }}>
                            {hasPx ? fmtN(glPct) + "%" : "—"}
                          </td>
                          <td style={{ ...styles.td, textAlign: "right" }}>
                            <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
                              <button title="Close / Sell position" onClick={() => requireUnlock(() => setCloseModal({ id: h.id, symbol: h.symbol, sellPrice: "", sellDate: new Date().toISOString().slice(0, 10) }))} style={{ ...iconBtn(G), fontSize: 10, padding: "3px 6px", width: "auto" }}>Sell</button>
                              <button title="Edit" onClick={() => requireUnlock(() => setEditH({ ...h, levPct: String(getLevPct(h)), buyPrice: String(h.buyPrice), shares: String(h.shares) }))} style={iconBtn(GOLD)}>✎</button>
                              <button title="Remove" onClick={() => removeHolding(h.id)} style={iconBtn(R)}>×</button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {closedHoldings.length > 0 && (
            <div style={{ marginTop: 24 }}>
              <div style={{ ...styles.cardHeader, marginBottom: 8 }}>
                <span style={styles.cardTitle}>Closed Positions</span>
                <span style={{ fontSize: 11, color: "#4a5a78", fontFamily: "'JetBrains Mono',monospace" }}>{closedHoldings.length} trade{closedHoldings.length !== 1 ? "s" : ""} · history</span>
              </div>
              <div style={styles.tableWrap}>
                <table style={{ ...styles.table, minWidth: 1060 }}>
                  <thead>
                    <tr>
                      {["Symbol","Company","Buy Date","Buy Price","Sell Date","Sell Price","Shares","Lev","Invested","Realized Value","Gain/Loss $","Gain/Loss %",""].map(h => (
                        <th key={h} style={styles.th}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {closedHoldings.map(h => {
                      const lp = getLevPct(h);
                      const levMult = lp < 100 ? (100 / lp) : 1;
                      const amt = h.buyPrice * h.shares * (lp / 100);
                      const gl = (h.sellPrice - h.buyPrice) * h.shares;
                      const realizedVal = amt + gl;
                      const glPct = amt > 0 ? (gl / amt) * 100 : 0;
                      const c = pnlColor(gl);
                      return (
                        <tr key={h.id} style={{ ...styles.tr, opacity: 0.8 }}
                          onMouseEnter={e => e.currentTarget.style.background = "#16243c"}
                          onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                          <td style={{ ...styles.td, fontFamily: "'JetBrains Mono',monospace", fontWeight: 700, color: "#9caac4" }}>
                            {h.symbol}
                            <span style={{ marginLeft: 6, fontSize: 9, color: "#4a5a78", fontFamily: "'Cinzel',serif", letterSpacing: 1, textTransform: "uppercase" }}>closed</span>
                          </td>
                          <td style={{ ...styles.td, color: "#7e8aa4", fontSize: 11, maxWidth: 130, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{h.name}</td>
                          <td style={{ ...styles.td, ...styles.tdMono, color: "#5a6b88" }}>{h.buyDate}</td>
                          <td style={{ ...styles.td, ...styles.tdMono, color: "#7e8aa4" }}>${h.buyPrice.toFixed(2)}</td>
                          <td style={{ ...styles.td, ...styles.tdMono, color: "#7e8aa4" }}>{h.sellDate || "—"}</td>
                          <td style={{ ...styles.td, ...styles.tdMono, color: "#eee0bf", fontWeight: 700 }}>${h.sellPrice.toFixed(2)}</td>
                          <td style={{ ...styles.td, ...styles.tdMono, color: "#7e8aa4" }}>{h.shares.toLocaleString()}</td>
                          <td style={{ ...styles.td, textAlign: "center" }}>
                            <span style={{
                              display: "inline-block", padding: "2px 7px", borderRadius: 4,
                              fontSize: 10, fontWeight: 700, fontFamily: "'JetBrains Mono',monospace",
                              background: levMult > 1 ? "rgba(198,164,76,0.10)" : "rgba(90,107,136,0.08)",
                              color: levMult > 1 ? GOLD + "aa" : "#4a5a68",
                              border: `1px solid ${levMult > 1 ? GOLD + "33" : "#1a2a3a"}`
                            }}>{levMult > 1 ? `${levMult.toFixed(0)}×` : "1×"}</span>
                          </td>
                          <td style={{ ...styles.td, ...styles.tdMono, color: "#7e8aa4" }}>{fmtUSD(amt)}</td>
                          <td style={{ ...styles.td, ...styles.tdMono, fontWeight: 600, color: "#eee0bf" }}>{fmtUSD(realizedVal)}</td>
                          <td style={{ ...styles.td, ...styles.tdMono, fontWeight: 700, color: c }}>{fmt$(gl)}</td>
                          <td style={{ ...styles.td, ...styles.tdMono, fontWeight: 700, color: c }}>{fmtN(glPct)}%</td>
                          <td style={{ ...styles.td, textAlign: "right" }}>
                            <button title="Remove" onClick={() => removeHolding(h.id)} style={iconBtn(R)}>×</button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* Close / Sell Modal */}
      {closeModal && (
        <div onClick={() => setCloseModal(null)} style={{
          position: "fixed", inset: 0, zIndex: 1000,
          background: "rgba(8,8,16,0.88)", backdropFilter: "blur(6px)",
          display: "flex", alignItems: "center", justifyContent: "center",
          padding: 20, fontFamily: "'Manrope',sans-serif"
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: "#121e34", border: `1px solid ${G}44`, borderRadius: 14,
            padding: 28, width: "100%", maxWidth: 380,
            boxShadow: "0 20px 60px rgba(0,0,0,0.6)"
          }}>
            <div style={{ fontFamily: "'Cormorant Garamond',serif", fontStyle: "italic", fontWeight: 500, fontSize: 22, color: "#eee0bf", marginBottom: 2 }}>Close Position</div>
            <div style={{ fontSize: 10, color: G, fontFamily: "'JetBrains Mono',monospace", letterSpacing: 3, textTransform: "uppercase", marginBottom: 20 }}>{closeModal.symbol} · Record your sell</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <Field label="Sell Date">
                <input type="date" style={styles.input} value={closeModal.sellDate}
                  onChange={e => setCloseModal(p => ({ ...p, sellDate: e.target.value }))}/>
              </Field>
              <Field label="Sell Price ($) *">
                <input type="number" placeholder="0.00" autoFocus style={{ ...styles.input, fontSize: 20, color: G, fontWeight: 700 }}
                  value={closeModal.sellPrice}
                  onChange={e => setCloseModal(p => ({ ...p, sellPrice: e.target.value }))}
                  onKeyDown={e => { if (e.key === "Enter") closePosition(); }}/>
              </Field>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
              <button onClick={closePosition} style={{ ...styles.primaryBtn, background: G, flex: 2 }}>Confirm Sell</button>
              <button onClick={() => setCloseModal(null)} style={{ ...styles.ghostBtn, flex: 1 }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editH && (
        <div onClick={() => setEditH(null)} style={{
          position: "fixed", inset: 0, zIndex: 1000,
          background: "rgba(8,8,16,0.88)", backdropFilter: "blur(6px)",
          display: "flex", alignItems: "center", justifyContent: "center",
          padding: 20, fontFamily: "'Manrope',sans-serif"
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: "#121e34", border: "1px solid #1c2c45", borderRadius: 14,
            padding: 24, width: "100%", maxWidth: 580,
            boxShadow: "0 20px 60px rgba(0,0,0,0.6)", maxHeight: "90vh", overflowY: "auto"
          }}>
            <div style={{ fontFamily: "'Cormorant Garamond',serif", fontStyle: "italic", fontWeight: 500, fontSize: 22, color: "#eee0bf", marginBottom: 2 }}>Edit Holding</div>
            <div style={{ fontSize: 10, color: GOLD, fontFamily: "'JetBrains Mono',monospace", letterSpacing: 3, textTransform: "uppercase", marginBottom: 18 }}>{editH.symbol}</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
              <Field label="Symbol">
                <div style={{ display: "flex", gap: 6 }}>
                  <input style={{ ...styles.input, flex: 1, textTransform: "uppercase" }}
                    value={editH.symbol}
                    onChange={e => setEditH(p => ({ ...p, symbol: e.target.value.toUpperCase() }))}
                    onKeyDown={e => { if (e.key === "Enter") lookup(editH, setEditH); }}/>
                  <button onClick={() => lookup(editH, setEditH)} disabled={lookingUp} style={{
                    background: "transparent", border: `1px solid ${GOLD}66`, borderRadius: 6,
                    padding: "0 10px", color: GOLD, fontSize: 11, cursor: lookingUp ? "wait" : "pointer",
                    fontFamily: "'Cinzel',serif", letterSpacing: 1, textTransform: "uppercase", fontWeight: 700, flexShrink: 0
                  }}>{lookingUp ? "…" : "Lookup"}</button>
                </div>
              </Field>
              <Field label="Company Name">
                <input style={styles.input} value={editH.name}
                  onChange={e => setEditH(p => ({ ...p, name: e.target.value }))}/>
              </Field>
              <Field label="Buy Date">
                <input type="date" style={styles.input} value={editH.buyDate}
                  onChange={e => setEditH(p => ({ ...p, buyDate: e.target.value }))}/>
              </Field>
              <Field label="Buy Price ($)">
                <input type="number" style={styles.input} value={editH.buyPrice}
                  onChange={e => setEditH(p => ({ ...p, buyPrice: e.target.value }))}/>
              </Field>
              <Field label="Shares">
                <input type="number" style={styles.input} value={editH.shares}
                  onChange={e => setEditH(p => ({ ...p, shares: e.target.value }))}/>
              </Field>
              <div style={{ gridColumn: "1 / -1" }}>
                <Field label="Leverage">
                  <LevSelector levPct={editH.levPct} onChange={v => setEditH(p => ({ ...p, levPct: v }))}/>
                </Field>
              </div>
              <Field label="Amount Invested (Margin)">
                <div style={{ ...styles.input, background: "#0a1220", border: "1px solid #1c2c45", color: GOLD, fontWeight: 700, cursor: "default" }}>
                  {editH.buyPrice && editH.shares
                    ? fmtUSD(parseFloat(editH.buyPrice) * parseFloat(editH.shares) * (Math.min(100, Math.max(0.01, parseFloat(editH.levPct) || 100)) / 100))
                    : <span style={{ color: "#4a5a78" }}>—</span>}
                </div>
              </Field>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
              <button onClick={saveEdit} style={styles.primaryBtn}>Save Changes</button>
              <button onClick={() => setEditH(null)} style={styles.ghostBtn}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Lightbox({ urls, index, onChange, onClose }) {
  const total = urls.length;
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight" && total > 1) onChange((index + 1) % total);
      else if (e.key === "ArrowLeft" && total > 1) onChange((index - 1 + total) % total);
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [index, total, onChange, onClose]);
  const prev = () => onChange((index - 1 + total) % total);
  const next = () => onChange((index + 1) % total);
  return (
    <div onClick={onClose} style={{
      position:"fixed",inset:0,zIndex:1500,background:"rgba(0,0,0,0.95)",
      display:"flex",alignItems:"center",justifyContent:"center",
      padding:"60px 12px 24px"
    }}>
      <button onClick={(e)=>{e.stopPropagation();onClose();}} style={{
        position:"fixed",top:14,left:14,zIndex:1600,
        background:"rgba(15,15,26,0.85)",border:"1px solid #26385a",borderRadius:8,
        padding:"10px 16px",color:"#eee0bf",fontSize:13,cursor:"pointer",
        fontFamily:"'Manrope',sans-serif",fontWeight:600,letterSpacing:0.5,
        display:"flex",alignItems:"center",gap:6,backdropFilter:"blur(8px)"
      }}>← Back</button>
      <div style={{
        position:"fixed",top:14,right:14,zIndex:1600,
        background:"rgba(15,15,26,0.85)",border:"1px solid #26385a",borderRadius:8,
        padding:"10px 12px",color:GOLD,fontSize:11,
        fontFamily:"'JetBrains Mono',monospace",backdropFilter:"blur(8px)"
      }}>{index+1} / {total}</div>
      <img onClick={(e)=>e.stopPropagation()} src={urls[index]} alt={`image-${index+1}`}
        style={{maxWidth:"100%",maxHeight:"100%",objectFit:"contain",borderRadius:6,boxShadow:"0 10px 40px rgba(0,0,0,0.6)"}}/>
      {total > 1 && (
        <>
          <button onClick={(e)=>{e.stopPropagation();prev();}} style={{
            position:"fixed",left:8,top:"50%",transform:"translateY(-50%)",zIndex:1600,
            background:"rgba(15,15,26,0.85)",border:"1px solid #26385a",borderRadius:"50%",
            width:44,height:44,color:"#eee0bf",fontSize:20,cursor:"pointer",
            display:"flex",alignItems:"center",justifyContent:"center",
            backdropFilter:"blur(8px)"
          }}>‹</button>
          <button onClick={(e)=>{e.stopPropagation();next();}} style={{
            position:"fixed",right:8,top:"50%",transform:"translateY(-50%)",zIndex:1600,
            background:"rgba(15,15,26,0.85)",border:"1px solid #26385a",borderRadius:"50%",
            width:44,height:44,color:"#eee0bf",fontSize:20,cursor:"pointer",
            display:"flex",alignItems:"center",justifyContent:"center",
            backdropFilter:"blur(8px)"
          }}>›</button>
        </>
      )}
    </div>
  );
}

function Field({label, children}) {
  return (
    <div>
      <label style={{display:"block",fontSize:10,color:"#6b7798",fontFamily:"'JetBrains Mono',monospace",letterSpacing:0.8,textTransform:"uppercase",marginBottom:6}}>{label}</label>
      {children}
    </div>
  );
}

function gradeStyle(g) {
  const map = {"A+":GOLD,"A":"#bbb29a","B":"#9caac4","C":"#7a8aa8","D":R};
  return {color:map[g]||"#7a8aa8", borderColor:(map[g]||"#4a5a78")+"55", background:(map[g]||"#4a5a78")+"11"};
}

const styles = {
  root:{display:"flex",flexDirection:"column",height:"100dvh",minHeight:"100vh",background:"#0b1424",color:"#eee0bf",fontFamily:"'Manrope',sans-serif",overflow:"hidden"},
  header:{display:"flex",alignItems:"center",gap:16,padding:"0 16px",height:52,background:"#0e1a2e",borderBottom:"1px solid #14223a",flexShrink:0},
  logo:{display:"flex",alignItems:"center",gap:8},
  nav:{display:"flex",gap:2,flexShrink:1,minWidth:0},
  navBtn:{background:"none",border:"none",color:"#7e8aa4",fontSize:11,fontFamily:"'Cinzel',serif",fontWeight:500,padding:"6px 12px",borderRadius:6,cursor:"pointer",letterSpacing:1.5,whiteSpace:"nowrap",textTransform:"uppercase"},
  navBtnActive:{color:"#eee0bf",background:"#16243c",fontWeight:600},
  headerRight:{marginLeft:"auto",display:"flex",alignItems:"center",gap:10,flexShrink:0},
  body:{flex:1,overflowY:"auto",overscrollBehavior:"contain",padding:"20px 16px 48px",WebkitOverflowScrolling:"touch"},
  page:{maxWidth:1300,margin:"0 auto"},
  kpiRow:{display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(140px, 1fr))",gap:10,marginBottom:14},
  kpiCard:{background:"#121e34",border:"1px solid #1c2c45",borderRadius:10,padding:"14px 16px"},
  kpiLabel:{fontSize:10,color:"#7e8aa4",letterSpacing:2,textTransform:"uppercase",fontFamily:"'Cinzel',serif",fontWeight:500,marginBottom:6},
  kpiValue:{fontSize:22,fontFamily:"'JetBrains Mono',monospace",fontWeight:700,lineHeight:1,marginBottom:4},
  kpiSub:{fontSize:10,color:"#4a5a78",fontFamily:"'JetBrains Mono',monospace"},
  chartsRow:{display:"flex",gap:12,marginBottom:14,flexWrap:"wrap"},
  card:{background:"#121e34",border:"1px solid #1c2c45",borderRadius:10,padding:14,minWidth:0},
  cardHeader:{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12},
  cardTitle:{fontSize:12,fontWeight:600,color:"#c6a44c",letterSpacing:2,textTransform:"uppercase",fontFamily:"'Cinzel',serif"},
  empty:{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"80px 0",color:"#9caac4"},
  filterRow:{display:"flex",gap:8,alignItems:"center",marginBottom:12,flexWrap:"wrap"},
  filterInput:{background:"#121e34",border:"1px solid #1c2c45",borderRadius:6,padding:"8px 12px",color:"#cec2a3",fontSize:13,fontFamily:"'JetBrains Mono',monospace",width:130,maxWidth:"100%"},
  filterSelect:{background:"#121e34",border:"1px solid #1c2c45",borderRadius:6,padding:"8px 12px",color:"#cec2a3",fontSize:13,fontFamily:"'JetBrains Mono',monospace"},
  tableWrap:{overflowX:"auto",borderRadius:10,border:"1px solid #1c2c45"},
  table:{width:"100%",borderCollapse:"collapse",background:"#121e34"},
  th:{textAlign:"left",padding:"10px 14px",fontSize:10,color:"#c6a44c",letterSpacing:2,textTransform:"uppercase",fontFamily:"'Cinzel',serif",fontWeight:500,borderBottom:"1px solid #1c2c45",background:"#0e1a2e",whiteSpace:"nowrap"},
  tr:{borderBottom:"1px solid #14223a",cursor:"pointer",transition:"background 0.15s"},
  td:{padding:"11px 14px",fontSize:12},
  tdMono:{fontFamily:"'JetBrains Mono',monospace"},
  dirBadge:{display:"inline-block",fontSize:10,fontWeight:700,fontFamily:"'JetBrains Mono',monospace",padding:"2px 7px",borderRadius:4,letterSpacing:0.5},
  gradeBadge:{display:"inline-block",fontSize:10,fontWeight:700,fontFamily:"'JetBrains Mono',monospace",padding:"2px 7px",borderRadius:4,border:"1px solid"},
  formGrid:{display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(150px, 1fr))",gap:12},
  input:{width:"100%",background:"#0e1a2e",border:"1px solid #1c2c45",borderRadius:6,padding:"10px 12px",color:"#eee0bf",fontSize:16,fontFamily:"'JetBrains Mono',monospace"},
  toggleBtn:{background:"transparent",border:"1px solid #26385a",borderRadius:6,padding:"9px 10px",color:"#5a6b88",fontSize:12,fontFamily:"'Manrope',sans-serif",fontWeight:600,cursor:"pointer",transition:"all 0.15s"},
  primaryBtn:{background:GOLD,border:"none",borderRadius:7,padding:"10px 24px",color:"#0a0a0a",fontSize:13,fontWeight:700,fontFamily:"'Manrope',sans-serif",cursor:"pointer",letterSpacing:0.3},
  ghostBtn:{background:"transparent",border:"1px solid #26385a",borderRadius:7,padding:"10px 20px",color:"#8b9bb8",fontSize:13,fontFamily:"'Manrope',sans-serif",cursor:"pointer",fontWeight:600},
  uploadBtn:{background:"transparent",border:"1px dashed #26385a",borderRadius:7,padding:"10px 18px",color:"#7a8aa8",fontSize:12,fontFamily:"'Manrope',sans-serif",cursor:"pointer"},
  backBtn:{background:"none",border:"none",color:"#5a6b88",fontSize:12,fontFamily:"'Manrope',sans-serif",fontWeight:600,cursor:"pointer",padding:0},
};
