import { useState, useEffect, useMemo, useRef } from "react";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, ReferenceLine, Cell, CartesianGrid
} from "recharts";
import { loadTrades, saveTrade, saveAll, removeTrade, useCloud } from "./storage.js";

const G = "#00E5A0";
const R = "#FF4560";
const GOLD = "#C9A840";
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
  screenshot: null,
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

export default function App() {
  const [unlocked, setUnlocked] = useState(() => {
    try { return sessionStorage.getItem(PIN_KEY) === "1"; } catch { return false; }
  });
  if (!unlocked) return <PinGate onPass={() => setUnlocked(true)} />;
  return <TradingJournal onLock={() => { sessionStorage.removeItem(PIN_KEY); setUnlocked(false); }} />;
}

function PinGate({ onPass }) {
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
      minHeight:"100vh",background:"radial-gradient(ellipse at top, #14141e 0%, #080810 60%)",
      display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Manrope',sans-serif"
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700&family=Manrope:wght@400;500;600;700;800&family=Cormorant+Garamond:ital,wght@1,400;1,500&display=swap');
        @keyframes shake { 0%,100%{transform:translateX(0)} 25%{transform:translateX(-8px)} 75%{transform:translateX(8px)} }
        .pin-shake { animation: shake 0.4s ease; }
      `}</style>
      <div className={shake?"pin-shake":""} style={{textAlign:"center",padding:40}}>
        <Brand size="hero"/>
        <div style={{margin:"36px auto 0",maxWidth:280}}>
          <input
            type="password" inputMode="numeric" autoFocus value={pin}
            onChange={e=>{setPin(e.target.value);setErr(false);}}
            onKeyDown={e=>e.key==="Enter"&&submit()}
            placeholder="• • • •"
            style={{
              width:"100%",background:"#0b0b13",border:`1px solid ${err?R:"#252535"}`,
              borderRadius:8,padding:"14px 16px",color:GOLD,
              fontSize:22,fontFamily:"'JetBrains Mono',monospace",
              textAlign:"center",letterSpacing:8,outline:"none"
            }}
          />
          <button onClick={submit} style={{
            width:"100%",marginTop:12,background:GOLD,border:"none",borderRadius:8,
            padding:"12px",color:"#0a0a0a",fontWeight:700,fontSize:13,cursor:"pointer",
            letterSpacing:1,textTransform:"uppercase"
          }}>Enter</button>
          {err && <div style={{color:R,fontSize:11,marginTop:10,fontFamily:"'JetBrains Mono',monospace"}}>incorrect pin</div>}
        </div>
        <div style={{marginTop:32,fontSize:10,color:"#3a3a55",fontFamily:"'JetBrains Mono',monospace",letterSpacing:2}}>PRIVATE · AUTHORIZED ACCESS</div>
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
            fontSize:34,color:"#e8e8f0",letterSpacing:1,lineHeight:1,marginTop:6
          }}>Mahmudur</div>
          <div style={{display:"flex",alignItems:"center",gap:10,marginTop:2}}>
            <div style={{width:30,height:1,background:GOLD,opacity:0.5}}/>
            <span style={{
              fontFamily:"'Manrope',sans-serif",fontWeight:700,fontSize:11,
              color:GOLD,letterSpacing:6,textTransform:"uppercase"
            }}>Trade Note</span>
            <div style={{width:30,height:1,background:GOLD,opacity:0.5}}/>
          </div>
          <div style={{fontSize:9,color:"#3a3a55",letterSpacing:3,fontFamily:"'JetBrains Mono',monospace",marginTop:8}}>EST · MMXXVI</div>
        </>
      ) : (
        <div style={{display:"flex",flexDirection:"column",alignItems:"flex-start",marginLeft:10,position:"absolute",left:64,top:10}}>
          <span style={{fontFamily:"'Cormorant Garamond',serif",fontStyle:"italic",fontWeight:500,fontSize:15,color:"#e8e8f0",lineHeight:1}}>Mahmudur</span>
          <span style={{fontFamily:"'Manrope',sans-serif",fontWeight:700,fontSize:8,color:GOLD,letterSpacing:3,textTransform:"uppercase",marginTop:2}}>Trade Note</span>
        </div>
      )}
      {showLock && (
        <button onClick={onLock} title="Lock" style={{
          position:"absolute",right:24,top:14,background:"transparent",border:"1px solid #252535",
          borderRadius:6,padding:"5px 10px",color:"#666",fontSize:10,cursor:"pointer",
          fontFamily:"'JetBrains Mono',monospace",letterSpacing:1
        }}>LOCK</button>
      )}
    </div>
  );
}

function TradingJournal({ onLock }) {
  const [trades, setTrades] = useState([]);
  const [view, setView] = useState("dashboard");
  const [form, setForm] = useState(blank());
  const [selected, setSelected] = useState(null);
  const [filter, setFilter] = useState({ symbol: "", dir: "All", result: "All", setup: "All" });
  const [loaded, setLoaded] = useState(false);
  const fileRef = useRef();

  useEffect(() => {
    (async () => {
      try {
        const data = await loadTrades();
        setTrades(data);
      } catch (e) { console.error(e); }
      setLoaded(true);
    })();
  }, []);

  const addTrade = async () => {
    if (!form.symbol || !form.pnl) return;
    const t = { ...form, id: Date.now() };
    const updated = [...trades, t].sort((a,b) => new Date(a.date)-new Date(b.date));
    setTrades(updated);
    await saveTrade(t);
    if (!useCloud) await saveAll(updated);
    setForm(blank()); setView("journal");
  };

  const updateTrade = async () => {
    const updated = trades.map(t => t.id === form.id ? form : t);
    setTrades(updated);
    await saveTrade(form);
    if (!useCloud) await saveAll(updated);
    setSelected(form); setView("detail");
  };

  const deleteTrade = async (id) => {
    const updated = trades.filter(t => t.id !== id);
    setTrades(updated);
    await removeTrade(id);
    if (!useCloud) await saveAll(updated);
    setSelected(null); setView("journal");
  };

  const handleFile = (e) => {
    const f = e.target.files[0]; if (!f) return;
    const rd = new FileReader();
    rd.onload = (ev) => setForm(p => ({...p, screenshot: ev.target.result}));
    rd.readAsDataURL(f);
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

  if (!loaded) return <div style={S.root}><div style={{color:"#555",margin:"auto",fontFamily:"monospace"}}>Loading…</div></div>;

  return (
    <div style={S.root}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700&family=Manrope:wght@400;500;600;700;800&family=Cormorant+Garamond:ital,wght@1,400;1,500;1,600&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-track { background: #0b0b13; }
        ::-webkit-scrollbar-thumb { background: #2a2a3a; border-radius: 2px; }
        input, textarea, select { outline: none; }
        input::placeholder, textarea::placeholder { color: #3a3a52; }
      `}</style>

      <div style={S.header}>
        <div style={{display:"flex",alignItems:"center",gap:10,position:"relative",minWidth:200}}>
          <div style={{
            width:30,height:30,border:`1px solid ${GOLD}`,transform:"rotate(45deg)",
            display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(201,168,64,0.05)"
          }}>
            <span style={{transform:"rotate(-45deg)",color:GOLD,fontFamily:"'Cormorant Garamond',serif",fontStyle:"italic",fontWeight:500,fontSize:16,lineHeight:1}}>M</span>
          </div>
          <div style={{display:"flex",flexDirection:"column",lineHeight:1}}>
            <span style={{fontFamily:"'Cormorant Garamond',serif",fontStyle:"italic",fontWeight:500,fontSize:16,color:"#e8e8f0"}}>Mahmudur</span>
            <span style={{fontFamily:"'Manrope',sans-serif",fontWeight:700,fontSize:8,color:GOLD,letterSpacing:3,textTransform:"uppercase",marginTop:2}}>Trade Note</span>
          </div>
          {!useCloud && <span style={{fontSize:9,color:R,fontFamily:"'JetBrains Mono',monospace",marginLeft:8,padding:"2px 6px",border:`1px solid ${R}55`,borderRadius:4}}>LOCAL</span>}
        </div>
        <div style={S.nav}>
          {[["dashboard","◆ Dashboard"],["journal","≡ Journal"],["add","+ New Trade"]].map(([v,l])=>(
            <button key={v} onClick={()=>{if(v==="add")setForm(blank());setView(v);}} style={{...S.navBtn,
              ...(view===v||((view==="detail"||view==="edit")&&v==="journal")?S.navBtnActive:{})}}>
              {l}
            </button>
          ))}
        </div>
        <div style={S.headerRight}>
          {metrics && <span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:13,color:pnlColor(metrics.totalPnl),fontWeight:700}}>
            {fmt$(metrics.totalPnl)}
          </span>}
          <button onClick={onLock} title="Lock session" style={{
            background:"transparent",border:"1px solid #252535",borderRadius:6,
            padding:"5px 10px",color:"#666",fontSize:10,cursor:"pointer",
            fontFamily:"'JetBrains Mono',monospace",letterSpacing:1
          }}>🔒 LOCK</button>
        </div>
      </div>

      <div style={S.body}>
        {view==="dashboard" && (
          <div style={S.page}>
            {!metrics ? (
              <div style={S.empty}>
                <div style={{fontSize:48,marginBottom:16}}>📊</div>
                <div style={{fontFamily:"'Manrope',sans-serif",fontWeight:700,fontSize:20,color:"#e8e8f0",marginBottom:8}}>No trades yet</div>
                <div style={{color:"#555",fontSize:13,marginBottom:24}}>Start logging your trades to see advanced analytics</div>
                <button style={S.primaryBtn} onClick={()=>{setForm(blank());setView("add");}}>Log First Trade</button>
              </div>
            ) : (
              <>
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

                <div style={S.chartsRow}>
                  <div style={{...S.card, flex:2}}>
                    <div style={S.cardHeader}>
                      <span style={S.cardTitle}>Equity Curve</span>
                      <span style={{fontSize:11,color:"#444",fontFamily:"'JetBrains Mono',monospace"}}>cumulative P&L</span>
                    </div>
                    <ResponsiveContainer width="100%" height={180}>
                      <LineChart data={metrics.equity} margin={{top:5,right:10,left:0,bottom:0}}>
                        <defs>
                          <linearGradient id="eqGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={G} stopOpacity={0.15}/>
                            <stop offset="95%" stopColor={G} stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1a1a28" vertical={false}/>
                        <XAxis dataKey="date" tick={{fill:"#3a3a55",fontSize:9,fontFamily:"'JetBrains Mono',monospace"}} tickLine={false} axisLine={false} interval="preserveStartEnd"/>
                        <YAxis tick={{fill:"#3a3a55",fontSize:9,fontFamily:"'JetBrains Mono',monospace"}} tickLine={false} axisLine={false} tickFormatter={v=>`$${v}`} width={52}/>
                        <ReferenceLine y={0} stroke="#2a2a3a" strokeDasharray="3 3"/>
                        <Tooltip contentStyle={{background:"#10101c",border:"1px solid #252535",borderRadius:6,fontFamily:"'JetBrains Mono',monospace",fontSize:11}} labelStyle={{color:"#888"}} formatter={(v)=>[`$${v.toFixed(2)}`,"Equity"]}/>
                        <Line type="monotone" dataKey="eq" stroke={G} strokeWidth={2} dot={false} activeDot={{r:4,fill:G,strokeWidth:0}}/>
                      </LineChart>
                    </ResponsiveContainer>
                  </div>

                  <div style={{...S.card, flex:1.5}}>
                    <div style={S.cardHeader}>
                      <span style={S.cardTitle}>Daily P&L</span>
                      <span style={{fontSize:11,color:"#444",fontFamily:"'JetBrains Mono',monospace"}}>last 30 days</span>
                    </div>
                    <ResponsiveContainer width="100%" height={180}>
                      <BarChart data={metrics.daily} margin={{top:5,right:5,left:0,bottom:0}}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1a1a28" vertical={false}/>
                        <XAxis dataKey="date" tick={{fill:"#3a3a55",fontSize:9,fontFamily:"'JetBrains Mono',monospace"}} tickLine={false} axisLine={false} interval="preserveStartEnd"/>
                        <YAxis tick={{fill:"#3a3a55",fontSize:9,fontFamily:"'JetBrains Mono',monospace"}} tickLine={false} axisLine={false} tickFormatter={v=>`$${v}`} width={52}/>
                        <ReferenceLine y={0} stroke="#2a2a3a"/>
                        <Tooltip contentStyle={{background:"#10101c",border:"1px solid #252535",borderRadius:6,fontFamily:"'JetBrains Mono',monospace",fontSize:11}} formatter={(v)=>[`$${v.toFixed(2)}`,"P&L"]}/>
                        <Bar dataKey="pnl" radius={[3,3,0,0]}>
                          {metrics.daily.map((d,i)=><Cell key={i} fill={d.pnl>=0?G:R} fillOpacity={0.85}/>)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div style={S.chartsRow}>
                  <div style={{...S.card,flex:1}}>
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
                        <div key={m.l} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"5px 0",borderBottom:"1px solid #161620"}}>
                          <span style={{fontSize:11,color:"#5a5a75",fontFamily:"'Manrope',sans-serif"}}>{m.l}</span>
                          <span style={{fontSize:12,color:m.c,fontFamily:"'JetBrains Mono',monospace",fontWeight:700}}>{m.v}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div style={{...S.card,flex:1.4}}>
                    <div style={S.cardHeader}><span style={S.cardTitle}>Top Symbols</span></div>
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={metrics.symbols} layout="vertical" margin={{top:0,right:10,left:10,bottom:0}}>
                        <XAxis type="number" tick={{fill:"#3a3a55",fontSize:9,fontFamily:"'JetBrains Mono',monospace"}} tickLine={false} axisLine={false} tickFormatter={v=>`$${v}`}/>
                        <YAxis type="category" dataKey="s" tick={{fill:"#aaa",fontSize:11,fontFamily:"'JetBrains Mono',monospace"}} tickLine={false} axisLine={false} width={55}/>
                        <ReferenceLine x={0} stroke="#2a2a3a"/>
                        <Tooltip contentStyle={{background:"#10101c",border:"1px solid #252535",borderRadius:6,fontFamily:"'JetBrains Mono',monospace",fontSize:11}} formatter={(v,n,p)=>[`$${v.toFixed(2)}`,p.payload.s]}/>
                        <Bar dataKey="pnl" radius={[0,3,3,0]}>
                          {metrics.symbols.map((d,i)=><Cell key={i} fill={d.pnl>=0?G:R} fillOpacity={0.85}/>)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  <div style={{...S.card,flex:1.2}}>
                    <div style={S.cardHeader}><span style={S.cardTitle}>Setup Performance</span></div>
                    <div style={{overflowY:"auto",maxHeight:210,marginTop:4}}>
                      {metrics.setupPerf.map(s=>(
                        <div key={s.s} style={{padding:"6px 0",borderBottom:"1px solid #161620"}}>
                          <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
                            <span style={{fontSize:11,color:"#ccc",fontFamily:"'Manrope',sans-serif",fontWeight:600}}>{s.s}</span>
                            <span style={{fontSize:11,color:pnlColor(s.pnl),fontFamily:"'JetBrains Mono',monospace",fontWeight:700}}>{fmt$(s.pnl)}</span>
                          </div>
                          <div style={{display:"flex",gap:12}}>
                            <span style={{fontSize:10,color:"#555",fontFamily:"'JetBrains Mono',monospace"}}>{s.n} trades</span>
                            <span style={{fontSize:10,color:parseFloat(s.wr)>=50?G:R,fontFamily:"'JetBrains Mono',monospace"}}>{s.wr}% WR</span>
                          </div>
                          <div style={{marginTop:4,height:2,background:"#1a1a28",borderRadius:1}}>
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
              <span style={{marginLeft:"auto",fontSize:11,color:"#444",fontFamily:"'JetBrains Mono',monospace"}}>{filtered.length} trade{filtered.length!==1?"s":""}</span>
            </div>

            {filtered.length===0 ? (
              <div style={S.empty}>
                <div style={{fontSize:36,marginBottom:12}}>📂</div>
                <div style={{color:"#555",fontSize:13}}>No trades match your filters</div>
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
                        <tr key={t.id} style={S.tr} onClick={()=>{setSelected(t);setView("detail");}} onMouseEnter={e=>e.currentTarget.style.background="#141420"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                          <td style={{...S.td,...S.tdMono}}>{t.date}</td>
                          <td style={{...S.td,fontFamily:"'JetBrains Mono',monospace",fontWeight:700,color:"#e8e8f0"}}>{t.symbol}</td>
                          <td style={{...S.td}}><span style={{...S.dirBadge,background:t.direction==="Long"?"rgba(0,229,160,0.1)":"rgba(255,69,96,0.1)",color:t.direction==="Long"?G:R}}>{t.direction}</span></td>
                          <td style={{...S.td,color:"#666",fontSize:11}}>{t.setup}</td>
                          <td style={{...S.td,...S.tdMono}}>{t.entry?`$${parseFloat(t.entry).toFixed(2)}`:"-"}</td>
                          <td style={{...S.td,...S.tdMono}}>{t.exit?`$${parseFloat(t.exit).toFixed(2)}`:"-"}</td>
                          <td style={{...S.td,...S.tdMono}}>{t.size||"-"}</td>
                          <td style={{...S.td,...S.tdMono,color:pnlColor(p),fontWeight:700}}>{fmt$(p)}</td>
                          <td style={{...S.td,...S.tdMono,color:t.rMultiple?pnlColor(parseFloat(t.rMultiple)):"#444"}}>{t.rMultiple?fmtN(t.rMultiple)+"R":"-"}</td>
                          <td style={{...S.td}}><span style={{...S.gradeBadge,...gradeStyle(t.grade)}}>{t.grade}</span></td>
                          <td style={{...S.td,fontSize:11,color:"#555"}}>{t.emotion}</td>
                          <td style={{...S.td,textAlign:"right"}}>
                            {t.screenshot && <span style={{fontSize:10,color:GOLD}}>📷</span>}
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
            <div style={{fontFamily:"'Manrope',sans-serif",fontWeight:800,fontSize:20,color:"#e8e8f0",marginBottom:24,letterSpacing:-0.5}}>
              {view==="edit"?"Edit Trade":"Log New Trade"}
            </div>
            <div style={S.formGrid}>
              <Field label="Date"><input type="date" style={S.input} value={form.date} onChange={e=>setForm(p=>({...p,date:e.target.value}))}/></Field>
              <Field label="Time (optional)"><input type="time" style={S.input} value={form.time} onChange={e=>setForm(p=>({...p,time:e.target.value}))}/></Field>
              <Field label="Symbol *"><input placeholder="AAPL, BTC, SPY…" style={S.input} value={form.symbol} onChange={e=>setForm(p=>({...p,symbol:e.target.value.toUpperCase()}))}/></Field>
              <Field label="Direction">
                <div style={{display:"flex",gap:8}}>
                  {["Long","Short"].map(d=>(
                    <button key={d} onClick={()=>setForm(p=>({...p,direction:d}))} style={{...S.toggleBtn,flex:1,
                      background:form.direction===d?(d==="Long"?"rgba(0,229,160,0.15)":"rgba(255,69,96,0.15)"):"transparent",
                      color:form.direction===d?(d==="Long"?G:R):"#555",
                      borderColor:form.direction===d?(d==="Long"?G:R):"#252535"}}>{d}</button>
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
                      color:form.grade===g?GOLD:"#555",borderColor:form.grade===g?GOLD:"#252535"}}>{g}</button>
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
                <Field label="Screenshot (chart setup / result)">
                  <div style={{display:"flex",gap:12,alignItems:"flex-start"}}>
                    <input ref={fileRef} type="file" accept="image/*" style={{display:"none"}} onChange={handleFile}/>
                    <button style={{...S.uploadBtn}} onClick={()=>fileRef.current.click()}>
                      {form.screenshot?"🔄 Replace Screenshot":"📷 Upload Screenshot"}
                    </button>
                    {form.screenshot && (
                      <div style={{position:"relative"}}>
                        <img src={form.screenshot} alt="trade" style={{height:80,borderRadius:6,border:"1px solid #252535",cursor:"pointer"}} onClick={()=>fileRef.current.click()}/>
                        <button onClick={()=>setForm(p=>({...p,screenshot:null}))} style={{position:"absolute",top:-6,right:-6,background:"#ff4560",border:"none",borderRadius:"50%",width:18,height:18,color:"#fff",fontSize:11,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>×</button>
                      </div>
                    )}
                  </div>
                </Field>
              </div>
            </div>

            <div style={{display:"flex",gap:10,marginTop:24}}>
              <button style={S.primaryBtn} onClick={view==="edit"?updateTrade:addTrade}>
                {view==="edit"?"Update Trade":"Save Trade"}
              </button>
              <button style={S.ghostBtn} onClick={()=>{if(view==="edit"){setView("detail");}else{setView("journal");}}}>Cancel</button>
            </div>
          </div>
        )}

        {view==="detail" && selected && (
          <div style={S.page}>
            <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:24}}>
              <button style={S.backBtn} onClick={()=>setView("journal")}>← Back</button>
              <div style={{fontFamily:"'JetBrains Mono',monospace",fontWeight:700,fontSize:22,color:"#e8e8f0"}}>{selected.symbol}</div>
              <span style={{...S.dirBadge,background:selected.direction==="Long"?"rgba(0,229,160,0.1)":"rgba(255,69,96,0.1)",color:selected.direction==="Long"?G:R,fontSize:12,padding:"4px 10px"}}>{selected.direction}</span>
              <span style={{marginLeft:"auto",fontFamily:"'JetBrains Mono',monospace",fontWeight:700,fontSize:22,color:pnlColor(selected.pnl)}}>{fmt$(selected.pnl)}</span>
            </div>

            <div style={{display:"flex",gap:16,flexWrap:"wrap"}}>
              <div style={{...S.card,flex:1,minWidth:280}}>
                <div style={S.cardHeader}><span style={S.cardTitle}>Trade Details</span>
                  <div style={{display:"flex",gap:6}}>
                    <button style={{...S.ghostBtn,padding:"4px 10px",fontSize:11}} onClick={()=>{setForm({...selected});setView("edit");}}>Edit</button>
                    <button style={{...S.ghostBtn,padding:"4px 10px",fontSize:11,color:R,borderColor:R}} onClick={()=>deleteTrade(selected.id)}>Delete</button>
                  </div>
                </div>
                <div style={{display:"flex",flexDirection:"column",gap:8}}>
                  {[
                    {l:"Date",v:`${selected.date}${selected.time?" "+selected.time:""}`},
                    {l:"Entry",v:selected.entry?`$${parseFloat(selected.entry).toFixed(4)}`:"-"},
                    {l:"Exit",v:selected.exit?`$${parseFloat(selected.exit).toFixed(4)}`:"-"},
                    {l:"Size",v:selected.size||"-"},
                    {l:"P&L",v:fmt$(selected.pnl),c:pnlColor(selected.pnl)},
                    {l:"R-Multiple",v:selected.rMultiple?fmtN(selected.rMultiple)+"R":"-",c:selected.rMultiple?pnlColor(parseFloat(selected.rMultiple)):"#444"},
                    {l:"Setup",v:selected.setup||"-"},
                    {l:"Grade",v:selected.grade,c:GOLD},
                    {l:"Emotion",v:selected.emotion||"-"},
                  ].map(m=>(
                    <div key={m.l} style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:"1px solid #161620"}}>
                      <span style={{fontSize:12,color:"#5a5a75",fontFamily:"'Manrope',sans-serif"}}>{m.l}</span>
                      <span style={{fontSize:12,color:m.c||"#c8c8dc",fontFamily:"'JetBrains Mono',monospace",fontWeight:600}}>{m.v}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{flex:1.5,minWidth:280,display:"flex",flexDirection:"column",gap:16}}>
                {selected.notes && (
                  <div style={S.card}>
                    <div style={S.cardHeader}><span style={S.cardTitle}>Notes</span></div>
                    <p style={{fontSize:13,color:"#8888a8",lineHeight:1.7,fontFamily:"'Manrope',sans-serif",whiteSpace:"pre-wrap"}}>{selected.notes}</p>
                  </div>
                )}
                {selected.screenshot && (
                  <div style={S.card}>
                    <div style={S.cardHeader}><span style={S.cardTitle}>Chart Screenshot</span></div>
                    <img src={selected.screenshot} alt="chart" style={{width:"100%",borderRadius:6,border:"1px solid #1e1e2e",marginTop:4}}/>
                  </div>
                )}
                {!selected.notes && !selected.screenshot && (
                  <div style={{...S.card,color:"#333",fontSize:13,fontFamily:"'Manrope',sans-serif"}}>No notes or screenshot attached.</div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Field({label, children}) {
  return (
    <div>
      <label style={{display:"block",fontSize:10,color:"#4a4a65",fontFamily:"'JetBrains Mono',monospace",letterSpacing:0.8,textTransform:"uppercase",marginBottom:6}}>{label}</label>
      {children}
    </div>
  );
}

function gradeStyle(g) {
  const map = {"A+":GOLD,"A":"#aaa","B":"#888","C":"#666","D":R};
  return {color:map[g]||"#666", borderColor:(map[g]||"#444")+"55", background:(map[g]||"#444")+"11"};
}

const styles = {
  root:{display:"flex",flexDirection:"column",height:"100vh",background:"#080810",color:"#e8e8f0",fontFamily:"'Manrope',sans-serif",overflow:"hidden"},
  header:{display:"flex",alignItems:"center",gap:24,padding:"0 24px",height:52,background:"#0b0b13",borderBottom:"1px solid #151520",flexShrink:0},
  logo:{display:"flex",alignItems:"center",gap:8},
  nav:{display:"flex",gap:4},
  navBtn:{background:"none",border:"none",color:"#4a4a65",fontSize:12,fontFamily:"'Manrope',sans-serif",fontWeight:600,padding:"6px 14px",borderRadius:6,cursor:"pointer",letterSpacing:0.3},
  navBtnActive:{color:"#e8e8f0",background:"#14141e"},
  headerRight:{marginLeft:"auto",display:"flex",alignItems:"center",gap:16},
  body:{flex:1,overflowY:"auto",padding:24},
  page:{maxWidth:1300,margin:"0 auto"},
  kpiRow:{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:16},
  kpiCard:{background:"#0f0f1a",border:"1px solid #1a1a28",borderRadius:10,padding:"16px 20px"},
  kpiLabel:{fontSize:10,color:"#3a3a55",letterSpacing:1,textTransform:"uppercase",fontFamily:"'JetBrains Mono',monospace",marginBottom:6},
  kpiValue:{fontSize:26,fontFamily:"'JetBrains Mono',monospace",fontWeight:700,lineHeight:1,marginBottom:4},
  kpiSub:{fontSize:10,color:"#3a3a55",fontFamily:"'JetBrains Mono',monospace"},
  chartsRow:{display:"flex",gap:12,marginBottom:16},
  card:{background:"#0f0f1a",border:"1px solid #1a1a28",borderRadius:10,padding:16},
  cardHeader:{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12},
  cardTitle:{fontSize:12,fontWeight:700,color:"#8888aa",letterSpacing:0.5,textTransform:"uppercase",fontFamily:"'JetBrains Mono',monospace"},
  empty:{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"80px 0",color:"#888"},
  filterRow:{display:"flex",gap:8,alignItems:"center",marginBottom:12,flexWrap:"wrap"},
  filterInput:{background:"#0f0f1a",border:"1px solid #1e1e2e",borderRadius:6,padding:"7px 12px",color:"#ccc",fontSize:12,fontFamily:"'JetBrains Mono',monospace",width:130},
  filterSelect:{background:"#0f0f1a",border:"1px solid #1e1e2e",borderRadius:6,padding:"7px 12px",color:"#ccc",fontSize:12,fontFamily:"'JetBrains Mono',monospace"},
  tableWrap:{overflowX:"auto",borderRadius:10,border:"1px solid #1a1a28"},
  table:{width:"100%",borderCollapse:"collapse",background:"#0f0f1a"},
  th:{textAlign:"left",padding:"10px 14px",fontSize:9,color:"#3a3a55",letterSpacing:1,textTransform:"uppercase",fontFamily:"'JetBrains Mono',monospace",borderBottom:"1px solid #1a1a28",background:"#0b0b13",whiteSpace:"nowrap"},
  tr:{borderBottom:"1px solid #111118",cursor:"pointer",transition:"background 0.15s"},
  td:{padding:"11px 14px",fontSize:12},
  tdMono:{fontFamily:"'JetBrains Mono',monospace"},
  dirBadge:{display:"inline-block",fontSize:10,fontWeight:700,fontFamily:"'JetBrains Mono',monospace",padding:"2px 7px",borderRadius:4,letterSpacing:0.5},
  gradeBadge:{display:"inline-block",fontSize:10,fontWeight:700,fontFamily:"'JetBrains Mono',monospace",padding:"2px 7px",borderRadius:4,border:"1px solid"},
  formGrid:{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:14},
  input:{width:"100%",background:"#0b0b13",border:"1px solid #1e1e2e",borderRadius:6,padding:"9px 12px",color:"#e8e8f0",fontSize:12,fontFamily:"'JetBrains Mono',monospace"},
  toggleBtn:{background:"transparent",border:"1px solid #252535",borderRadius:6,padding:"9px 10px",color:"#555",fontSize:12,fontFamily:"'Manrope',sans-serif",fontWeight:600,cursor:"pointer",transition:"all 0.15s"},
  primaryBtn:{background:GOLD,border:"none",borderRadius:7,padding:"10px 24px",color:"#0a0a0a",fontSize:13,fontWeight:700,fontFamily:"'Manrope',sans-serif",cursor:"pointer",letterSpacing:0.3},
  ghostBtn:{background:"transparent",border:"1px solid #252535",borderRadius:7,padding:"10px 20px",color:"#777",fontSize:13,fontFamily:"'Manrope',sans-serif",cursor:"pointer",fontWeight:600},
  uploadBtn:{background:"transparent",border:"1px dashed #252535",borderRadius:7,padding:"10px 18px",color:"#666",fontSize:12,fontFamily:"'Manrope',sans-serif",cursor:"pointer"},
  backBtn:{background:"none",border:"none",color:"#555",fontSize:12,fontFamily:"'Manrope',sans-serif",fontWeight:600,cursor:"pointer",padding:0},
};
