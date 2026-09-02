/* 現行アーティファクト「締め台帳」の状態定義と計算部を、そのまま切り出したオラクル。
   S を引数で受け取る形にしただけで、中身は元コードと同一。テスト専用。 */
/* eslint-disable */
export function createLegacy(S){
const uid = () => Math.random().toString(36).slice(2,9);
const todayISO = () => { const d=new Date(); d.setMinutes(d.getMinutes()-d.getTimezoneOffset()); return d.toISOString().slice(0,10); };

function defaultBacks(){
  return [
    {id:"d1", name:"ドリンク S", type:"count",  rate:500,  rateD:500},
    {id:"d2", name:"ドリンク M", type:"count",  rate:700,  rateD:700},
    {id:"d3", name:"ドリンク L", type:"count",  rate:1000, rateD:1000},
    {id:"b2", name:"指名バック",             type:"count",  rate:1000, rateD:1000},
    {id:"b3", name:"同伴バック",             type:"count",  rate:2000, rateD:2000},
    {id:"b4", name:"ボトルバック",           type:"amount", rate:20,   rateD:20}
  ];
}
function defaultState(){
  const t = todayISO();
  return {
    v:2,
    shop:{ name:"", cardFeeRate:5, openingCash:0, openingDate:t.slice(0,8)+"01",
           defaultWage:1800, roundMinutes:15, fixedLabor:0, fixedCost:0,
           dispatchGuarantee:15000, openTime:"20:00", closeTime:"01:00" },
    backItems:defaultBacks(),
    casts:[],
    days:{}
  };
}
function migrate(o){
  const d = defaultState();
  if(!o || typeof o!=="object") return d;
  const days = (o.days&&typeof o.days==="object")?o.days:{};
  Object.keys(days).forEach(k=>{ if(!Array.isArray(days[k].dispatch)) days[k].dispatch=[]; if(!Array.isArray(days[k].settle)) days[k].settle=[]; });
  let items = Array.isArray(o.backItems)&&o.backItems.length ? o.backItems : d.backItems;
  const wasV1Default = items.length===4 && items[0] && items[0].id==="b1" && items[0].name==="ドリンクバック";
  if(wasV1Default && Object.keys(days).length===0) items = defaultBacks();
  const renameMap = {d1:["ドリンク（レギュラー）","ドリンク S"], d2:["ドリンク（ロング）","ドリンク M"], d3:["ドリンク（シャンパン）","ドリンク L"]};
  items = items.map(b=>{
    const o = Object.assign({}, b);
    if(o.rateD==null) o.rateD = o.rate;
    const r = renameMap[o.id];
    if(r && o.name===r[0]) o.name = r[1];
    return o;
  });
  return {
    v:2,
    shop:Object.assign({}, d.shop, o.shop||{}),
    backItems:items,
    casts:Array.isArray(o.casts)?o.casts:[],
    days:days
  };
}
const n = v => { const x = typeof v==="number"?v:parseFloat(String(v==null?"":v).replace(/[^0-9.\-]/g,"")); return isFinite(x)?x:0; };
const yen = v => { const r=Math.round(v); return (r<0?"−¥":"¥") + Math.abs(r).toLocaleString("ja-JP"); };
const yenShort = v => {
  const a=Math.abs(v);
  if(a>=10000) return (v<0?"-":"")+ (Math.abs(v)/10000).toFixed(Math.abs(v)>=100000?0:1).replace(/\.0$/,"") + "万";
  return Math.round(v).toLocaleString("ja-JP");
};
const jp = v => Math.round(v).toLocaleString("ja-JP");
const pct = (a,b) => b>0 ? (a/b*100) : 0;

function minutesOf(t){ if(!t||!/^\d{1,2}:\d{2}$/.test(t)) return null; const [h,m]=t.split(":").map(Number); return h*60+m; }
function shiftMinutes(sh){
  const a=minutesOf(sh.in), b=minutesOf(sh.out);
  if(a==null||b==null) return 0;
  let d = b-a; if(d<0) d+=1440;
  d -= n(sh.breakMin);
  if(d<0) d=0;
  const r = Math.max(1, n(S.shop.roundMinutes)||1);
  return Math.floor(d/r)*r;
}
function castWage(c){ return c && c.wage!=null && c.wage!=="" ? n(c.wage) : n(S.shop.defaultWage); }
function castById(id){ return S.casts.find(c=>c.id===id) || null; }

function backRate(b, isDispatch){ return isDispatch ? n(b.rateD==null?b.rate:b.rateD) : n(b.rate); }
function calcBacks(src, isDispatch){
  const backs={}; let total=0;
  S.backItems.forEach(b=>{
    const q = n((src||{})[b.id]);
    const r = backRate(b, isDispatch);
    const amt = b.type==="amount" ? Math.floor(q*r/100) : Math.floor(q*r);
    backs[b.id] = {qty:q, amount:amt}; total += amt;
  });
  return {backs, total};
}
/** 在籍キャスト 1人1日の給料内訳 */
function payOf(castId, sh){
  const c = castById(castId);
  const mins = shiftMinutes(sh);
  const wage = Math.floor(mins/60 * castWage(c));
  const {backs, total} = calcBacks(sh.backs, false);
  const deduct = n(sh.deduct);
  const gross = wage + total - deduct;
  return { mins, hours:mins/60, wage, backs, backTotal:total, deduct, gross, paid:n(sh.paid), unpaid:gross-n(sh.paid) };
}
/** 派遣 1人1日：日給（保証額）＋ 派遣単価のバック */
function dispatchPay(row){
  const mins = shiftMinutes(row);
  const guarantee = row.guarantee==="" || row.guarantee==null ? n(S.shop.dispatchGuarantee) : n(row.guarantee);
  const {backs, total} = calcBacks(row.backs, true);
  const deduct = n(row.deduct);
  const gross = guarantee + total - deduct;
  return { mins, hours:mins/60, guarantee, backs, backTotal:total, deduct, gross, paid:n(row.paid), unpaid:gross-n(row.paid) };
}

function dayKeys(){ return Object.keys(S.days).sort(); }
function monthKeys(m){ return dayKeys().filter(d=>d.startsWith(m)); }

/** 1日の集計 */
function dayTotals(dateKey){
  const d = S.days[dateKey];
  const z = {date:dateKey, cash:0, card:0, sales:0, guests:0, expCash:0, expCard:0, expBank:0, exp:0,
             bankDeposit:0, cardReceived:0, cashCounted:null, labor:0, laborR:0, laborD:0,
             paidCash:0, paidDetail:0, paidLump:0, paidCount:0, settled:0, unpaid:0, workers:0, workersR:0, workersD:0, hours:0, fee:0, profit:0};
  if(!d) return z;
  z.cash=n(d.cashSales); z.card=n(d.cardSales); z.sales=z.cash+z.card; z.guests=n(d.guests);
  (d.expenses||[]).forEach(e=>{
    const a=n(e.amount); z.exp+=a;
    if(e.method==="card") z.expCard+=a; else if(e.method==="bank") z.expBank+=a; else z.expCash+=a;
  });
  z.bankDeposit=n(d.bankDeposit); z.cardReceived=n(d.cardReceived);
  z.cashCounted = (d.cashCounted===""||d.cashCounted==null)?null:n(d.cashCounted);
  Object.keys(d.shifts||{}).forEach(cid=>{
    const sh=d.shifts[cid]; if(!sh||!sh.on) return;
    const p=payOf(cid,sh);
    z.laborR+=p.gross; z.paidDetail+=p.paid; if(p.paid>0) z.paidCount++; z.unpaid+=p.unpaid; z.workersR++; z.hours+=p.hours;
  });
  (d.dispatch||[]).forEach(row=>{
    const p=dispatchPay(row);
    z.laborD+=p.gross; z.paidDetail+=p.paid; if(p.paid>0) z.paidCount++; z.unpaid+=p.unpaid; z.workersD++; z.hours+=p.hours;
  });
  z.paidLump = n(d.payout);
  (d.settle||[]).forEach(x=>{ z.settled += n(x.amount); });
  z.paidCash = z.paidDetail + z.paidLump + z.settled;
  z.labor = z.laborR + z.laborD + z.paidLump;
  z.workers = z.workersR + z.workersD;
  z.fee = z.card * n(S.shop.cardFeeRate)/100;
  z.profit = z.sales - z.labor - z.exp - z.fee;
  return z;
}

/** 月の集計 */
function monthTotals(m){
  const keys = monthKeys(m);
  const acc = {days:keys.length, cash:0, card:0, sales:0, guests:0, exp:0, expCash:0, labor:0, laborR:0, laborD:0,
               paidCash:0, paidDetail:0, paidLump:0, unpaid:0, fee:0, bankDeposit:0, cardReceived:0, hours:0, workers:0, series:[]};
  keys.forEach(k=>{
    const t=dayTotals(k);
    ["cash","card","sales","guests","exp","expCash","labor","laborR","laborD","paidCash","paidDetail","paidLump","settled","unpaid","fee","bankDeposit","cardReceived","hours"].forEach(f=>acc[f]+=t[f]);
    acc.workers+=t.workers;
    acc.series.push(t);
  });
  acc.settledFor = settlementsFor(m);
  acc.unpaid -= acc.settledFor;
  acc.fixedLabor = n(S.shop.fixedLabor);
  acc.fixedCost  = n(S.shop.fixedCost);
  acc.laborAll = acc.labor + acc.fixedLabor;
  acc.costAll  = acc.exp + acc.fixedCost + acc.fee;
  acc.profit   = acc.sales - acc.laborAll - acc.costAll;
  acc.avgSpend = acc.guests>0 ? acc.sales/acc.guests : 0;
  return acc;
}

/** 精算（未払い給料の支払い）: who = "c:<castId>" | "d:<派遣名>" , forMonth = "YYYY-MM" */
function settlementsFor(m, who){
  let s=0;
  dayKeys().forEach(k=>{ (S.days[k].settle||[]).forEach(x=>{ if(x.forMonth===m && (!who || x.who===who)) s+=n(x.amount); }); });
  return s;
}
function settleRowsFor(m, who){
  const out=[];
  dayKeys().forEach(k=>{ (S.days[k].settle||[]).forEach(x=>{ if(x.forMonth===m && x.who===who) out.push(Object.assign({date:k}, x)); }); });
  return out;
}
function whoLabel(who){
  if(!who) return "";
  if(who.slice(0,2)==="c:"){ const c=castById(who.slice(2)); return c ? (c.name||"（名前なし）") : "（削除済み）"; }
  return who.slice(2)+"（派遣）";
}
function dispatchNames(){
  const set=new Set();
  dayKeys().forEach(k=>(S.days[k].dispatch||[]).forEach(r=>{ const nm=(r.name||"").trim(); if(nm) set.add(nm); }));
  return [...set].sort((a,b)=>a.localeCompare(b,"ja"));
}
function unpaidFor(who, m){
  if(!who || !m) return 0;
  if(who.slice(0,2)==="c:"){ const r=castMonth(m).find(r=>r.cast.id===who.slice(2)); return r?r.unpaid:0; }
  const r=dispatchMonth(m).find(r=>r.name===who.slice(2)); return r?r.unpaid:0;
}
/** その月ぶんの未払いが残っている人 */
function owedList(m){
  const list = [
    ...castMonth(m).map(r=>({who:"c:"+r.cast.id, name:r.cast.name||"（名前なし）", unpaid:r.unpaid})),
    ...dispatchMonth(m).map(r=>({who:"d:"+r.name, name:r.name+"（派遣）", unpaid:r.unpaid}))
  ];
  return list.filter(x=>x.unpaid>0);
}

/** 全期間の現金・カード残 */
function balances(){
  const start = S.shop.openingDate || "0000-00-00";
  let cash = n(S.shop.openingCash), cardOut = 0, lastCount=null, lastCountDate=null;
  dayKeys().filter(k=>k>=start).forEach(k=>{
    const t = dayTotals(k);
    cash += t.cash - t.expCash - t.paidCash - t.bankDeposit;
    cardOut += t.card - t.card*n(S.shop.cardFeeRate)/100 - t.cardReceived;
    if(t.cashCounted!=null){ lastCount=t.cashCounted; lastCountDate=k; }
  });
  return {cash, cardOut, lastCount, lastCountDate};
}

/** 派遣 月集計（名前ごと） */
function dispatchMonth(m){
  const map = {};
  monthKeys(m).forEach(k=>{
    (S.days[k].dispatch||[]).forEach(row=>{
      const name = (row.name||"").trim() || "（名前なし）";
      if(!map[name]) map[name]={name, days:0, hours:0, guarantee:0, backTotal:0, backs:{}, deduct:0, gross:0, paid:0, settled:0, unpaid:0};
      const p = dispatchPay(row), r = map[name];
      r.days++; r.hours+=p.hours; r.guarantee+=p.guarantee; r.backTotal+=p.backTotal;
      r.deduct+=p.deduct; r.gross+=p.gross; r.paid+=p.paid; r.unpaid+=p.unpaid;
      S.backItems.forEach(b=>{ r.backs[b.id]=(r.backs[b.id]||0)+p.backs[b.id].amount; });
    });
  });
  dayKeys().forEach(k=>{
    (S.days[k].settle||[]).forEach(x=>{
      if(x.forMonth!==m || !x.who || x.who.slice(0,2)!=="d:") return;
      const name=x.who.slice(2);
      if(!map[name]) map[name]={name, days:0, hours:0, guarantee:0, backTotal:0, backs:{}, deduct:0, gross:0, paid:0, settled:0, unpaid:0};
      map[name].settled+=n(x.amount); map[name].unpaid-=n(x.amount);
    });
  });
  return Object.values(map).sort((a,b)=>b.gross-a.gross);
}

/** キャスト別 月集計 */
function castMonth(m){
  const map = {};
  S.casts.forEach(c=> map[c.id]={cast:c, hours:0, wage:0, backTotal:0, backs:{}, deduct:0, gross:0, paid:0, settled:0, unpaid:0, days:0});
  monthKeys(m).forEach(k=>{
    const d=S.days[k]; if(!d||!d.shifts) return;
    Object.keys(d.shifts).forEach(cid=>{
      const sh=d.shifts[cid]; if(!sh||!sh.on) return;
      if(!map[cid]) map[cid]={cast:{id:cid,name:"（削除済み）"},hours:0,wage:0,backTotal:0,backs:{},deduct:0,gross:0,paid:0,settled:0,unpaid:0,days:0};
      const p=payOf(cid,sh), r=map[cid];
      r.hours+=p.hours; r.wage+=p.wage; r.backTotal+=p.backTotal; r.deduct+=p.deduct;
      r.gross+=p.gross; r.paid+=p.paid; r.unpaid+=p.unpaid; r.days++;
      S.backItems.forEach(b=>{ r.backs[b.id]=(r.backs[b.id]||0)+p.backs[b.id].amount; });
    });
  });
  Object.keys(map).forEach(cid=>{ const s=settlementsFor(m,"c:"+cid); map[cid].settled=s; map[cid].unpaid-=s; });
  return Object.values(map).filter(r=>r.days>0 || r.settled>0).sort((a,b)=>b.gross-a.gross);
}
  return { uid, todayISO, defaultBacks, defaultState, migrate, n, yen, jp, pct, minutesOf, shiftMinutes, castWage, castById, backRate, calcBacks, payOf, dispatchPay, dayKeys, monthKeys, dayTotals, monthTotals, settlementsFor, settleRowsFor, whoLabel, dispatchNames, unpaidFor, owedList, balances, dispatchMonth, castMonth };
}
