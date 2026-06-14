"use client";

import { useState, useEffect, useRef, Component } from "react";
import { supabase } from "../lib/supabase";

// ═══════════════════════════════════════════════════════════════════════════════
// QUANTAFLOW — Standalone Construction Estimating Platform
// Takeoff · Estimating · Quoting · Job Costing · Variations · Claims · Xero
// ═══════════════════════════════════════════════════════════════════════════════

// Collision-proof IDs (Date.now() collides when many items are created in one tick)
// Sandbox-safe dialogs: window.prompt/confirm throw in some deploy sandboxes
// (Turbopack/Vercel). These wrappers degrade gracefully instead of crashing.
function safeConfirm(msg){ try{ return window.confirm(msg); }catch{ return true; } }
function safePrompt(msg, def=""){ try{ const v=window.prompt(msg, def); return v===null?null:v; }catch{ return def||null; } }

const uid = () => (typeof window!=="undefined" && window.crypto?.randomUUID ? crypto.randomUUID() : `id-${Date.now()}-${Math.random().toString(36).slice(2,10)}`);

function useLS(key, init) {
  const [s, setS] = useState(() => {
    if (typeof window === "undefined") return typeof init === "function" ? init() : init; // SSR guard
    try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : (typeof init === "function" ? init() : init); }
    catch { return typeof init === "function" ? init() : init; }
  });
  useEffect(() => {
    try { localStorage.setItem(key, JSON.stringify(s)); }
    catch (e) {
      // Quota exceeded or storage unavailable — surface it instead of silently losing data
      window.dispatchEvent(new CustomEvent("qf-storage-error", {detail:String(e?.name||e)}));
    }
  }, [key, s]);
  // Cross-tab sync: a second tab editing the same data no longer silently clobbers this one
  useEffect(() => {
    const h = e => {
      if (e.key === key && e.newValue != null) {
        try { setS(JSON.parse(e.newValue)); } catch {}
      }
    };
    window.addEventListener("storage", h);
    return () => window.removeEventListener("storage", h);
  }, [key]);
  return [s, setS];
}

const T = {
  bg:"#07090c", panel:"#0d1117", card:"#111820", card2:"#161f2a",
  border:"#1c2838", borderHi:"#263548",
  accent:"#f59e0b", accentDim:"rgba(245,158,11,0.1)", accentBrd:"rgba(245,158,11,0.28)",
  green:"#22c55e", greenDim:"rgba(34,197,94,0.1)",
  blue:"#3b82f6", blueDim:"rgba(59,130,246,0.1)",
  red:"#ef4444", redDim:"rgba(239,68,68,0.1)",
  yellow:"#eab308", yellowDim:"rgba(234,179,8,0.1)",
  purple:"#8b5cf6", purpleDim:"rgba(139,92,246,0.1)",
  teal:"#14b8a6", tealDim:"rgba(20,184,166,0.1)",
  text:"#dde6f0", muted:"#63748a", faint:"#283444",
  font:"system-ui,'Segoe UI',Helvetica,sans-serif",
  mono:"'JetBrains Mono','Courier New',monospace",
};

// ── DATA SCHEMA ──────────────────────────────────────────────────────────────
const mkProject = (o={}) => ({
  id:Date.now(), name:"", client:"", clientId:null, address:"",
  status:"draft", created:new Date().toISOString().slice(0,10), dueDate:"",
  description:"", notes:"",
  trades:[], // selected trade scopes — empty means all trades
  drawings:[], takeoffLayers:[], takeoffItems:[], aiSummary:null,
  lineItems:[], overhead:12, margin:20, gst:15,
  invoiced:0, paid:0, xeroRef:"",
  actualCosts:[], variations:[], claims:[],
  ...o
});

const normalizeProject = (p={}) => ({
  ...p,
  client: p.client_name ?? p.client ?? "",
  created: p.created ?? new Date().toISOString().slice(0,10),
});

const SEED_CLIENTS = [
  {id:1,name:"Marcus Henderson",company:"Henderson Family Trust",email:"marcus@hft.co.nz",phone:"021 555 1234",address:"14 Rimu Rd, Henderson, Auckland",abn:"",notes:""},
  {id:2,name:"Cody Robb",company:"Jade 85 Pty Ltd",email:"cody@jade85.com.au",phone:"07 123 4567",address:"85 Swann Rd, Taringa QLD 4068",abn:"ACN 123 456 789",notes:"Residential developer"},
  {id:3,name:"R. & S. Patel",company:"",email:"patel@gmail.com",phone:"021 888 9999",address:"7 Balmoral Rd, Mt Eden, Auckland",abn:"",notes:""},
];

const SEED_PROJECTS = [
  mkProject({id:1,name:"Henderson Residence Extension",client:"Marcus Henderson",clientId:1,
    address:"14 Rimu Rd, Henderson, Auckland",status:"quoting",created:"2025-05-10",
    takeoffLayers:[
      {id:101,name:"Floor Areas",color:"#f59e0b",visible:true},
      {id:102,name:"Wall Lengths",color:"#3b82f6",visible:true},
      {id:103,name:"Roof",color:"#22c55e",visible:true},
    ],
    takeoffItems:[
      {id:201,layerId:101,type:"area",label:"Ground Floor Slab",qty:148,unit:"m²",source:"manual"},
      {id:202,layerId:102,type:"length",label:"External Wall Perimeter",qty:94,unit:"lm",source:"manual"},
      {id:203,layerId:103,type:"area",label:"Roof Area",qty:162,unit:"m²",source:"manual"},
      {id:204,layerId:101,type:"count",label:"Windows",qty:8,unit:"ea",source:"manual"},
      {id:205,layerId:101,type:"count",label:"Doors",qty:6,unit:"ea",source:"manual"},
    ],
    lineItems:[
      {id:301,category:"Foundations",description:"Concrete slab 148m²",qty:148,unit:"m²",rate:185,margin:20,source:"takeoff"},
      {id:302,category:"Framing",description:"Timber wall framing 94lm",qty:94,unit:"lm",rate:95,margin:20,source:"takeoff"},
      {id:303,category:"Roofing",description:"Corrugated iron 162m²",qty:162,unit:"m²",rate:145,margin:18,source:"manual"},
      {id:304,category:"Windows & Doors",description:"Aluminium joinery — 8 windows, 6 doors",qty:14,unit:"ea",rate:2200,margin:15,source:"manual"},
      {id:305,category:"Linings",description:"Gib board internal linings",qty:210,unit:"m²",rate:55,margin:22,source:"manual"},
    ],
    overhead:12,margin:20,gst:15,invoiced:0,
    actualCosts:[],variations:[],claims:[],
    notes:"Client wants completion by October. Allow for possible retaining wall.",
  }),
  mkProject({id:2,name:"85 Swann Rd — 4 Apartments",client:"Jade 85 Pty Ltd",clientId:2,
    address:"85 Swann Rd, Taringa QLD 4068",status:"active",created:"2025-04-28",
    takeoffLayers:[{id:111,name:"Joinery",color:"#a78bfa",visible:true}],
    takeoffItems:[
      {id:211,layerId:111,type:"count",label:"Windows (W1–W7 types)",qty:68,unit:"ea",source:"ai"},
      {id:212,layerId:111,type:"count",label:"Sliding Doors (SD1–SD4)",qty:24,unit:"ea",source:"ai"},
      {id:213,layerId:111,type:"count",label:"Hinged Doors (D1–D8)",qty:48,unit:"ea",source:"ai"},
    ],
    aiSummary:{
      buildingType:"4-storey residential apartment building, 4 units — DA No. A005286793",
      confidence:"high",scale:"1:100 / 1:200",storeys:4,
      notes:"ANA Architects, Project 1904. Concrete construction. Multiple balconies per level.",
      windowSchedule:[
        {ref:"W1",size:"900×600",type:"Alum. Double Hung, 2 panels",spec:"Translucent white glass, bottom fixed"},
        {ref:"W2",size:"900×1500",type:"Alum. Sliding, 2 panels",spec:"Standard glass / Barrier protection invisi-screen"},
        {ref:"W3",size:"2700×900",type:"Alum. framed top-fixed + hopper",spec:"Standard glass"},
        {ref:"W4",size:"1800×600",type:"Alum. framed 920h top hopper",spec:"Standard glass"},
        {ref:"W5",size:"600×1200",type:"Fixed glass, 1 panel",spec:"Standard glass / Splashback window"},
        {ref:"W6",size:"4500×1800",type:"Alum. Hopper ×3",spec:"Translucent white glass"},
        {ref:"W7",size:"1200×600",type:"Double hung bottom-fixed",spec:"Standard glass"},
      ],
      doorSchedule:[
        {ref:"D1",size:"920",type:"Solidcore steel frame swing, FRL -/60/30",spec:"850 clear / Fire door / Security lock / Self-close"},
        {ref:"D2",size:"820",type:"Timber frame hollow-core swing",spec:"Door stopper"},
        {ref:"D3",size:"720",type:"Timber frame hollow-core swing",spec:"Door stopper"},
        {ref:"D4",size:"820",type:"Cavity slide hollow-core",spec:"Paint finish"},
        {ref:"D5",size:"920",type:"Solidcore steel frame swing, FRL -/60/30",spec:"850 clear / Self-close door stopper"},
        {ref:"D6",size:"920",type:"Alum. frame security glass door",spec:"Clear glass / Entry door N128.1 contrast strip"},
        {ref:"D7",size:"920",type:"Alum. frame",spec:""},
        {ref:"D8",size:"1640",type:"Solidcore steel frame swing, FRL -/60/30",spec:"850 clear / Fire door / Security lock / Self-close"},
      ],
      slidingDoorSchedule:[
        {ref:"SD1",size:"2700×4500",type:"Alum. sliding 0×X0, 6 panels",spec:"Standard glass"},
        {ref:"SD2",size:"2700×3000",type:"Alum. sliding X0, 4 panels",spec:"Standard glass"},
        {ref:"SD3",size:"2700×3800",type:"Alum. sliding X0, 4 panels",spec:"Standard glass"},
        {ref:"SD4",size:"2700×2000",type:"Alum. sliding X0, 2 panels",spec:"Standard glass"},
      ],
    },
    lineItems:[
      {id:311,category:"Concrete",description:"Concrete structure & slabs",qty:1,unit:"sum",rate:380000,margin:12,source:"manual"},
      {id:312,category:"Framing",description:"Structural steel & framing",qty:1,unit:"sum",rate:145000,margin:12,source:"manual"},
      {id:313,category:"Windows & Doors",description:"Aluminium joinery — full schedule W1–W7, SD1–SD4, D1–D8",qty:1,unit:"sum",rate:220000,margin:15,source:"takeoff"},
      {id:314,category:"Waterproofing",description:"Balcony & wet area waterproofing",qty:480,unit:"m²",rate:85,margin:20,source:"manual"},
      {id:315,category:"Finishes",description:"Internal finishes all levels",qty:1,unit:"sum",rate:180000,margin:18,source:"manual"},
    ],
    overhead:10,margin:12,gst:10,invoiced:420000,xeroRef:"INV-2241",
    actualCosts:[
      {id:401,category:"Concrete",description:"Concrete pour invoice — foundations",amount:195000,date:"2025-03-20",supplier:"Brisbane Ready Mix"},
      {id:402,category:"Framing",description:"Steel supply & fix — Level 1-2",amount:88000,date:"2025-04-10",supplier:"Austal Steel"},
    ],
    variations:[
      {id:501,ref:"VAR-001",description:"Additional balustrade upgrade Levels 2–4",amount:18500,status:"approved",date:"2025-05-01"},
      {id:502,ref:"VAR-002",description:"Carpark line marking addition",amount:4200,status:"pending",date:"2025-05-18"},
    ],
    claims:[
      {id:601,ref:"PC-01",description:"Foundations & slab complete",pct:25,amount:330000,status:"paid",date:"2025-03-15"},
      {id:602,ref:"PC-02",description:"Structure to Level 2",pct:25,amount:330000,status:"paid",date:"2025-04-20"},
    ],
    notes:"4-level residential apartment building. DA Number A005286793. ANA Architects Project 1904.",
  }),
  mkProject({id:3,name:"Mt Eden New Build",client:"R. & S. Patel",clientId:3,
    address:"7 Balmoral Rd, Mt Eden, Auckland",status:"draft",created:"2025-05-18",
    takeoffLayers:[],takeoffItems:[],lineItems:[],
    overhead:12,margin:20,gst:15,invoiced:0,actualCosts:[],variations:[],claims:[],
    notes:"New 4-bed 2-bath dwelling. Plans not yet received.",
  }),
];

const SEED_RATES = [
  {id:1,category:"Foundations",description:"Concrete slab",unit:"m²",rate:185,notes:""},
  {id:2,category:"Foundations",description:"Strip footing",unit:"lm",rate:220,notes:""},
  {id:3,category:"Foundations",description:"Pier (300mm dia)",unit:"ea",rate:850,notes:""},
  {id:4,category:"Framing",description:"Timber wall framing",unit:"lm",rate:95,notes:""},
  {id:5,category:"Framing",description:"Floor framing system",unit:"m²",rate:110,notes:""},
  {id:6,category:"Roofing",description:"Corrugated iron",unit:"m²",rate:145,notes:""},
  {id:7,category:"Roofing",description:"Colorbond standing seam",unit:"m²",rate:195,notes:""},
  {id:8,category:"Roofing",description:"Membrane flat roof",unit:"m²",rate:190,notes:""},
  {id:9,category:"Windows & Doors",description:"Aluminium window standard",unit:"ea",rate:1800,notes:""},
  {id:10,category:"Windows & Doors",description:"Aluminium door standard",unit:"ea",rate:2600,notes:""},
  {id:11,category:"Windows & Doors",description:"Sliding door per panel",unit:"ea",rate:1400,notes:""},
  {id:12,category:"Linings",description:"Gib board walls",unit:"m²",rate:55,notes:""},
  {id:13,category:"Linings",description:"Gib board ceiling",unit:"m²",rate:68,notes:""},
  {id:14,category:"Flooring",description:"Timber flooring",unit:"m²",rate:125,notes:""},
  {id:15,category:"Flooring",description:"Commercial vinyl",unit:"m²",rate:95,notes:""},
  {id:16,category:"Flooring",description:"Polished concrete",unit:"m²",rate:145,notes:""},
  {id:17,category:"Painting",description:"Internal walls 2 coats",unit:"m²",rate:28,notes:""},
  {id:18,category:"Painting",description:"External full paint",unit:"m²",rate:38,notes:""},
  {id:19,category:"Electrical",description:"New dwelling full",unit:"sum",rate:18000,notes:""},
  {id:20,category:"Plumbing",description:"New dwelling full",unit:"sum",rate:14000,notes:""},
  {id:21,category:"Plumbing",description:"Bathroom fit-out",unit:"ea",rate:8500,notes:""},
  {id:22,category:"Waterproofing",description:"Balcony / wet area",unit:"m²",rate:85,notes:""},
  {id:23,category:"Concrete",description:"Suspended slab 200mm",unit:"m²",rate:320,notes:""},
  {id:24,category:"Excavation",description:"Bulk excavation",unit:"m³",rate:45,notes:""},
  {id:25,category:"Demolition",description:"House demolition",unit:"sum",rate:18000,notes:""},
  {id:26,category:"Cabinetry",description:"Kitchen upper cabinets — laminate finish",unit:"lm",rate:850,notes:"Per linear metre, supply & install"},
  {id:27,category:"Cabinetry",description:"Kitchen lower cabinets — laminate finish",unit:"lm",rate:950,notes:"Per linear metre, supply & install"},
  {id:28,category:"Cabinetry",description:"Kitchen upper cabinets — veneer/painted",unit:"lm",rate:1250,notes:"Per linear metre, supply & install"},
  {id:29,category:"Cabinetry",description:"Kitchen lower cabinets — veneer/painted",unit:"lm",rate:1400,notes:"Per linear metre, supply & install"},
  {id:30,category:"Cabinetry",description:"Kitchen island unit",unit:"ea",rate:4500,notes:"Standard island, supply & install"},
  {id:31,category:"Cabinetry",description:"Pantry cabinet (full height)",unit:"ea",rate:1800,notes:"Supply & install"},
  {id:32,category:"Cabinetry",description:"Oven/microwave tower cabinet",unit:"ea",rate:1600,notes:"Supply & install"},
  {id:33,category:"Benchtops",description:"Reconstituted stone benchtop (20mm)",unit:"lm",rate:650,notes:"Per linear metre supply & install"},
  {id:34,category:"Benchtops",description:"Natural stone benchtop (20mm)",unit:"lm",rate:950,notes:"Per linear metre supply & install"},
  {id:35,category:"Benchtops",description:"Laminate benchtop",unit:"lm",rate:280,notes:"Per linear metre supply & install"},
  {id:36,category:"Benchtops",description:"Timber benchtop",unit:"lm",rate:480,notes:"Per linear metre supply & install"},
  {id:37,category:"Cabinetry",description:"Bathroom vanity — laminate (per unit)",unit:"ea",rate:1800,notes:"Supply & install, excludes benchtop"},
  {id:38,category:"Cabinetry",description:"Bathroom vanity — veneer/painted (per unit)",unit:"ea",rate:2600,notes:"Supply & install, excludes benchtop"},
  {id:39,category:"Benchtops",description:"Vanity benchtop — stone",unit:"lm",rate:520,notes:"Per linear metre supply & install"},
  {id:40,category:"Benchtops",description:"Vanity benchtop — laminate",unit:"lm",rate:180,notes:"Per linear metre supply & install"},
  {id:41,category:"Cabinetry",description:"Mirror cabinet / shaving cabinet",unit:"ea",rate:480,notes:"Supply & install"},
  {id:42,category:"Cabinetry",description:"Laundry cabinets (per lm)",unit:"lm",rate:720,notes:"Per linear metre supply & install"},
  {id:43,category:"Cabinetry",description:"Walk-in robe fitout",unit:"m²",rate:680,notes:"Per m² floor area, full fitout"},
  {id:44,category:"Cabinetry",description:"Built-in wardrobe (sliding doors)",unit:"ea",rate:1600,notes:"Per unit supply & install"},
  {id:45,category:"Cabinetry",description:"Drawer runner — soft close",unit:"ea",rate:45,notes:"Per pair, supply & install"},
  {id:46,category:"Cabinetry",description:"Cabinet hinge — soft close",unit:"ea",rate:18,notes:"Per hinge, supply & install"},
  {id:47,category:"Cabinetry",description:"Handle / pull (supply only)",unit:"ea",rate:25,notes:"Per handle"},
  {id:48,category:"Scaffolding",description:"Perimeter scaffolding",unit:"week",rate:2800,notes:""},
];

const SEED_COMPANY = {
  name:"BuildRight Contractors", abn:"61 000 000 000",
  address:"Unit 4, 88 Industry Rd, Henderson, Auckland 0612",
  phone:"09 837 5500", email:"quotes@buildright.co.nz",
  website:"www.buildright.co.nz", logoText:"BR",
  defaultMargin:20, defaultOverhead:12, defaultGst:15, currency:"NZD",
  bankName:"ANZ Bank NZ", bankAccount:"06-0101-0000000-00",
  paymentTerms:"Payment due within 14 days of invoice date.",
  quoteValidity:"This quote is valid for 30 days from the date above.",
};

// ── CABINETRY COSTING LIBRARY ────────────────────────────────────────────────
// Mirrors the cabinet-maker quoting model: carcass priced per m² of board,
// finish (door/drawer fronts) per m², hardware per door/drawer, assembly per
// cabinet, install per item in hours. All rates editable globally here and
// overridable per project in Estimate → Cabinetry Setup.
const SEED_CABLIB = {
  // Board + hardware rates (per supplier — editable)
  carcassRatePerM2: 52,        // carcass board $/m²
  doorHardware: 12,            // hinges etc per door
  drawerHardware: 95,          // runners etc per drawer
  assemblyPerCabinet: 25,      // assembly / other allowance per cabinet
  supplierCalibration: 2.89,   // multiplier to align with supplier C&A quotes (1 = off)
  useCalibration: true,
  // Standard cabinet dimensions (mm) — per project adjustable
  dims: {
    Base:     {h:720,  d:560},
    Overhead: {h:720,  d:320},
    Tall:     {h:2400, d:560},
  },
  // Panel-type default dimensions (w×h×d mm) from the cabinet library
  panelDims: {
    "End Panel":     {w:600,  h:1000, d:16},
    "Feature Panel": {w:1000, h:900,  d:16},
    "Filler":        {w:100,  h:900,  d:16},
    "Kickboard":     {w:1000, h:120,  d:550},
    "Wall Panel":    {w:1000, h:1200, d:16},
    "Bulkhead":      {w:1000, h:200,  d:150},
    "Floating Shelf":{w:1000, h:300,  d:33},
  },
  // Finish library — board $/m² by range (per supplier — editable)
  finishes: [
    {id:1, name:"White Melamine",             rate:45,  notes:"Starter range"},
    {id:2, name:"Polytec / Laminex standard", rate:85,  notes:"Default example"},
    {id:3, name:"Premium textured laminate",  rate:105, notes:"Adjust as needed"},
    {id:4, name:"2PAC / painted finish",      rate:140, notes:"Adjust as needed"},
    {id:5, name:"Custom / project finish",    rate:165, notes:"Default finish rate"},
  ],
  defaultFinishId: 5,
  // Install — hours per item by Type|Config, charged at hourly rate.
  // mode: ea (per item) | lm (per lineal metre) | m2 (per square metre)
  installHourlyRate: 113,
  installMinHours: 4,
  installSiteSetupHours: 2,
  installRates: [
    {key:"Base|1 Door",      type:"Base",     config:"1 Door",               hours:0.35, mode:"ea", notes:"Per unit"},
    {key:"Base|2 Door",      type:"Base",     config:"2 Door",               hours:0.45, mode:"ea", notes:"×2 for sink cabinets"},
    {key:"Base|1 Drawer",    type:"Base",     config:"1 Drawer",             hours:0.5,  mode:"ea", notes:""},
    {key:"Base|2 Drawer",    type:"Base",     config:"2 Drawer",             hours:0.65, mode:"ea", notes:""},
    {key:"Base|3 Drawer",    type:"Base",     config:"3 Drawer",             hours:0.8,  mode:"ea", notes:""},
    {key:"Base|4 Drawer",    type:"Base",     config:"4 Drawer",             hours:0.95, mode:"ea", notes:""},
    {key:"Base|5 Drawer",    type:"Base",     config:"5 Drawer",             hours:1.1,  mode:"ea", notes:""},
    {key:"Overhead|1 Door",  type:"Overhead", config:"1 Door",               hours:0.45, mode:"ea", notes:""},
    {key:"Overhead|2 Door",  type:"Overhead", config:"2 Door",               hours:0.55, mode:"ea", notes:""},
    {key:"Tall|1 Door",      type:"Tall",     config:"1 Door",               hours:0.8,  mode:"ea", notes:""},
    {key:"Tall|2 Door",      type:"Tall",     config:"2 Door",               hours:1.1,  mode:"ea", notes:""},
    {key:"Benchtop|Laminate Top",type:"Benchtop",config:"Laminate Top",      hours:1.0,  mode:"lm", notes:"Per lineal metre"},
    {key:"Panel|End Panel",  type:"Panel",    config:"End Panel",            hours:0.35, mode:"ea", notes:"Per panel"},
    {key:"Panel|Feature Panel",type:"Panel",  config:"Feature Panel",        hours:0.75, mode:"ea", notes:"Per feature face"},
    {key:"Panel|Filler",     type:"Panel",    config:"Filler",               hours:0.25, mode:"ea", notes:"Per filler/scribe"},
    {key:"Panel|Kickboard",  type:"Panel",    config:"Kickboard",            hours:0.2,  mode:"ea", notes:"Per kick section"},
    {key:"Panel|Wall Panel", type:"Panel",    config:"Wall Panel",           hours:1.0,  mode:"ea", notes:"Per panel"},
    {key:"Panel|Bulkhead",   type:"Panel",    config:"Bulkhead",             hours:0.65, mode:"ea", notes:"Per bulkhead section"},
    {key:"Shelf|Floating",   type:"Panel",    config:"Floating Shelf",       hours:1.0,  mode:"lm", notes:"Per lineal metre"},
    {key:"Appliance|Integrated Panel",type:"Appliance",config:"Integrated Appliance",hours:0.6,mode:"ea",notes:"Per appliance panel"},
    {key:"Appliance|Integrated Fridge",type:"Appliance",config:"Integrated Fridge",hours:3.0,mode:"ea",notes:"Per door panel"},
    {key:"Appliance|Integrated Dishwasher",type:"Appliance",config:"Integrated Dishwasher",hours:0.5,mode:"ea",notes:""},
    {key:"Misc|Manual",      type:"Misc",     config:"Manual Install Allowance",hours:1.0,mode:"ea", notes:"Qty = hours"},
  ],
  // Logistics & project handling defaults (per project — editable)
  deliveryAllowance: 0,        // delivery / handling per project
  protectionAllowance: 153.22, // site protection
  pmAllowance: 0,              // project management allocation
};

// ── CABINETRY PRICING ENGINE ─────────────────────────────────────────────────
// carcass m² = 2 sides (H×D) + top & bottom (W×D) + back (W×H)
function cabCarcassM2(w,h,d){ return (2*h*d + 2*w*d + w*h)/1e6; }
function cabFrontM2(w,h){ return (w*h)/1e6; }

function cabDoorsDrawers(config){
  const c=(config||"").toLowerCase();
  const dm=c.match(/(\d)\s*drawer/); if(dm) return {doors:0,drawers:parseInt(dm[1])};
  const dr=c.match(/(\d)\s*door/);   if(dr) return {doors:parseInt(dr[1]),drawers:0};
  return {doors:0,drawers:0};
}

// Price one cabinet line {type, config, width} → cost breakdown per unit.
// cfg = project cabConfig (or SEED_CABLIB). Returns null only on bad input.
function priceCabLine(line, cfg){
  const L=cfg||SEED_CABLIB;
  const type=line.type||"", config=line.config||"";
  const finish=L.finishes?.find(f=>f.id===(line.finishId||L.defaultFinishId))||L.finishes?.[0]||{rate:165};
  const {doors,drawers}=cabDoorsDrawers(config);
  let w=line.width||0, h=0, d=0;
  let carcass=0, front=0;

  if(["Base","Overhead","Tall"].includes(type)){
    const dim=L.dims?.[type]||{h:720,d:560};
    h=dim.h; d=dim.d;
    if(w<=0) w=600;
    carcass=cabCarcassM2(w,h,d);
    front=cabFrontM2(w,h);
  } else if(type==="Benchtop"){
    // benchtop costed per lineal metre: 1m × 600 × 33 board section
    carcass=cabCarcassM2(1000,600,33);
    front=cabFrontM2(1000,600);
  } else if(type==="Panel"||type==="Splashback"){
    const pd=L.panelDims?.[config]||{w:w>0?w:1000,h:900,d:16};
    const pw=w>0?w:pd.w;
    carcass=cabCarcassM2(pw,pd.h,pd.d);
    front=cabFrontM2(pw,pd.h);
  } else {
    // Appliance / Hardware / Misc — assembly-only base (matches library)
    carcass=0; front=0;
  }

  const carcassCost = carcass*(L.carcassRatePerM2??52);
  const hardwareCost= doors*(L.doorHardware??12) + drawers*(L.drawerHardware??95);
  const assembly    = L.assemblyPerCabinet??25;
  const finishCost  = front*(finish.rate??165);
  let supply        = carcassCost+hardwareCost+assembly+finishCost;
  if(L.useCalibration!==false && (L.supplierCalibration||0)>1) supply*= L.supplierCalibration;

  // Install: find rate by Type|Config (exact → loose → type-only fallback)
  const ir=(L.installRates||[]).find(r=>r.type===type&&r.config.toLowerCase()===config.toLowerCase())
        ||(L.installRates||[]).find(r=>r.type===type&&config.toLowerCase().includes(r.config.toLowerCase()))
        ||(L.installRates||[]).find(r=>r.config.toLowerCase()===config.toLowerCase())
        ||(L.installRates||[]).find(r=>r.type===type);
  const installHours=ir?ir.hours:0;
  const installMode=ir?ir.mode:"ea";
  const installCost=installHours*(L.installHourlyRate??113);

  return {carcassM2:carcass, frontM2:front, carcassCost, hardwareCost, assembly,
    finishCost, supply, installHours, installMode, installCost,
    unitCost: supply+ (installMode==="ea"?installCost:0),
    // for lm/m² modes install is charged on qty externally
  };
}

const CATS = [
  "Foundations","Concrete","Framing","Roofing","Cladding","Windows & Doors",
  "Waterproofing","Insulation","Linings","Flooring","Tiling","Painting",
  "Electrical","Plumbing","HVAC","Fire Services","Partitioning","Ceilings",
  "Cabinetry","Benchtops","Stairs","Balustrades","Landscaping","Siteworks",
  "Excavation","Demolition","Scaffolding","Preliminary","Contingency","Finishes","Other"
];
const UNITS = ["m²","lm","m³","ea","sum","hr","t","kg","L","set","week"];
const STATUS = {
  draft:   {label:"Draft",   color:"#3a4555", next:"quoting"},
  quoting: {label:"Quoting", color:"#eab308", next:"sent"},
  sent:    {label:"Sent",    color:"#3b82f6", next:"approved"},
  approved:{label:"Approved",color:"#22c55e", next:"active"},
  active:  {label:"Active",  color:"#14b8a6", next:"complete"},
  complete:{label:"Complete",color:"#8b5cf6", next:null},
  lost:    {label:"Lost",    color:"#ef4444", next:null},
};

// ── TRADE SCOPES ─────────────────────────────────────────────────────────────
// Each trade defines: which CATS it uses, which page types to scan for, and
// the extraction schema fields the AI should focus on.
const TRADES = {
  builder:     { label:"Builder / Head Contractor", icon:"🏗", color:"#f59e0b",
    cats:["Foundations","Concrete","Framing","Roofing","Cladding","Waterproofing","Insulation","Linings","Flooring","Tiling","Painting","Stairs","Balustrades","Landscaping","Siteworks","Excavation","Demolition","Scaffolding","Preliminary","Contingency","Other"],
    scanFocus:"floor plans, site plans, elevations, sections, roof plans, structural details",
    extractFocus:"floor areas, wall lengths, roof areas, storeys, building type, structural elements, external envelope" },
  joinery:     { label:"Joinery / Windows & Doors", icon:"🪟", color:"#3b82f6",
    cats:["Windows & Doors"],
    scanFocus:"window schedules, door schedules, sliding door schedules, joinery details, elevation drawings showing openings",
    extractFocus:"every window type with ref/size/type/spec/qty, every door type with ref/size/frame/hardware/spec, every sliding door type, total counts per type, head heights, sill heights, glazing specs, hardware notes" },
  cabinetry:   { label:"Cabinetry / Joinery Fit-out", icon:"🪵", color:"#a78bfa",
    cats:["Cabinetry","Benchtops"],
    scanFocus:"kitchen plans and elevations, bathroom vanity plans and elevations, laundry plans, wardrobe/robe plans, ensuite detail plans, joinery detail sheets, cabinet elevation drawings, millwork schedules",
    extractFocus:"every kitchen with cabinet layout (uppers/lowers/pantry/island), benchtop material and lineal metres, every bathroom vanity with size and drawers, every laundry cabinet, every wardrobe/built-in robe with dimensions, appliance cut-outs, hardware schedule, hinge counts, drawer counts, door counts per cabinet, material finishes (laminate/veneer/painted), all referenced dimensions and linear metres of cabinetry per room" },
  electrician: { label:"Electrical", icon:"⚡", color:"#eab308",
    cats:["Electrical"],
    scanFocus:"electrical plans, lighting plans, power layout plans, switchboard schedules, electrical legends",
    extractFocus:"power point counts, light fitting types and counts, switchboard locations, circuit counts, conduit runs, consumer mains, data/comms points" },
  plumber:     { label:"Plumbing / Hydraulic", icon:"🔧", color:"#22c55e",
    cats:["Plumbing"],
    scanFocus:"hydraulic plans, plumbing layout plans, fixture schedules, wet area plans",
    extractFocus:"fixture types and counts (toilets, basins, showers, baths, taps), pipe runs, hot water system, drainage points, fixture schedule" },
  tiler:       { label:"Tiler", icon:"⬛", color:"#14b8a6",
    cats:["Tiling","Waterproofing"],
    scanFocus:"wet area plans, bathroom/ensuite/laundry floor plans, tiling schedules, finish schedules",
    extractFocus:"tiled floor areas per room, tiled wall areas per room, waterproofing areas, tile types and sizes from finish schedule, grout specifications" },
  painter:     { label:"Painter", icon:"🎨", color:"#ec4899",
    cats:["Painting"],
    scanFocus:"all floor plans, elevations, internal elevations, finish schedules",
    extractFocus:"total wall areas per level, ceiling areas, external wall areas, number of coats, paint finish types from schedule, special coatings" },
  flooring:    { label:"Flooring", icon:"⬜", color:"#f97316",
    cats:["Flooring"],
    scanFocus:"floor plans, finish schedules, flooring layout plans",
    extractFocus:"floor area per room/zone, flooring type per zone from finish schedule, transitions, floor build-up heights" },
  concreter:   { label:"Concreter", icon:"🪨", color:"#6b7280",
    cats:["Foundations","Concrete"],
    scanFocus:"foundation plans, structural plans, slab plans, concrete schedules",
    extractFocus:"slab areas and thicknesses, footing lengths and depths, pier counts and sizes, concrete volumes, reinforcement notes" },
};

const TRADE_KEYS = Object.keys(TRADES);

// ── CALCULATIONS ─────────────────────────────────────────────────────────────
function calc(p) {
  const sub = (p.lineItems||[]).reduce((s,li) =>
    s + (li.qty||0)*(li.rate||0)*(1+((li.margin??p.margin??0)/100)), 0);
  const varTotal = (p.variations||[]).filter(v=>v.status==="approved").reduce((s,v)=>s+(v.amount||0),0);
  // Cabinetry project extras: PM allocation, delivery/handling, site protection,
  // and install site-setup hours at the project install rate.
  const cc=p.cabConfig||null;
  const extras = cc ? (cc.pmAllowance||0)+(cc.deliveryAllowance||0)+(cc.protectionAllowance||0)
    +((cc.installSiteSetupHours||0)*(cc.installHourlyRate||0)) : 0;
  const ovhd = sub * ((p.overhead||0)/100);
  const exGst = sub + ovhd + varTotal + extras;
  const gstAmt = exGst * ((p.gst||0)/100);
  const total = exGst + gstAmt;
  const actTotal = (p.actualCosts||[]).reduce((s,a)=>s+(a.amount||0),0);
  const claimedTotal = (p.claims||[]).reduce((s,c)=>s+(c.amount||0),0);
  return {sub, ovhd, varTotal, extras, exGst, gstAmt, total, actTotal, claimedTotal};
}

function $$(n, short=false) {
  const v = Math.abs(n||0);
  if (short) {
    if (v>=1000000) return `$${(n/1000000).toFixed(2)}M`;
    if (v>=1000) return `$${(n/1000).toFixed(1)}k`;
    return `$${(n||0).toFixed(0)}`;
  }
  return (n<0?"-$":"$")+v.toLocaleString("en-AU",{minimumFractionDigits:2,maximumFractionDigits:2});
}

// ── MICRO COMPONENTS ─────────────────────────────────────────────────────────
function Bdg({color, children, sm}) {
  return <span style={{background:`${color}18`,color,border:`1px solid ${color}35`,
    borderRadius:4,padding:sm?"1px 6px":"3px 9px",fontSize:sm?10:11,fontWeight:700,
    letterSpacing:"0.05em",fontFamily:T.mono,textTransform:"uppercase",whiteSpace:"nowrap"}}>{children}</span>;
}

function Btn({children,onClick,v="def",sm,full,disabled,sx={}}) {
  const vs = {
    def:{bg:T.card2,c:T.muted,b:T.border},
    pri:{bg:T.accent,c:"#000",b:T.accent},
    grn:{bg:T.greenDim,c:T.green,b:`${T.green}44`},
    blu:{bg:T.blueDim,c:T.blue,b:`${T.blue}44`},
    red:{bg:T.redDim,c:T.red,b:`${T.red}44`},
    gho:{bg:"transparent",c:T.muted,b:T.border},
    tel:{bg:T.tealDim,c:T.teal,b:`${T.teal}44`},
    yel:{bg:T.yellowDim,c:T.yellow,b:`${T.yellow}44`},
    pur:{bg:T.purpleDim,c:T.purple,b:`${T.purple}44`},
  };
  const st = vs[v]||vs.def;
  return <button onClick={onClick} disabled={disabled} style={{
    background:st.bg,color:st.c,border:`1px solid ${st.b}`,
    padding:sm?"5px 11px":"8px 15px",borderRadius:6,cursor:disabled?"not-allowed":"pointer",
    fontFamily:T.font,fontSize:sm?11:13,fontWeight:600,opacity:disabled?0.5:1,
    width:full?"100%":undefined,transition:"opacity 0.15s",...sx}}
    onMouseEnter={e=>{if(!disabled)e.currentTarget.style.opacity="0.75"}}
    onMouseLeave={e=>{e.currentTarget.style.opacity="1"}}>{children}</button>;
}

function Inp({label,value,onChange,type="text",placeholder,mono,rows,disabled,sx={}}) {
  const base = {width:"100%",boxSizing:"border-box",background:disabled?T.panel:T.bg,
    border:`1px solid ${T.border}`,borderRadius:5,padding:"7px 10px",
    color:disabled?T.muted:T.text,fontSize:13,outline:"none",
    fontFamily:mono?T.mono:T.font};
  return <div style={{marginBottom:10,...sx}}>
    {label&&<div style={{color:T.muted,fontSize:11,marginBottom:4,fontWeight:600,
      textTransform:"uppercase",letterSpacing:"0.05em"}}>{label}</div>}
    {rows
      ? <textarea value={value??""} onChange={e=>onChange(e.target.value)} rows={rows}
          disabled={disabled} style={{...base,resize:"vertical"}}
          onFocus={e=>{if(!disabled)e.target.style.borderColor=T.accent}}
          onBlur={e=>e.target.style.borderColor=T.border}/>
      : <input type={type} value={type==="number"?(value===0||value?""+value:""):(value??"")} placeholder={placeholder} disabled={disabled}
          onChange={e=>onChange(type==="number"?parseFloat(e.target.value)||0:e.target.value)}
          style={base}
          onFocus={e=>{if(!disabled)e.target.style.borderColor=T.accent}}
          onBlur={e=>e.target.style.borderColor=T.border}/>}
  </div>;
}

function Sel({label,value,onChange,options,sx={}}) {
  return <div style={{marginBottom:10,...sx}}>
    {label&&<div style={{color:T.muted,fontSize:11,marginBottom:4,fontWeight:600,
      textTransform:"uppercase",letterSpacing:"0.05em"}}>{label}</div>}
    <select value={value??""} onChange={e=>onChange(e.target.value)} style={{
      width:"100%",background:T.bg,border:`1px solid ${T.border}`,borderRadius:5,
      padding:"7px 10px",color:T.text,fontSize:13,fontFamily:T.font,outline:"none"}}>
      {options.map(o=><option key={o.value??o} value={o.value??o}>{o.label??o}</option>)}
    </select>
  </div>;
}

function Card({children, sx={}, hi}) {
  return <div style={{background:T.card,border:`1px solid ${hi?T.accentBrd:T.border}`,
    borderRadius:9,padding:18,...sx}}>{children}</div>;
}

function Row({children,gap=10,wrap,sx={}}) {
  return <div style={{display:"flex",gap,flexWrap:wrap?"wrap":undefined,alignItems:"center",...sx}}>{children}</div>;
}

function Grid2({children,gap=12,sx={}}) {
  return <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap,...sx}}>{children}</div>;
}

function Grid3({children,gap=12,sx={}}) {
  return <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap,...sx}}>{children}</div>;
}

function Hdr({children,sub,action,sx={}}) {
  return <div style={{marginBottom:18,...sx}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
      <h2 style={{margin:0,fontSize:19,fontWeight:800,color:T.text,letterSpacing:"-0.3px"}}>{children}</h2>
      {action}
    </div>
    {sub&&<p style={{color:T.muted,fontSize:12,margin:"3px 0 0"}}>{sub}</p>}
  </div>;
}

function KPI({label,value,sub,color=T.accent,sx={}}) {
  return <Card sx={{flex:"1 1 150px",...sx}}>
    <div style={{color:T.muted,fontSize:11,marginBottom:6,fontWeight:600,
      textTransform:"uppercase",letterSpacing:"0.05em"}}>{label}</div>
    <div style={{color,fontFamily:T.mono,fontSize:22,fontWeight:800}}>{value}</div>
    {sub&&<div style={{color:T.faint,fontSize:11,marginTop:3}}>{sub}</div>}
  </Card>;
}

function Tabs({tabs,active,onChange}) {
  return <div style={{display:"flex",borderBottom:`1px solid ${T.border}`,marginBottom:20,overflowX:"auto"}}>
    {tabs.map(t=><div key={t.id} onClick={()=>onChange(t.id)} style={{
      padding:"9px 16px",cursor:"pointer",fontSize:13,whiteSpace:"nowrap",
      fontWeight:active===t.id?700:400,color:active===t.id?T.accent:T.muted,
      borderBottom:`2px solid ${active===t.id?T.accent:"transparent"}`,
      marginBottom:-1,transition:"all 0.15s"}}>{t.label}</div>)}
  </div>;
}

function Toast({msg,type,onDone}) {
  useEffect(()=>{const t=setTimeout(onDone,3000);return()=>clearTimeout(t)},[]);
  const c=type==="success"?T.green:type==="error"?T.red:T.blue;
  return <div style={{position:"fixed",top:20,right:20,zIndex:9999,background:T.card,
    border:`1px solid ${c}`,borderLeft:`4px solid ${c}`,borderRadius:7,padding:"10px 18px",
    color:T.text,fontSize:13,fontWeight:600,boxShadow:"0 8px 32px rgba(0,0,0,0.7)",
    maxWidth:360,fontFamily:T.font}}>{msg}</div>;
}

function Toggle({on,onChange,label}) {
  return <div onClick={()=>onChange(!on)} style={{display:"flex",alignItems:"center",gap:10,cursor:"pointer",marginBottom:10}}>
    <div style={{width:38,height:20,borderRadius:10,background:on?T.green:T.faint,position:"relative",transition:"background 0.2s",flexShrink:0}}>
      <div style={{position:"absolute",top:3,left:on?19:3,width:14,height:14,borderRadius:"50%",background:"#fff",transition:"left 0.2s"}}/>
    </div>
    {label&&<span style={{fontSize:13,color:T.text}}>{label}</span>}
  </div>;
}

// ── Modal shell + a prompt/confirm replacement (window.prompt is blocked in
//    sandboxed/Turbopack environments, so we use in-app modals everywhere).
function Modal({title,children,onClose}) {
  return <div onClick={onClose} style={{position:"fixed",inset:0,zIndex:9998,
    background:"rgba(0,0,0,0.6)",display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
    <div onClick={e=>e.stopPropagation()} style={{background:T.card,border:`1px solid ${T.border}`,
      borderRadius:11,padding:22,width:"100%",maxWidth:420,boxShadow:"0 20px 60px rgba(0,0,0,0.6)"}}>
      {title&&<div style={{fontWeight:800,fontSize:15,marginBottom:14,color:T.text}}>{title}</div>}
      {children}
    </div>
  </div>;
}

// Controlled text-prompt modal. Usage: <PromptModal .../> rendered when open.
function PromptModal({title,label,initial="",placeholder,confirmText="Save",onConfirm,onCancel}) {
  const [val,setVal]=useState(initial);
  return <Modal title={title} onClose={onCancel}>
    <Inp label={label} value={val} onChange={setVal} placeholder={placeholder}/>
    <Row gap={8} sx={{justifyContent:"flex-end",marginTop:8}}>
      <Btn v="gho" sm onClick={onCancel}>Cancel</Btn>
      <Btn v="pri" sm onClick={()=>onConfirm(val)}>{confirmText}</Btn>
    </Row>
  </Modal>;
}

function ConfirmModal({title,message,confirmText="Delete",danger,onConfirm,onCancel}) {
  return <Modal title={title} onClose={onCancel}>
    <div style={{color:T.muted,fontSize:13,lineHeight:1.6,marginBottom:16}}>{message}</div>
    <Row gap={8} sx={{justifyContent:"flex-end"}}>
      <Btn v="gho" sm onClick={onCancel}>Cancel</Btn>
      <Btn v={danger?"red":"pri"} sm onClick={onConfirm}>{confirmText}</Btn>
    </Row>
  </Modal>;
}

// ── ERROR BOUNDARY — one module crashing must not white-screen the app ──────
class ErrorBoundary extends Component {
  constructor(props){ super(props); this.state={error:null}; }
  static getDerivedStateFromError(error){ return {error}; }
  componentDidCatch(error,info){ console.error("QuantaFlow module error:",error,info); }
  render(){
    if(this.state.error) return <div style={{padding:24,background:T.card,border:`1px solid ${T.red}55`,
      borderRadius:9,margin:20,color:T.text,fontFamily:T.font}}>
      <div style={{fontWeight:800,fontSize:15,color:T.red,marginBottom:8}}>Something went wrong in this section</div>
      <div style={{color:T.muted,fontSize:13,marginBottom:14}}>
        Your data is safe — it's stored locally and untouched. Error: <span style={{fontFamily:T.mono,fontSize:12}}>{String(this.state.error?.message||this.state.error)}</span>
      </div>
      <button onClick={()=>this.setState({error:null})} style={{background:T.accent,color:"#000",
        border:"none",padding:"8px 16px",borderRadius:6,fontWeight:700,cursor:"pointer",fontFamily:T.font}}>
        Try Again
      </button>
    </div>;
    return this.props.children;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// APP ROOT
// ═══════════════════════════════════════════════════════════════════════════
export default function App() {
  const [projects,  setProjects]  = useState([]);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [projectsError, setProjectsError] = useState(null);
  const [user, setUser] = useState(null);
  const [companyId, setCompanyId] = useState(null);
  const [clients,   setClients]   = useLS("qf_clients",  SEED_CLIENTS);
  const [rates,     setRates]     = useLS("qf_rates",    SEED_RATES);
  const [cabLib,    setCabLib]    = useLS("qf_cablib",   SEED_CABLIB);
  const [company,   setCompany]   = useLS("qf_company",  SEED_COMPANY);
  const [xero,      setXero]      = useLS("qf_xero", {connected:false,autoSync:true,twoWay:false,syncPO:false,taxCode:"GST",accountCode:"200",log:[]});
  const [trash,     setTrash]     = useLS("qf_trash", []);
  const [storageErr,setStorageErr]= useState(null);

  useEffect(() => {
    let mounted = true;
    async function loadProjects() {
      setProjectsLoading(true);
      setProjectsError(null);
      try {
        const { data: userData, error: userError } = await supabase.auth.getUser();
        if (userError) throw userError;
        const currentUser = userData?.user;
        if (!currentUser) throw new Error("No authenticated user found.");

        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("company_id")
          .eq("id", currentUser.id)
          .single();
        if (profileError) throw profileError;
        if (!profile?.company_id) throw new Error("User profile missing company_id.");

        const { data: projectData, error: projectError } = await supabase
          .from("projects")
          .select("*")
          .eq("company_id", profile.company_id)
          .order("created", { ascending: false });
        if (projectError) throw projectError;

        if (mounted) {
          setUser(currentUser);
          setCompanyId(profile.company_id);
          setProjects((projectData || []).map(normalizeProject));
        }
      } catch (err) {
        if (mounted) setProjectsError(err?.message || String(err));
      } finally {
        if (mounted) setProjectsLoading(false);
      }
    }
    loadProjects();
    return () => { mounted = false; };
  }, []);

  // surface localStorage quota failures instead of silently dropping saves
  useEffect(()=>{
    const h=e=>setStorageErr(e.detail||"Storage error");
    window.addEventListener("qf-storage-error",h);
    return ()=>window.removeEventListener("qf-storage-error",h);
  },[]);

  // backup staleness: nag if work exists and no backup in 7+ days
  const lastBackup=(()=>{if(typeof window==="undefined")return Date.now();try{return parseInt(localStorage.getItem("qf_lastBackup"))||0;}catch{return 0;}})();
  const backupStale = projects.length>0 && (Date.now()-lastBackup > 7*86400000);

  async function trashProject(id){
    const p=projects.find(x=>x.id===id); if(!p) return;
    try {
      const { error } = await supabase.from("projects").delete().eq("id", id);
      if (error) throw error;
      setTrash(t=>[{...p,trashedAt:new Date().toISOString()},...t].slice(0,25));
      setProjects(ps=>ps.filter(x=>x.id!==id));
      pop(`"${p.name}" moved to Trash — restore from Settings.`);
    } catch (err) {
      pop(err?.message||String(err), "error");
      console.error(err);
    }
  }

  async function createProject(np){
    if(!user||!companyId) return pop("Unable to create project — user not loaded.","error");
    try {
      const insert = {
        company_id: companyId,
        name: np.name,
        client_name: np.client,
        address: np.address,
        status: "draft",
        quote_value: 0,
        created_by: user.id,
      };
      const { data, error } = await supabase.from("projects").insert(insert).select().single();
      if (error) throw error;
      const project = normalizeProject({
        ...mkProject({overhead: company.defaultOverhead, margin: company.defaultMargin, gst: company.defaultGst||15}),
        ...data,
      });
      setProjects(ps=>[project,...ps]);
      pop("Project created!");
      return project;
    } catch (err) {
      pop(err?.message||String(err), "error");
      console.error(err);
      throw err;
    }
  }

  function restoreProject(id){
    const p=trash.find(x=>x.id===id); if(!p) return;
    const {trashedAt,...clean}=p;
    setProjects(ps=>[clean,...ps]);
    setTrash(t=>t.filter(x=>x.id!==id));
    pop(`"${p.name}" restored.`);
  }
  const [nav,       setNav]       = useState("dashboard");
  const [projId,    setProjId]    = useState(null);
  const [projTab,   setProjTab]   = useState("takeoff");
  const [toast,     setToast]     = useState(null);

  const pop = (msg, type="success") => setToast({msg,type});

  // Next.js: render only after mount so persisted localStorage state can't
  // mismatch the server-prerendered HTML during hydration
  const [mounted,setMounted]=useState(false);
  useEffect(()=>{setMounted(true);},[]);

  function mutProj(id, fn) {
    setProjects(ps => ps.map(p => p.id===id ? fn(p) : p));
  }

  function openProj(id, tab="takeoff") { setProjId(id); setProjTab(tab); }
  function closeProj() { setProjId(null); }

  function pushXero(proj) {
    const c = calc(proj);
    const ref = "INV-"+String(Math.floor(1000+Math.random()*9000));
    mutProj(proj.id, p=>({...p, invoiced:c.total, xeroRef:ref,
      status:p.status==="approved"?"active":p.status}));
    setXero(x=>({...x, log:[{ts:new Date().toLocaleTimeString(),
      msg:`${ref} pushed — ${proj.name} ${$$(c.total,true)}`,ok:true},...(x.log||[])]}));
    pop(`${ref} pushed to Xero!`);
  }

  const curProj = projId ? projects.find(p=>p.id===projId) : null;
  const pipeline = projects.reduce((s,p)=>s+calc(p).total, 0);

  const NAV = [
    {id:"dashboard",icon:"▦",label:"Dashboard"},
    {id:"projects", icon:"◧",label:"Projects"},
    {id:"clients",  icon:"◎",label:"Clients"},
    {id:"rates",    icon:"≡",label:"Rate Library"},
    {id:"xero",     icon:"⟳",label:"Xero Sync"},
    {id:"settings", icon:"⚙",label:"Settings"},
  ];

  if(!mounted) return null;

  return (
    <div style={{minHeight:"100vh",background:T.bg,color:T.text,fontFamily:T.font,display:"flex"}}>

      {/* ── SIDEBAR ─────────────────────────────────────────────────── */}
      <aside style={{width:196,background:T.panel,borderRight:`1px solid ${T.border}`,
        display:"flex",flexDirection:"column",flexShrink:0,position:"sticky",top:0,height:"100vh"}}>
        <div style={{padding:"18px 15px 14px",borderBottom:`1px solid ${T.border}`}}>
          <div style={{display:"flex",alignItems:"center",gap:9}}>
            <div style={{width:32,height:32,borderRadius:7,background:T.accent,color:"#000",
              display:"flex",alignItems:"center",justifyContent:"center",fontWeight:900,fontSize:13}}>
              {company.logoText}
            </div>
            <div>
              <div style={{fontWeight:800,fontSize:12,lineHeight:1.2,color:T.text}}>{company.name}</div>
              <div style={{color:T.muted,fontSize:10}}>QuantaFlow</div>
            </div>
          </div>
        </div>

        <nav style={{padding:"10px 7px",flex:1}}>
          {NAV.map(n=>{
            const active = nav===n.id && !curProj;
            return <div key={n.id} onClick={()=>{setNav(n.id);closeProj();}} style={{
              display:"flex",alignItems:"center",gap:9,padding:"8px 11px",borderRadius:6,
              cursor:"pointer",marginBottom:2,
              background:active?T.accentDim:"transparent",
              border:`1px solid ${active?T.accentBrd:"transparent"}`,
              color:active?T.accent:T.muted,fontSize:13,fontWeight:active?700:400,
              transition:"all 0.15s"}}>
              <span style={{fontSize:15,lineHeight:1}}>{n.icon}</span>{n.label}
            </div>;
          })}
        </nav>

        <div style={{padding:"12px 15px",borderTop:`1px solid ${T.border}`}}>
          <div style={{color:T.faint,fontSize:10,marginBottom:5,textTransform:"uppercase",letterSpacing:"0.08em"}}>Pipeline</div>
          <div style={{color:T.accent,fontFamily:T.mono,fontWeight:800,fontSize:17}}>{$$(pipeline,true)}</div>
          <div style={{color:T.muted,fontSize:11,marginTop:2}}>{projects.length} projects</div>
          <div style={{marginTop:7,display:"flex",alignItems:"center",gap:5,fontSize:11}}>
            <span style={{width:6,height:6,borderRadius:"50%",display:"inline-block",
              background:xero.connected?T.green:T.faint,
              boxShadow:xero.connected?`0 0 5px ${T.green}`:"none"}}/>
            <span style={{color:xero.connected?T.green:T.muted}}>Xero {xero.connected?"live":"offline"}</span>
          </div>
        </div>
      </aside>

      {/* ── MAIN ────────────────────────────────────────────────────── */}
      <main style={{flex:1,overflowY:"auto",padding:26,minWidth:0}}>
        {toast && <Toast msg={toast.msg} type={toast.type} onDone={()=>setToast(null)}/>}

        {storageErr&&<div style={{background:T.redDim,border:`1px solid ${T.red}55`,borderRadius:7,
          padding:"10px 16px",marginBottom:14,fontSize:13,color:T.red,fontWeight:600}}>
          ⚠ Browser storage is full or unavailable ({storageErr}) — recent changes may not be saving.
          Export a backup NOW from Settings, then clear old projects via Trash.
          <span style={{marginLeft:10,cursor:"pointer",textDecoration:"underline"}} onClick={()=>setStorageErr(null)}>dismiss</span>
        </div>}
        {/* Supabase project sync is now active, so the old local-browser backup warning has been removed. */}

        <ErrorBoundary>
        {curProj
          ? <ProjectWorkspace
              proj={curProj} tab={projTab} setTab={setProjTab}
              clients={clients} rates={rates} cabLib={cabLib} company={company}
              onMutate={fn=>mutProj(curProj.id,fn)}
              onBack={closeProj} onPushXero={pushXero} pop={pop}
            />
          : <>
              {nav==="dashboard" && <Dashboard projects={projects} xero={xero} onOpen={openProj} setNav={setNav}/>}
              {nav==="projects"  && <ProjectsModule projects={projects} loading={projectsLoading} error={projectsError} company={company} onOpen={openProj} onTrash={trashProject} pop={pop} createProject={createProject}/>}
              {nav==="clients"   && <ClientsModule clients={clients} setClients={setClients} projects={projects} pop={pop}/>}
              {nav==="rates"     && <RateLibrary rates={rates} setRates={setRates} cabLib={cabLib} setCabLib={setCabLib} pop={pop}/>}
              {nav==="xero"      && <XeroModule projects={projects} xero={xero} setXero={setXero} mutProj={mutProj} pop={pop}/>}
              {nav==="settings"  && <SettingsModule company={company} setCompany={setCompany} trash={trash} setTrash={setTrash} onRestore={restoreProject} pop={pop}/>}
            </>
        }
        </ErrorBoundary>
      </main>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// DASHBOARD
// ═══════════════════════════════════════════════════════════════════════════
function Dashboard({projects, xero, onOpen, setNav}) {
  const pipeline   = projects.reduce((s,p)=>s+calc(p).total,0);
  const invoiced   = projects.reduce((s,p)=>s+(p.invoiced||0),0);
  const wonVal     = projects.filter(p=>["approved","active","complete"].includes(p.status)).reduce((s,p)=>s+calc(p).total,0);
  const activeJobs = projects.filter(p=>["approved","active"].includes(p.status)).length;
  const pending    = projects.filter(p=>["quoting","sent"].includes(p.status)).length;
  const won  = projects.filter(p=>["approved","active","complete"].includes(p.status)).length;
  const lost = projects.filter(p=>p.status==="lost").length;
  const winRate = (won+lost)>0 ? Math.round(won/(won+lost)*100) : null;

  return <div>
    <Hdr action={<Btn v="pri" sm onClick={()=>setNav("projects")}>+ New Project</Btn>}>Dashboard</Hdr>

    <Row wrap gap={12} sx={{marginBottom:20}}>
      <KPI label="Total Pipeline"  value={$$(pipeline,true)} sub={`${projects.length} projects`}/>
      <KPI label="Won & Active"    value={$$(wonVal,true)} sub="approved + active" color={T.green}/>
      <KPI label="Win Rate"        value={winRate!==null?`${winRate}%`:"—"} sub={`${won} won · ${lost} lost`} color={winRate>=50?T.green:T.yellow}/>
      <KPI label="Invoiced"        value={$$(invoiced,true)} sub="pushed to Xero" color={T.teal}/>
      <KPI label="Active Jobs"     value={activeJobs} sub="on-site" color={T.blue}/>
      <KPI label="Pending Quotes"  value={pending} sub="awaiting decision" color={T.yellow}/>
    </Row>

    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:14}}>
      <Card>
        <div style={{fontWeight:700,fontSize:13,marginBottom:14}}>Recent Projects</div>
        {projects.slice(0,6).map(p=>{
          const c=calc(p); const sm=STATUS[p.status]||STATUS.draft;
          return <div key={p.id} onClick={()=>onOpen(p.id)} style={{
            display:"flex",justifyContent:"space-between",alignItems:"center",
            padding:"9px 0",borderBottom:`1px solid ${T.border}`,cursor:"pointer"}}>
            <div>
              <div style={{fontWeight:600,fontSize:13,color:T.text}}>{p.name}</div>
              <div style={{color:T.faint,fontSize:11}}>{p.client} · {p.created}</div>
            </div>
            <Row gap={8}>
              <Bdg color={sm.color}>{sm.label}</Bdg>
              <span style={{fontFamily:T.mono,fontSize:12,color:T.accent,fontWeight:700}}>{$$(c.total,true)}</span>
            </Row>
          </div>;
        })}
        {!projects.length&&<div style={{color:T.faint,fontSize:12}}>No projects yet.</div>}
      </Card>

      <Card>
        <div style={{fontWeight:700,fontSize:13,marginBottom:14}}>Xero Activity</div>
        {(xero.log||[]).slice(0,8).map((l,i)=><div key={i} style={{display:"flex",gap:10,marginBottom:7,alignItems:"flex-start"}}>
          <span style={{color:T.faint,fontFamily:T.mono,fontSize:10,flexShrink:0,width:55}}>{l.ts}</span>
          <span style={{color:l.ok?T.green:T.red,fontSize:12}}>{l.msg}</span>
        </div>)}
        {!(xero.log||[]).length&&<div style={{color:T.faint,fontSize:12}}>No sync activity yet.</div>}
      </Card>
    </div>

    <Card>
      <div style={{fontWeight:700,fontSize:13,marginBottom:12}}>Pipeline by Status</div>
      <div style={{display:"flex",height:28,borderRadius:5,overflow:"hidden",marginBottom:10}}>
        {Object.entries(STATUS).map(([k,v])=>{
          const val=projects.filter(p=>p.status===k).reduce((s,p)=>s+calc(p).total,0);
          const pct=pipeline>0?val/pipeline*100:0;
          return pct>0?<div key={k} title={`${v.label}: ${$$(val,true)}`}
            style={{width:`${pct}%`,background:v.color,transition:"width 0.5s"}}/>:null;
        })}
        {pipeline===0&&<div style={{width:"100%",background:T.card2}}/>}
      </div>
      <Row gap={16} wrap>
        {Object.entries(STATUS).map(([k,v])=>{
          const val=projects.filter(p=>p.status===k).reduce((s,p)=>s+calc(p).total,0);
          return val>0?<div key={k} style={{display:"flex",alignItems:"center",gap:5,fontSize:11}}>
            <span style={{width:8,height:8,borderRadius:"50%",background:v.color,display:"inline-block"}}/>
            <span style={{color:T.muted}}>{v.label}:</span>
            <span style={{color:T.text,fontFamily:T.mono}}>{$$(val,true)}</span>
          </div>:null;
        })}
      </Row>
    </Card>
  </div>;
}

// ═══════════════════════════════════════════════════════════════════════════
// PROJECTS MODULE
// ═══════════════════════════════════════════════════════════════════════════
function ProjectsModule({projects,loading,error,company,onOpen,onTrash,pop,createProject}) {
  const [showNew,setShowNew]=useState(false);
  const [np,setNp]=useState({name:"",client:"",address:""});
  const [filter,setFilter]=useState("all");
  const [search,setSearch]=useState("");

  if (loading) return <div>
    <Hdr sub="Create, manage and track all project quotes and jobs." action={<Btn v="pri" onClick={()=>setShowNew(true)} disabled>+ New Project</Btn>}>Projects</Hdr>
    <Card hi sx={{marginBottom:16}}>
      <div style={{fontWeight:700,color:T.accent,marginBottom:10}}>Loading projects…</div>
      <div style={{color:T.muted,fontSize:13}}>Fetching your company projects from Supabase. Please wait.</div>
    </Card>
  </div>;

  if (error) return <div>
    <Hdr sub="Create, manage and track all project quotes and jobs." action={<Btn v="pri" onClick={()=>setShowNew(true)} disabled>+ New Project</Btn>}>Projects</Hdr>
    <Card hi sx={{marginBottom:16}}>
      <div style={{fontWeight:700,color:T.red,marginBottom:10}}>Unable to load projects</div>
      <div style={{color:T.muted,fontSize:13}}>{error}</div>
    </Card>
  </div>;

  const filtered = projects.filter(p=>{
    const ms = filter==="all"||p.status===filter;
    const mq = !search||[p.name,p.client,p.address].join(" ").toLowerCase().includes(search.toLowerCase());
    return ms&&mq;
  });

  async function create() {
    if(!np.name.trim()) return pop("Project name required.","error");
    try {
      await createProject({...np});
      setNp({name:"",client:"",address:""});
      setShowNew(false);
    } catch {}
  }

  return <div>
    <Hdr sub="Create, manage and track all project quotes and jobs."
      action={<Btn v="pri" onClick={()=>setShowNew(true)}>+ New Project</Btn>}>
      Projects
    </Hdr>

    {showNew&&<Card hi sx={{marginBottom:16}}>
      <div style={{fontWeight:700,marginBottom:12,color:T.accent}}>New Project</div>
      <Grid2 gap={10}>
        <Inp label="Project Name" value={np.name} onChange={v=>setNp(x=>({...x,name:v}))} placeholder="e.g. Smith Residence Extension"/>
        <Inp label="Client Name" value={np.client} onChange={v=>setNp(x=>({...x,client:v}))} placeholder="Client or company name"/>
      </Grid2>
      <Inp label="Site Address" value={np.address} onChange={v=>setNp(x=>({...x,address:v}))} placeholder="Full site address"/>
      <Row gap={8}><Btn v="pri" onClick={create}>Create Project</Btn><Btn onClick={()=>setShowNew(false)}>Cancel</Btn></Row>
    </Card>}

    <Row gap={10} sx={{marginBottom:14}}>
      <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search projects…"
        style={{flex:1,background:T.card,border:`1px solid ${T.border}`,borderRadius:5,
          padding:"7px 11px",color:T.text,fontSize:13,outline:"none",fontFamily:T.font}}/>
      <Row gap={4}>
        {["all",...Object.keys(STATUS)].map(k=>{
          const label=k==="all"?"All":(STATUS[k]?.label||k);
          return <div key={k} onClick={()=>setFilter(k)} style={{
            padding:"5px 11px",borderRadius:5,cursor:"pointer",fontSize:12,fontWeight:600,
            background:filter===k?T.accentDim:T.card,color:filter===k?T.accent:T.muted,
            border:`1px solid ${filter===k?T.accentBrd:T.border}`}}>{label}</div>;
        })}
      </Row>
    </Row>

    <div style={{overflowX:"auto"}}>
      <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
        <thead><tr style={{color:T.faint,textAlign:"left",fontSize:11,textTransform:"uppercase",letterSpacing:"0.05em"}}>
          {["Project","Status","Takeoff Items","Quote (inc. tax)","Invoiced",""].map(h=>
            <th key={h} style={{padding:"7px 10px",fontWeight:600}}>{h}</th>)}
        </tr></thead>
        <tbody>
          {filtered.map(p=>{
            const c=calc(p); const sm=STATUS[p.status]||STATUS.draft;
            return <tr key={p.id} style={{borderTop:`1px solid ${T.border}`,cursor:"pointer"}}
              onClick={()=>onOpen(p.id)}>
              <td style={{padding:"10px 10px"}}>
                <div style={{fontWeight:700,color:T.text}}>{p.name}</div>
                <div style={{color:T.faint,fontSize:11,marginTop:2}}>{p.client} · {p.created}</div>
              </td>
              <td style={{padding:"10px 10px"}}><Bdg color={sm.color}>{sm.label}</Bdg></td>
              <td style={{padding:"10px 10px"}}>
                <Bdg color={(p.takeoffItems||[]).length>0?T.green:T.faint}>
                  {(p.takeoffItems||[]).length>0?`✓ ${(p.takeoffItems||[]).length} items`:"Pending"}
                </Bdg>
              </td>
              <td style={{padding:"10px 10px",fontFamily:T.mono,color:c.total>0?T.accent:T.faint,fontWeight:700}}>
                {c.total>0?$$(c.total):"—"}
              </td>
              <td style={{padding:"10px 10px",fontFamily:T.mono,color:p.invoiced>0?T.green:T.faint}}>
                {p.invoiced>0?$$(p.invoiced):"—"}
              </td>
              <td style={{padding:"10px 10px"}}>
                <Row gap={5} onClick={e=>e.stopPropagation()}>
                  <Btn sm v="blu" onClick={()=>onOpen(p.id)}>Open</Btn>
                  <Btn sm v="red" onClick={()=>{
                    if(safeConfirm(`Move "${p.name}" to Trash? You can restore it from Settings.`)) onTrash(p.id);
                  }}>✕</Btn>
                </Row>
              </td>
            </tr>;
          })}
          {!filtered.length&&<tr><td colSpan={6} style={{padding:32,textAlign:"center",color:T.faint}}>
            No projects found.
          </td></tr>}
        </tbody>
      </table>
    </div>
  </div>;
}

// ═══════════════════════════════════════════════════════════════════════════
// PROJECT WORKSPACE
// ═══════════════════════════════════════════════════════════════════════════
function ProjectWorkspace({proj,tab,setTab,clients,rates,cabLib,company,onMutate,onBack,onPushXero,pop}) {
  const c = calc(proj);
  const sm = STATUS[proj.status]||STATUS.draft;

  const TABS = [
    {id:"takeoff",  label:"① Takeoff"},
    {id:"preset",   label:"② Cabinet Preset"},
    {id:"estimate", label:"③ Estimate"},
    {id:"quote",    label:"④ Quote"},
    {id:"schedule", label:"⑤ Schedule"},
    {id:"jobcost",  label:"⑥ Job Costs"},
    {id:"claims",   label:"⑦ Claims"},
    {id:"info",     label:"Project Info"},
  ];

  return <div>
    <Row gap={8} sx={{marginBottom:14,flexWrap:"wrap"}}>
      <span style={{color:T.muted,cursor:"pointer",fontSize:13}} onClick={onBack}>Projects</span>
      <span style={{color:T.faint}}>/</span>
      <span style={{fontWeight:700,fontSize:13,color:T.text}}>{proj.name}</span>
      <Bdg color={sm.color}>{sm.label}</Bdg>
      {sm.next&&<Btn sm v="gho" onClick={()=>{onMutate(p=>({...p,status:sm.next}));pop(`→ ${STATUS[sm.next].label}`);}}>
        Advance →
      </Btn>}
      <div style={{marginLeft:"auto",textAlign:"right"}}>
        <div style={{fontFamily:T.mono,fontSize:20,fontWeight:800,color:T.accent}}>{$$(c.total)}</div>
        <div style={{color:T.faint,fontSize:11}}>inc. GST{c.actTotal>0?` · ${$$(c.actTotal,true)} actual`:""}</div>
      </div>
    </Row>
    <Tabs tabs={TABS} active={tab} onChange={setTab}/>
    {tab==="takeoff"  && <TakeoffModule proj={proj} cabLib={cabLib} onMutate={onMutate} pop={pop}/>}
    {tab==="preset"   && <CabinetPreset proj={proj} pop={pop}/>}
    {tab==="estimate" && <EstimateModule proj={proj} rates={rates} cabLib={cabLib} onMutate={onMutate} c={c} pop={pop}/>}
    {tab==="quote"    && <QuoteModule proj={proj} company={company} c={c} onMutate={onMutate} pop={pop}/>}
    {tab==="schedule" && <ScheduleModule proj={proj} onMutate={onMutate} pop={pop}/>}
    {tab==="jobcost"  && <JobCostModule proj={proj} onMutate={onMutate} c={c} pop={pop}/>}
    {tab==="claims"   && <ClaimsModule proj={proj} onMutate={onMutate} c={c} onPushXero={onPushXero} pop={pop}/>}
    {tab==="info"     && <ProjectInfo proj={proj} clients={clients} onMutate={onMutate} pop={pop}/>}
  </div>;
}

// ═══════════════════════════════════════════════════════════════════════════
// CABINET PRESET — per project: choose which catalogue items feed the formula.
// ═══════════════════════════════════════════════════════════════════════════
function CabinetPreset({proj, pop}) {
  const [companyId,setCompanyId]=useState(null);
  const [items,setItems]=useState([]);
  const [sections,setSections]=useState([]);   // trade + section tabs
  const [preset,setPreset]=useState(null);
  const [rules,setRules]=useState(null);
  const [templates,setTemplates]=useState([]);
  const [loading,setLoading]=useState(true);
  const [err,setErr]=useState(null);
  const [modal,setModal]=useState(null);

  // Slot → catalogue-section mapping. Cabinetry is pre-wired by section NAME;
  // editable per project and saveable in a template (slot_map).
  const SLOTS=[
    {key:"carcass_item_id", label:"Carcass board", defaultSection:"Board",    rate:"$/m²"},
    {key:"front_item_id",   label:"Door/drawer front board", defaultSection:"Board", rate:"$/m²"},
    {key:"hinge_item_id",   label:"Hinge",   defaultSection:"Hardware", rate:"$/ea"},
    {key:"handle_item_id",  label:"Handle",  defaultSection:"Hardware", rate:"$/ea"},
    {key:"foot_item_id",    label:"Foot/leg",defaultSection:"Hardware", rate:"$/ea"},
  ];

  useEffect(()=>{(async()=>{
    setLoading(true); setErr(null);
    try{
      const { data:u }=await supabase.auth.getUser();
      const uid=u?.user?.id; if(!uid) throw new Error("Not signed in.");
      const { data:prof }=await supabase.from("profiles").select("company_id").eq("id",uid).single();
      const cid=prof?.company_id; setCompanyId(cid);
      const [{data:its},{data:secs},{data:r},{data:pr},{data:tpls}]=await Promise.all([
        supabase.from("catalogue_items").select("id,name,unit,rate,section_id").eq("company_id",cid).order("name"),
        supabase.from("catalogue_sections").select("id,name,parent_id").eq("company_id",cid),
        supabase.from("cabinet_formula").select("*").eq("company_id",cid).maybeSingle(),
        supabase.from("project_cabinet_preset").select("*").eq("project_id",proj.id).maybeSingle(),
        supabase.from("preset_templates").select("*").eq("company_id",cid).order("name"),
      ]);
      setItems(its||[]); setSections(secs||[]); setRules(r); setTemplates(tpls||[]);
      if(pr) setPreset(pr);
      else {
        const { data:created }=await supabase.from("project_cabinet_preset")
          .insert({project_id:proj.id,company_id:cid}).select().single();
        setPreset(created);
      }
    }catch(e){ setErr(e?.message||String(e)); }
    finally{ setLoading(false); }
  })();},[proj.id]);

  async function setField(field,value){
    setPreset(p=>({...p,[field]:value}));
    await supabase.from("project_cabinet_preset").update({[field]:value||null,updated_at:new Date().toISOString()}).eq("project_id",proj.id);
  }

  // slot_map stored on the preset row (jsonb) lets a slot point at a section by id.
  const slotMap=preset?.slot_map||{};
  async function setSlotSection(slotKey,sectionId){
    const next={...slotMap,[slotKey]:sectionId||undefined};
    setPreset(p=>({...p,slot_map:next}));
    await supabase.from("project_cabinet_preset").update({slot_map:next}).eq("project_id",proj.id);
  }

  // Resolve which section a slot should filter on: explicit slot_map → else
  // match a section whose name contains the slot's defaultSection word.
  function sectionForSlot(slot){
    if(slotMap[slot.key]) return slotMap[slot.key];
    const want=slot.defaultSection.toLowerCase();
    const hit=sections.find(s=>s.parent_id&&s.name.toLowerCase().includes(want))
            ||sections.find(s=>s.name.toLowerCase().includes(want));
    return hit?.id||null;
  }
  function itemsForSlot(slot){
    const secId=sectionForSlot(slot);
    const list = secId ? items.filter(it=>it.section_id===secId) : items;
    return [{value:"",label:"— not set —"},
      ...list.map(it=>({value:it.id,label:`${it.name} ($${(+it.rate).toFixed(2)}${it.unit?"/"+it.unit:""})`}))];
  }

  async function applyTemplate(t){
    const patch={
      carcass_item_id:t.carcass_item_id, front_item_id:t.front_item_id,
      hinge_item_id:t.hinge_item_id, handle_item_id:t.handle_item_id,
      foot_item_id:t.foot_item_id, slot_map:t.slot_map||{},
    };
    setPreset(p=>({...p,...patch}));
    await supabase.from("project_cabinet_preset").update(patch).eq("project_id",proj.id);
    setModal(null); pop(`Applied template "${t.name}".`);
  }
  async function saveTemplate(name){
    setModal(null); if(!name) return;
    const row={company_id:companyId,name,trade:"cabinetry",
      carcass_item_id:preset?.carcass_item_id||null, front_item_id:preset?.front_item_id||null,
      hinge_item_id:preset?.hinge_item_id||null, handle_item_id:preset?.handle_item_id||null,
      foot_item_id:preset?.foot_item_id||null, slot_map:slotMap};
    const { data,error }=await supabase.from("preset_templates").insert(row).select().single();
    if(error) return pop(error.message,"error");
    setTemplates(t=>[...t,data]); pop(`Saved template "${name}" — reuse it on any project.`);
  }
  async function delTemplate(id){
    await supabase.from("preset_templates").delete().eq("id",id);
    setTemplates(t=>t.filter(x=>x.id!==id)); pop("Template deleted.");
  }

  if(loading) return <Card><div style={{color:T.muted,fontSize:13}}>Loading preset…</div></Card>;
  if(err) return <Card><div style={{color:T.red,fontSize:13}}>Couldn't load: {err}</div>
    <div style={{color:T.faint,fontSize:12,marginTop:6}}>If this mentions a missing table, run the Layer 3 & 4 SQL in Supabase.</div></Card>;

  const noItems=items.length===0;
  const subSections=sections.filter(s=>s.parent_id);
  const rateOf=id=>{ const it=items.find(x=>x.id===id); return it?+it.rate:0; };
  const sampleRates={
    carcass:rateOf(preset?.carcass_item_id), front:rateOf(preset?.front_item_id),
    hinge:rateOf(preset?.hinge_item_id), handle:rateOf(preset?.handle_item_id), foot:rateOf(preset?.foot_item_id),
  };
  const sample=rules?priceCabinet({type:"Base",width:1000,height:720,depth:560,doors:2,drawers:0},rules,sampleRates):null;

  return <div>
    {modal?.type==="saveTpl"&&<PromptModal title="Save as preset template"
      label="Template name" placeholder="e.g. Standard Kitchen, Budget Laundry"
      confirmText="Save template" onConfirm={saveTemplate} onCancel={()=>setModal(null)}/>}
    {modal?.type==="applyTpl"&&<Modal title="Apply a preset template" onClose={()=>setModal(null)}>
      {templates.length===0
        ? <div style={{color:T.faint,fontSize:13}}>No templates yet. Set up this project's preset, then “Save as template”.</div>
        : templates.map(t=><div key={t.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",borderBottom:`1px solid ${T.border}`}}>
            <span style={{fontSize:13,color:T.text,fontWeight:600}}>{t.name}</span>
            <Row gap={6}>
              <Btn sm v="grn" onClick={()=>applyTemplate(t)}>Apply</Btn>
              <Btn sm v="red" onClick={()=>delTemplate(t.id)}>✕</Btn>
            </Row>
          </div>)}
    </Modal>}

    <Card hi sx={{marginBottom:14}}>
      <Row gap={8} sx={{flexWrap:"wrap",alignItems:"center"}}>
        <div>
          <div style={{fontWeight:700,fontSize:13,marginBottom:4}}>Cabinet pricing for this project</div>
          <div style={{color:T.faint,fontSize:12,lineHeight:1.6,maxWidth:560}}>
            Pick the materials and hardware for this job — each dropdown shows only items from the matching catalogue section. Change them and every cabinet re-prices. Save a setup as a template to reuse across projects.
          </div>
        </div>
        <div style={{marginLeft:"auto",display:"flex",gap:8}}>
          <Btn sm v="gho" onClick={()=>setModal({type:"applyTpl"})}>📋 Apply template</Btn>
          <Btn sm v="pri" onClick={()=>setModal({type:"saveTpl"})}>💾 Save as template</Btn>
        </div>
      </Row>
    </Card>

    {noItems
      ? <Card><div style={{color:T.muted,fontSize:13}}>Your catalogue is empty. Add board and hardware items in <b>Rate Library → Catalogue</b> first, then choose them here.</div></Card>
      : <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
        <Card>
          <div style={{fontWeight:700,fontSize:12,color:T.accent,marginBottom:10,textTransform:"uppercase",letterSpacing:"0.05em"}}>Materials & hardware for this project</div>
          {SLOTS.map(slot=>{
            const secId=sectionForSlot(slot);
            const secName=sections.find(s=>s.id===secId)?.name;
            return <div key={slot.key} style={{marginBottom:12}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:2}}>
                <span style={{fontSize:13,color:T.muted}}>{slot.label} <span style={{color:T.faint,fontSize:11}}>({slot.rate})</span></span>
                <select value={secId||""} onChange={e=>setSlotSection(slot.key,e.target.value)}
                  title="Which catalogue section this dropdown pulls from"
                  style={{background:"transparent",border:"none",color:T.faint,fontSize:11,cursor:"pointer",textAlign:"right"}}>
                  <option value="">auto: {slot.defaultSection}</option>
                  {subSections.map(s=><option key={s.id} value={s.id}>from: {s.name}</option>)}
                </select>
              </div>
              <Sel value={preset?.[slot.key]||""} onChange={v=>setField(slot.key,v)} options={itemsForSlot(slot)}/>
              {secId&&itemsForSlot(slot).length<=1&&<div style={{color:T.yellow,fontSize:10,marginTop:2}}>
                No items in “{secName}”. Add some in the catalogue, or repoint the section above.
              </div>}
            </div>;
          })}
          <div style={{color:T.faint,fontSize:11,marginTop:2}}>
            Each dropdown is filtered to one catalogue section so the list stays short. Use the small “from:” selector on the right to repoint a slot to a different section.
          </div>
        </Card>

        <Card hi>
          <div style={{fontWeight:700,fontSize:12,color:T.muted,marginBottom:10,textTransform:"uppercase",letterSpacing:"0.05em"}}>Sample: 2-Door 1000mm Base</div>
          {!rules
            ? <div style={{color:T.faint,fontSize:12}}>Set up the company formula in Rate Library → Cabinet Formula first.</div>
            : sample&&<div style={{background:T.bg,borderRadius:8,padding:14,border:`1px solid ${T.border}`}}>
              {[
                ["Carcass",`${sample.carcassM2} m²`,sample.carcassCost],
                ["Fronts",`${sample.frontM2} m²`,sample.frontCost],
                ["Hinges",`${sample.hinges}`,sample.hingeCost],
                ["Handles",`${sample.handles}`,sample.handleCost],
                ["Feet",`${sample.feet}`,sample.footCost],
                ["Assembly","",sample.assembly],
              ].map(([l,d,v])=>(v>0||l==="Assembly")&&<div key={l} style={{display:"flex",justifyContent:"space-between",fontSize:12,marginBottom:5}}>
                <span style={{color:T.text}}>{l} <span style={{color:T.faint,fontSize:11,fontFamily:T.mono}}>{d}</span></span>
                <span style={{fontFamily:T.mono,color:T.muted}}>{$$(v)}</span>
              </div>)}
              <div style={{display:"flex",justifyContent:"space-between",borderTop:`1px solid ${T.border}`,paddingTop:8,marginTop:4}}>
                <span style={{fontWeight:800,fontSize:13}}>Per cabinet</span>
                <span style={{fontFamily:T.mono,fontWeight:800,fontSize:15,color:T.accent}}>{$$(sample.total)}</span>
              </div>
            </div>}
          {(!preset?.carcass_item_id||!preset?.front_item_id)&&<div style={{color:T.yellow,fontSize:11,marginTop:10}}>
            ⚠ Choose at least a carcass and front board for cabinets to price on this project.
          </div>}
        </Card>
      </div>}
  </div>;
}

// ═══════════════════════════════════════════════════════════════════════════
// TAKEOFF MODULE
// ═══════════════════════════════════════════════════════════════════════════
function TakeoffModule({proj, cabLib, onMutate, pop}) {
  const [activeTool, setActiveTool] = useState("select");
  const [activeLayer, setActiveLayer] = useState(null);
  const [pdfMeta, setPdfMeta] = useState(null); // {name, numPages, thumbs}
  const [currentPage, setCurrentPage] = useState(0);
  const [analyzing, setAnalyzing] = useState(false);
  const [aLog, setALog] = useState([]);
  const [progress, setProgress] = useState({done:0,total:0});
  const [showAddItem, setShowAddItem] = useState(false);
  const [newItem, setNewItem] = useState({type:"area",label:"",qty:0,unit:"m²",layerId:null});
  // ── On-plan measurement (scale calibration + linear/area/count tools)
  const [measure, setMeasure] = useState(null); // {pageIdx, img, w, h, tool, pts:[{x,y}], counts:[{x,y}]}
  const calibRef = useRef({}); // pageIdx -> mm per image px
  const rawFile = useRef(null);
  const fileInput = useRef(null);
  const logRef = useRef(null);

  const layers = proj.takeoffLayers||[];
  const items  = proj.takeoffItems||[];

  const log = (msg, type="info") => setALog(l=>[...l,{msg,type,ts:new Date().toLocaleTimeString()}]);

  useEffect(()=>{ if(logRef.current) logRef.current.scrollTop=logRef.current.scrollHeight; },[aLog]);

  // ── PDF.js loader
  async function pdfjs() {
    if(window.pdfjsLib) return window.pdfjsLib;
    await new Promise((res,rej)=>{
      const s=document.createElement("script");
      s.src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
      s.onload=res; s.onerror=rej; document.head.appendChild(s);
    });
    window.pdfjsLib.GlobalWorkerOptions.workerSrc=
      "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
    return window.pdfjsLib;
  }

  // ── Read file as ArrayBuffer fresh each time (never store in state)
  async function getBuffer() {
    if(!rawFile.current) throw new Error("File reference lost — please re-upload.");
    return new Promise((res,rej)=>{
      const r=new FileReader(); r.onload=()=>res(r.result); r.onerror=rej;
      r.readAsArrayBuffer(rawFile.current);
    });
  }

  // ── Rasterise single page to base64 JPEG
  async function rasterise(pgNum1, dpi, pdfDoc) {
    const pg = await pdfDoc.getPage(pgNum1);
    const vpN = pg.getViewport({scale:1});
    const sc = Math.min(dpi/72, 2100/Math.max(vpN.width, vpN.height));
    const vp = pg.getViewport({scale:sc});
    const cv = document.createElement("canvas");
    cv.width=Math.round(vp.width); cv.height=Math.round(vp.height);
    await pg.render({canvasContext:cv.getContext("2d"),viewport:vp}).promise;
    return cv.toDataURL("image/jpeg",0.88).split(",")[1];
  }

  // ── Handle file drop / select
  async function handleFile(file) {
    if(!file||file.type!=="application/pdf") return pop("Please upload a PDF file.","error");
    rawFile.current = file;
    setALog([]);
    const mb = (file.size/1048576).toFixed(1);
    log(`Loaded: ${file.name} (${mb} MB)`,"success");

    const lib = await pdfjs();
    const buf = await getBuffer();
    const pdf = await lib.getDocument({data:buf.slice(0)}).promise;
    const n = pdf.numPages;
    log(`${n} pages detected — generating preview thumbnails…`);

    const thumbs=[];
    const lim=Math.min(n,24);
    for(let i=1;i<=lim;i++){
      const pg=await pdf.getPage(i);
      const vpN=pg.getViewport({scale:1});
      const sc=Math.min(0.18,200/Math.max(vpN.width,vpN.height));
      const vp=pg.getViewport({scale:sc});
      const cv=document.createElement("canvas");
      cv.width=Math.round(vp.width); cv.height=Math.round(vp.height);
      await pg.render({canvasContext:cv.getContext("2d"),viewport:vp}).promise;
      thumbs.push(cv.toDataURL("image/jpeg",0.65));
    }
    setPdfMeta({name:file.name,numPages:n,thumbs});
    setCurrentPage(0);
    log(`Preview ready (${thumbs.length} thumbnails). Click AI Extract to analyse all ${n} pages.`,"success");
  }

  // ── AI API call — connection-aware:
  //  · "claude" (default): bare call, works only inside Claude.ai (proxied)
  //  · "proxy": your own server endpoint holding the API key (PRODUCTION setup)
  //  · "direct": API key in browser (DEV ONLY — key is visible to the user)
  async function callAI(content, maxTok=1800) {
    let aiCfg={mode:"proxy",endpoint:"/api/ai",apiKey:""}; // default: built-in Next.js server proxy
    try{ aiCfg={...aiCfg,...JSON.parse(localStorage.getItem("qf_ai")||"{}")}; }catch{}
    const url = aiCfg.mode==="proxy"&&aiCfg.endpoint ? aiCfg.endpoint : "https://api.anthropic.com/v1/messages";
    const headers={"Content-Type":"application/json"};
    if(aiCfg.mode==="direct"&&aiCfg.apiKey){
      headers["x-api-key"]=aiCfg.apiKey;
      headers["anthropic-version"]="2023-06-01";
      headers["anthropic-dangerous-direct-browser-access"]="true";
    }
    const r=await fetch(url,{
      method:"POST",headers,
      body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:maxTok,
        messages:[{role:"user",content}]})
    });
    const d=await r.json();
    if(d.error) throw new Error(typeof d.error==="object"?d.error.message||JSON.stringify(d.error):String(d.error));
    return d.content.map(b=>b.text||"").join("");
  }

  // ── Robust JSON parse — repairs truncated responses by closing open
  // strings/arrays/objects via bracket-stack. Critical for large cabinet
  // takeoffs where output can hit the token cap mid-array.

  // ── Fatal AI-provider errors: stop the run immediately instead of burning
  //    through every batch against a dead key/account (e.g. 26× quota errors)
  const isFatalAI = m => /exceeded your current quota|insufficient_quota|billing|credit balance|invalid api key|incorrect api key|authentication_error|invalid x-api-key|unauthorized/i.test(m||"");
  const friendlyAI = m => /quota|billing|credit/i.test(m||"")
    ? "Your AI provider account has no available credit. OpenAI: platform.openai.com → Settings → Billing → add credits. Anthropic: console.anthropic.com → Billing. Then restart the dev server (npm run dev) and re-run."
    : "Your AI key was rejected. Check the key in .env.local is correct and active, then restart the dev server (npm run dev).";

  function parseJSON(text) {
    const s=text.replace(/```json/g,"").replace(/```/g,"").trim();
    const start=s.indexOf("{");
    if(start<0) return null;
    let t=s.slice(start);
    // Trim trailing prose after the JSON if the model added any
    try { return JSON.parse(t); } catch {}
    // Bracket-stack repair: walk the string tracking structure
    const stack=[];
    let inStr=false, esc=false, lastGood=0;
    for(let i=0;i<t.length;i++){
      const ch=t[i];
      if(esc){ esc=false; continue; }
      if(ch==="\\"&&inStr){ esc=true; continue; }
      if(ch==='"'){ inStr=!inStr; continue; }
      if(inStr) continue;
      if(ch==="{"||ch==="[") stack.push(ch);
      else if(ch==="}"||ch==="]"){ stack.pop(); if(stack.length===0){ lastGood=i+1; break; } }
      if(ch===","||ch==="}"||ch==="]") lastGood=i; // last structurally safe cut point
    }
    if(stack.length===0&&lastGood>0){
      try { return JSON.parse(t.slice(0,lastGood)); } catch {}
    }
    // Truncated: cut back to last safe point, then close everything still open
    let cut=t.slice(0,lastGood>0?lastGood:t.length);
    // If we cut mid-string, drop back to the last quote-balanced comma
    // Recompute open stack for the cut segment
    const st2=[]; let inS2=false, e2=false;
    for(let i=0;i<cut.length;i++){
      const ch=cut[i];
      if(e2){ e2=false; continue; }
      if(ch==="\\"&&inS2){ e2=true; continue; }
      if(ch==='"'){ inS2=!inS2; continue; }
      if(inS2) continue;
      if(ch==="{"||ch==="[") st2.push(ch);
      else if(ch==="}"||ch==="]") st2.pop();
    }
    if(inS2) cut+='"';
    // Remove a trailing comma or dangling "key": before closing
    cut=cut.replace(/,\s*$/,"").replace(/,?\s*"[^"]*"\s*:\s*$/,"");
    while(st2.length) cut+= st2.pop()==="{"?"}":"]";
    try { return JSON.parse(cut); } catch { return null; }
  }

  // ── Main AI extraction pipeline — trade-scoped
  async function runExtract() {
    if(!rawFile.current) return pop("Upload a PDF first.","error");
    setAnalyzing(true);
    setProgress({done:0,total:0});

    const activeTrades = (proj.trades||[]).length>0
      ? (proj.trades||[]).map(k=>TRADES[k]).filter(Boolean)
      : Object.values(TRADES);
    const tradeKeys = (proj.trades||[]).length>0 ? proj.trades : TRADE_KEYS;
    const cabinetryActive = tradeKeys.includes("cabinetry")||(proj.trades||[]).length===0;
    const joineryActive   = tradeKeys.includes("joinery")  ||(proj.trades||[]).length===0;
    const scanFocusDesc   = activeTrades.map(t=>t.scanFocus).join("; ");
    const extractFocusDesc= activeTrades.map(t=>`[${t.label}]: ${t.extractFocus}`).join("\n");

    log(`Trades in scope: ${activeTrades.map(t=>t.label).join(", ")}`);

    try {
      const lib = await pdfjs();
      const buf = await getBuffer();
      const pdfDoc = await lib.getDocument({data:buf.slice(0)}).promise;
      const total = pdfDoc.numPages;

      // ── PHASE 1: classify pages — trade-aware
      const SCAN=8;
      const scanBatches=[];
      for(let i=0;i<total;i+=SCAN) scanBatches.push([...Array(Math.min(SCAN,total-i))].map((_,j)=>i+j));
      setProgress({done:0,total:scanBatches.length});
      log(`Phase 1: classifying ${total} pages across ${scanBatches.length} scan batches…`);

      const scores={};
      for(let i=0;i<scanBatches.length;i++){
        const idxs=scanBatches[i];
        log(`Scan ${i+1}/${scanBatches.length}: pages ${idxs[0]+1}–${idxs[idxs.length-1]+1}`);
        const imgs=await Promise.all(idxs.map(idx=>rasterise(idx+1,55,pdfDoc)));
        const blocks=imgs.map(b=>({type:"image",source:{type:"base64",media_type:"image/jpeg",data:b}}));
        const prompt=`Score each drawing sheet for construction takeoff. Active trades: ${activeTrades.map(t=>t.label).join(", ")}.
Prioritise: ${scanFocusDesc}.
Score 3=highly relevant schedule/plan for selected trades, 2=useful general dims/annotations, 1=low value unrelated services, 0=title/photo/blank.
${cabinetryActive?"IMPORTANT: score=3 for any kitchen plan/elevation, bathroom elevation, wardrobe detail, cabinet schedule, ensuite detail, joinery millwork sheet.":""}
${joineryActive?"IMPORTANT: score=3 for window schedule, door schedule, sliding door schedule, joinery schedule pages.":""}
Pages: ${idxs.map(x=>x+1).join(",")}. JSON only: {"pages":[{"page":1,"score":3,"type":"floor plan with kitchen layout"}]}`;
        try {
          const res=await callAI([...blocks,{type:"text",text:prompt}],600);
          const p=parseJSON(res);
          (p?.pages||[]).forEach(x=>{scores[x.page-1]={score:x.score,type:x.type||""};});
        } catch(e) {
          if(isFatalAI(e.message)) throw new Error(friendlyAI(e.message));
          log(`Scan ${i+1} failed (${(e.message||"").slice(0,90)}) — pages kept for Phase 2 anyway.`,"error");
          idxs.forEach(idx=>{scores[idx]={score:2,type:"unclassified"};});
        }
        setProgress({done:i+1,total:scanBatches.length});
      }

      const highVal=Object.entries(scores).filter(([,v])=>v.score>=2).map(([k])=>parseInt(k)).sort((a,b)=>a-b);
      const skipped=Object.entries(scores).filter(([,v])=>v.score<2).map(([k])=>parseInt(k)+1);
      log(`Phase 1 done. ${highVal.length} pages selected, ${skipped.length} skipped.`,"success");
      if(skipped.length) log(`Skipped: pages ${skipped.join(", ")}`);

      // ── PHASE 2: extract at 175dpi, 4 per batch
      const EXTRACT_SCHEMA=`{"buildingType":"","confidence":"high/medium/low","scale":"","storeys":0,"floorArea":0,"wallLength":0,"roofArea":0,"windows":0,"doors":0,"slidingDoors":0,"windowSchedule":[{"ref":"","size":"","type":"","spec":"","qty":0,"headHeight":"","sillHeight":""}],"slidingDoorSchedule":[{"ref":"","size":"","type":"","panels":0,"spec":"","qty":0}],"doorSchedule":[{"ref":"","size":"","frameType":"","headHeight":"","frl":"","hardware":"","spec":"","qty":0}],"cabinetryUnits":[{"unit":"e.g. Unit 1 or Apartment 1 or (blank if single dwelling)","rooms":[{"room":"e.g. Kitchen / Butlers / Laundry / Bathroom / Ensuite / Master WIR / Bed 2 Robe / TV Unit","cabinets":[{"type":"Base/Overhead/Tall/Panel/Hardware/Appliance","config":"e.g. 2 Door, 3 Drawer, 1 Door, End Panel, Kickboard, Wall Panel, Walk Brackets","width":0,"qty":0,"notes":""}],"benchtop":{"material":"e.g. stone/laminate/20mm reconstituted stone","linearMetres":0},"splashback":{"material":"","area":0}}]}],"rooms":[{"name":"","area":0}],"notes":"","dims":[]}`;

      const EXTRACT=`You are an expert cabinetmaker and quantity surveyor reading architectural CAD drawings to produce a CABINET-BY-CABINET joinery takeoff.
Active trades: ${activeTrades.map(t=>t.label).join(", ")}.

EXTRACTION REQUIREMENTS:
${extractFocusDesc}

${cabinetryActive?`CABINETRY — THIS IS THE PRIORITY. Produce a detailed cabinet-level takeoff exactly like a cabinetmaker would:

STRUCTURE: For multi-unit buildings (apartments/townhouses), group by UNIT (Unit 1, Unit 2, etc). For a single dwelling, use one unit with blank name.
Within each unit, group by ROOM: Kitchen, Butlers Pantry, Linen, Laundry, Bathroom, Ensuite, Powder, Master Bed WIR (walk-in robe), Bed 2 Robe, Bed 3 Robe, TV Unit / Entertainment, Study, Mudroom, etc.

For EACH room, list EVERY individual cabinet as a line with:
- type: one of Base, Overhead (wall), Tall (pantry/broom), Panel, Hardware, Appliance
- config: the door/drawer configuration — "1 Door", "2 Door", "1 Drawer", "2 Drawer", "3 Drawer", "4 Drawer", "5 Drawer", or for panels "End Panel", "Kickboard", "Wall Panel", "Feature Panel", "Filler", "Bulkhead", "Floating Shelf", or hardware like "Walk Brackets", "Hanging Rail"
- width: cabinet width in mm (read from elevation dimensions; standard widths 300-1200mm)
- qty: how many of this exact cabinet
- notes: MAXIMUM 8 WORDS — e.g. "sink cabinet", "integrated dishwasher", "pull-out bin", "desk pedestal DWR". Do NOT write sentences or cite which elevation it appears on.

Also capture per-room benchtop (material + linear metres) and splashback (material + m²) where shown.

READ KITCHEN AND BATHROOM ELEVATIONS CAREFULLY — each cabinet face in an elevation is a separate line item. Count drawers vs doors from the elevation. Estimate widths from dimension strings. A typical apartment kitchen has 10-15 cabinet lines. Do NOT just give a single summary line — break out every cabinet.

STANDARD CABINET SIZES (use to sanity-check widths): Base cabinets H720×D560, Overhead cabinets H720×D320, Tall cabinets H2400×D560. Widths come in 50mm increments from 300 to 1200mm — snap estimated widths to the nearest 50mm.

MULTI-UNIT REPLICATION: If the drawings show one TYPICAL apartment layout that repeats (e.g. "Units 1-4 similar" or floor plans showing identical apartments), still output a SEPARATE unit entry for each actual unit, replicating the cabinet list. If you can only identify the typical layout but not the unit count, use unit name "Typical Unit" and note the repetition in notes.

If you genuinely cannot read individual cabinets, estimate them from the run length (e.g. a 3600mm kitchen run ≈ 6 base cabinets at 600mm).`:""}
${joineryActive?`JOINERY — READ EVERY SCHEDULE ROW: window ref/size/type/spec/qty, door ref/size/frame/FRL/hardware, sliding door ref/size/panels/spec`:""}

Output ONLY valid COMPACT JSON (single line, no pretty-printing, no markdown, no explanation) matching this schema exactly:
${EXTRACT_SCHEMA}`;

      // Cabinetry needs small batches + high resolution + big output budget:
      // a single kitchen sheet can produce 20+ cabinet lines of JSON. Pages 1-3
      // of a dense interiors set previously blew the token cap and the whole
      // batch was lost — 2 pages per batch + 8000 tokens prevents that.
      const ANA=cabinetryActive?2:4;
      const EXTRACT_DPI=cabinetryActive?190:175;
      const MAX_TOK=cabinetryActive?8000:2500;
      const anaBatches=[];
      for(let i=0;i<highVal.length;i+=ANA) anaBatches.push(highVal.slice(i,i+ANA));
      log(`Phase 2: ${highVal.length} pages in ${anaBatches.length} batches at ${EXTRACT_DPI}dpi…`);
      setProgress({done:0,total:anaBatches.length});

      const parsedBatches=[];
      let consecFail=0;
      for(let i=0;i<anaBatches.length;i++){
        const idxs=anaBatches[i];
        log(`Batch ${i+1}/${anaBatches.length}: pages ${idxs.map(x=>x+1).join(", ")}`);
        const imgs=await Promise.all(idxs.map(idx=>rasterise(idx+1,EXTRACT_DPI,pdfDoc)));
        const blocks=imgs.map(b=>({type:"image",source:{type:"base64",media_type:"image/jpeg",data:b}}));
        try {
          const res=await callAI([...blocks,{type:"text",text:EXTRACT}],MAX_TOK);
          const parsed=parseJSON(res);
          if(parsed){
            const cabLines=(parsed.cabinetryUnits||[]).reduce((s,u)=>s+(u.rooms||[]).reduce((s2,r)=>s2+(r.cabinets||[]).length,0),0);
            const roomNames=(parsed.cabinetryUnits||[]).flatMap(u=>(u.rooms||[]).map(r=>r.room)).filter(Boolean);
            parsedBatches.push(parsed); consecFail=0;
            log(`Batch ${i+1} parsed: ${cabLines} cabinet lines${roomNames.length?` (${roomNames.join(", ")})`:""}.`,"success");
          } else {
            log(`Batch ${i+1} WARNING: response could not be parsed — pages ${idxs.map(x=>x+1).join(", ")} data lost. Try re-running.`,"error");
          }
        } catch(e) {
          if(isFatalAI(e.message)) throw new Error(friendlyAI(e.message));
          consecFail++;
          log(`Batch ${i+1} error: ${e.message}`,"error");
          if(consecFail>=3&&parsedBatches.length===0)
            throw new Error("3 consecutive batch failures with no successful data — run aborted. See the Analysis Log above for the underlying error.");
        }
        setProgress({done:i+1,total:anaBatches.length});
      }

      if(!parsedBatches.length) throw new Error("No parseable results from any batch — try re-running the extraction.");

      // ── MERGE — preserves unit→room→cabinet structure
      log(`Merging ${parsedBatches.length} parsed batch result${parsedBatches.length>1?"s":""}…`);
      let merged;

      if(parsedBatches.length===1) {
        merged=parsedBatches[0];
      } else {
        // Deterministic merge in code — no second AI call needed for structure.
        // Scalars: MAX (same plan repeats across sheets). Schedules: dedupe by ref.
        // cabinetryUnits: merge by unit name, then by room name, concatenating cabinet lines.
        merged={buildingType:"",confidence:"medium",scale:"",storeys:0,floorArea:0,wallLength:0,roofArea:0,
          windows:0,doors:0,slidingDoors:0,windowSchedule:[],doorSchedule:[],slidingDoorSchedule:[],
          cabinetryUnits:[],rooms:[],notes:"",dims:[]};
        const schedByRef={ws:{},ds:{},sds:{}};
        const roomAreas={};
        const unitMap={}; // unitName -> { unit, rooms: {roomName -> {room, cabinets[], benchtop, splashback}} }
        const noteSet=new Set();
        let highConf=0;

        parsedBatches.forEach(p=>{
          ["floorArea","wallLength","roofArea","windows","doors","slidingDoors","storeys"].forEach(k=>{
            if((p[k]||0)>merged[k]) merged[k]=p[k];
          });
          if((p.buildingType||"").length>merged.buildingType.length) merged.buildingType=p.buildingType;
          if((p.scale||"").length>merged.scale.length) merged.scale=p.scale;
          if(p.confidence==="high") highConf++;
          if(p.notes) noteSet.add(p.notes.slice(0,200));
          (p.windowSchedule||[]).forEach(w=>{ if(w.ref&&(!schedByRef.ws[w.ref]||JSON.stringify(w).length>JSON.stringify(schedByRef.ws[w.ref]).length)) schedByRef.ws[w.ref]=w; });
          (p.doorSchedule||[]).forEach(d=>{ if(d.ref&&(!schedByRef.ds[d.ref]||JSON.stringify(d).length>JSON.stringify(schedByRef.ds[d.ref]).length)) schedByRef.ds[d.ref]=d; });
          (p.slidingDoorSchedule||[]).forEach(d=>{ if(d.ref&&(!schedByRef.sds[d.ref]||JSON.stringify(d).length>JSON.stringify(schedByRef.sds[d.ref]).length)) schedByRef.sds[d.ref]=d; });
          (p.rooms||[]).forEach(r=>{ if(r.name&&(r.area||0)>(roomAreas[r.name]||0)) roomAreas[r.name]=r.area; });

          (p.cabinetryUnits||[]).forEach(u=>{
            // Normalise: only numbered units stay distinct ("Unit 2", "Apartment 3").
            // Unnumbered names ("", "Typical Unit", "Grassdale Residence") all collapse
            // into one default unit so single dwellings don't split across batches.
            let uName=(u.unit||"").trim();
            const numbered=uName.match(/\b(unit|apartment|apt|townhouse|villa|lot|level)\s*\d+/i);
            if(!numbered) uName="Unit 1";
            if(!unitMap[uName]) unitMap[uName]={unit:uName,rooms:{}};
            (u.rooms||[]).forEach(rm=>{
              const rName=(rm.room||"").trim()||"Unspecified";
              if(!unitMap[uName].rooms[rName]) unitMap[uName].rooms[rName]={room:rName,cabinets:[],benchtop:null,splashback:null};
              const target=unitMap[uName].rooms[rName];
              (rm.cabinets||[]).forEach(c=>{
                if(!c.type&&!c.config) return;
                // dedupe identical cabinet lines from overlapping batches
                const key=`${(c.type||"").toLowerCase()}|${(c.config||"").toLowerCase()}|${c.width||0}`;
                const existing=target.cabinets.find(x=>`${(x.type||"").toLowerCase()}|${(x.config||"").toLowerCase()}|${x.width||0}`===key);
                if(existing) { existing.qty=Math.max(existing.qty||0,c.qty||0); }
                else target.cabinets.push({type:c.type||"",config:c.config||"",width:c.width||0,qty:c.qty||1,notes:c.notes||""});
              });
              if(rm.benchtop&&(rm.benchtop.linearMetres||0)>(target.benchtop?.linearMetres||0)) target.benchtop=rm.benchtop;
              if(rm.splashback&&(rm.splashback.area||0)>(target.splashback?.area||0)) target.splashback=rm.splashback;
            });
          });
        });

        merged.windowSchedule=Object.values(schedByRef.ws);
        merged.doorSchedule=Object.values(schedByRef.ds);
        merged.slidingDoorSchedule=Object.values(schedByRef.sds);
        merged.rooms=Object.entries(roomAreas).map(([name,area])=>({name,area}));
        merged.cabinetryUnits=Object.values(unitMap).map(u=>({unit:u.unit,rooms:Object.values(u.rooms)}));
        merged.confidence=highConf>=parsedBatches.length/2?"high":"medium";
        merged.notes=[...noteSet].slice(0,4).join(" · ");
      }

      if(!merged) throw new Error("Could not parse merged results — try again.");

      const cabUnits=merged.cabinetryUnits||[];
      const totalCabLines=cabUnits.reduce((s,u)=>s+(u.rooms||[]).reduce((s2,r)=>s2+(r.cabinets||[]).length,0),0);
      const totalCabQty=cabUnits.reduce((s,u)=>s+(u.rooms||[]).reduce((s2,r)=>s2+(r.cabinets||[]).reduce((s3,c)=>s3+(c.qty||0),0),0),0);

      log(`✓ ${merged.buildingType||"Building"} · ${merged.confidence||"?"} confidence${merged.scale?" · "+merged.scale:""}`, "success");
      if((merged.rooms||[]).length) log(`Rooms: ${merged.rooms.filter(r=>r.name).map(r=>r.name).join(", ")}`);
      if((merged.windowSchedule||[]).length) log(`Windows: ${merged.windowSchedule.map(w=>w.ref).filter(Boolean).join(", ")}`, "success");
      if((merged.doorSchedule||[]).length) log(`Doors: ${merged.doorSchedule.map(d=>d.ref).filter(Boolean).join(", ")}`, "success");
      if(cabUnits.length) {
        log(`Cabinetry: ${cabUnits.length} unit${cabUnits.length>1?"s":""}, ${totalCabLines} cabinet lines, ${totalCabQty} cabinets total`, "success");
        cabUnits.forEach(u=>log(`  ${u.unit}: ${(u.rooms||[]).map(r=>`${r.room} (${(r.cabinets||[]).length})`).join(", ")}`));
      }

      // ── Build layers + items
      const now=Date.now();
      const newLayers=[];
      if(tradeKeys.includes("builder")||(proj.trades||[]).length===0){
        newLayers.push({id:now+1,name:"Floor Areas",color:"#f59e0b",visible:true});
        newLayers.push({id:now+2,name:"Wall Lengths",color:"#3b82f6",visible:true});
        newLayers.push({id:now+3,name:"Roof",color:"#22c55e",visible:true});
      }
      if(joineryActive)   newLayers.push({id:now+4,name:"Joinery",color:"#a78bfa",visible:true});
      if(cabinetryActive) newLayers.push({id:now+5,name:"Cabinetry",color:"#ec4899",visible:true});
      newLayers.push({id:now+6,name:"Rooms",color:"#14b8a6",visible:true});

      const newItems=[];
      if(merged.floorArea>0)   newItems.push({id:now+10,layerId:now+1,type:"area",  label:"Total Floor Area (AI)",       qty:merged.floorArea,  unit:"m²",source:"ai"});
      if(merged.wallLength>0)  newItems.push({id:now+11,layerId:now+2,type:"length",label:"External Wall Perimeter (AI)", qty:merged.wallLength, unit:"lm",source:"ai"});
      if(merged.roofArea>0)    newItems.push({id:now+12,layerId:now+3,type:"area",  label:"Roof Area (AI)",               qty:merged.roofArea,   unit:"m²",source:"ai"});
      if(merged.windows>0)     newItems.push({id:now+13,layerId:now+4,type:"count", label:`Windows — ${merged.windows} total`,      qty:merged.windows,    unit:"ea",source:"ai"});
      if(merged.doors>0)       newItems.push({id:now+14,layerId:now+4,type:"count", label:`Doors — ${merged.doors} total`,          qty:merged.doors,      unit:"ea",source:"ai"});
      if(merged.slidingDoors>0)newItems.push({id:now+15,layerId:now+4,type:"count", label:`Sliding Doors — ${merged.slidingDoors} total`,qty:merged.slidingDoors,unit:"ea",source:"ai"});

      // Cabinetry: ONE TAKEOFF ITEM PER CABINET LINE — exactly like the quote spreadsheet
      // Label format: "Unit 1 · Kitchen — Base 3 Drawer 900mm"
      let cid=now+1000;
      cabUnits.forEach(u=>{
        (u.rooms||[]).forEach(rm=>{
          (rm.cabinets||[]).forEach(c=>{
            const widthStr=c.width>0?` ${c.width}mm`:"";
            newItems.push({id:cid++,layerId:now+5,type:"count",
              label:`${u.unit} · ${rm.room} — ${c.type} ${c.config}${widthStr}`,
              qty:c.qty||1,unit:"ea",source:"ai",
              notes:c.notes||"",
              cab:{unit:u.unit,room:rm.room,type:c.type,config:c.config,width:c.width||0}});
          });
          if((rm.benchtop?.linearMetres||0)>0)
            newItems.push({id:cid++,layerId:now+5,type:"length",
              label:`${u.unit} · ${rm.room} — Benchtop`,
              qty:rm.benchtop.linearMetres,unit:"lm",source:"ai",
              notes:rm.benchtop.material||"",
              cab:{unit:u.unit,room:rm.room,type:"Benchtop",config:rm.benchtop.material||"",width:0}});
          if((rm.splashback?.area||0)>0)
            newItems.push({id:cid++,layerId:now+5,type:"area",
              label:`${u.unit} · ${rm.room} — Splashback`,
              qty:rm.splashback.area,unit:"m²",source:"ai",
              notes:rm.splashback.material||"",
              cab:{unit:u.unit,room:rm.room,type:"Splashback",config:rm.splashback.material||"",width:0}});
        });
      });

      (merged.rooms||[]).filter(r=>r.name&&r.area>0).forEach((r,i)=>
        newItems.push({id:now+20000+i,layerId:now+6,type:"area",label:r.name,qty:r.area,unit:"m²",source:"ai"}));

      onMutate(p=>({...p,
        takeoffLayers:newLayers, takeoffItems:newItems,
        aiSummary:{
          buildingType:merged.buildingType||"", confidence:merged.confidence||"low",
          scale:merged.scale||"", storeys:merged.storeys||0,
          notes:merged.notes||"", dims:merged.dims||[],
          windowSchedule:merged.windowSchedule||[],
          doorSchedule:merged.doorSchedule||[],
          slidingDoorSchedule:merged.slidingDoorSchedule||[],
          cabinetryUnits:cabUnits,
          tradesUsed:tradeKeys,
        },
      }));
      log(`✓ ${newItems.length} takeoff items created (${totalCabLines} cabinetry lines). Push to Estimate when ready.`,"success");

    } catch(e) {
      log(`Error: ${e.message}`,"error");
      pop(e.message.length<90?e.message:"Analysis failed — see log.","error");
    } finally { setAnalyzing(false); }
  }

  function addLayer() {
    const COLS=["#f59e0b","#3b82f6","#22c55e","#ef4444","#a78bfa","#14b8a6","#f97316","#ec4899"];
    const id=Date.now();
    onMutate(p=>({...p,takeoffLayers:[...(p.takeoffLayers||[]),
      {id,name:`Layer ${(p.takeoffLayers||[]).length+1}`,
       color:COLS[(p.takeoffLayers||[]).length%COLS.length],visible:true}]}));
  }

  function addManual() {
    if(!newItem.label||!newItem.qty) return pop("Label and quantity required.","error");
    onMutate(p=>({...p,takeoffItems:[...(p.takeoffItems||[]),{...newItem,id:Date.now(),source:"manual"}]}));
    setNewItem({type:"area",label:"",qty:0,unit:"m²",layerId:activeLayer});
    setShowAddItem(false); pop("Item added.");
  }

  // ── On-plan measurement ─────────────────────────────────────────────────
  async function openMeasure(pageIdx) {
    if(!rawFile.current) return pop("Upload a PDF first.","error");
    pop("Rendering page for measurement…","info");
    const lib=await pdfjs();
    const buf=await getBuffer();
    const pdfDoc=await lib.getDocument({data:buf.slice(0)}).promise;
    const pg=await pdfDoc.getPage(pageIdx+1);
    const vpN=pg.getViewport({scale:1});
    const sc=Math.min(150/72, 1800/Math.max(vpN.width,vpN.height));
    const vp=pg.getViewport({scale:sc});
    const cv=document.createElement("canvas");
    cv.width=Math.round(vp.width); cv.height=Math.round(vp.height);
    await pg.render({canvasContext:cv.getContext("2d"),viewport:vp}).promise;
    setMeasure({pageIdx, img:cv.toDataURL("image/jpeg",0.85), w:cv.width, h:cv.height,
      tool:calibRef.current[pageIdx]?"linear":"calibrate", pts:[], counts:[]});
  }

  function measureClick(e) {
    if(!measure||!measure.tool) return;
    const r=e.currentTarget.getBoundingClientRect();
    // map display coords → image pixel coords
    const x=(e.clientX-r.left)*(measure.w/r.width);
    const y=(e.clientY-r.top)*(measure.h/r.height);
    if(measure.tool==="count") setMeasure(m=>({...m,counts:[...m.counts,{x,y}]}));
    else setMeasure(m=>({...m,pts:[...m.pts,{x,y}]}));
  }

  function finishMeasure() {
    const m=measure; if(!m) return;
    const mmPerPx=calibRef.current[m.pageIdx];
    const targetLayer=activeLayer||layers[0]?.id||null;

    if(m.tool==="calibrate") {
      if(m.pts.length<2) return pop("Click two points of a known dimension first.","error");
      const [a,b]=m.pts.slice(-2);
      const px=Math.hypot(b.x-a.x,b.y-a.y);
      const mm=parseFloat(safePrompt("Real-world distance between the two points (mm)?","1000"));
      if(!mm||mm<=0) return;
      calibRef.current[m.pageIdx]=mm/px;
      setMeasure(x=>({...x,tool:"linear",pts:[]}));
      pop(`Calibrated: 1px = ${(mm/px).toFixed(3)}mm. Select a tool and measure.`);
      return;
    }
    if(!mmPerPx) return pop("Calibrate the page scale first.","error");

    if(m.tool==="linear") {
      if(m.pts.length<2) return pop("Click at least two points.","error");
      let px=0; for(let i=1;i<m.pts.length;i++) px+=Math.hypot(m.pts[i].x-m.pts[i-1].x,m.pts[i].y-m.pts[i-1].y);
      const lm=parseFloat((px*mmPerPx/1000).toFixed(2));
      const label=safePrompt("Label for this length:",`Measured length p${m.pageIdx+1}`);
      if(label===null) return;
      onMutate(p=>({...p,takeoffItems:[...(p.takeoffItems||[]),
        {id:Date.now(),layerId:targetLayer,type:"length",label:label||"Measured length",qty:lm,unit:"lm",source:"measured"}]}));
      setMeasure(x=>({...x,pts:[]}));
      pop(`${lm} lm added to takeoff.`);
    } else if(m.tool==="area") {
      if(m.pts.length<3) return pop("Click at least three points for an area.","error");
      // shoelace
      let s=0; const P=m.pts;
      for(let i=0;i<P.length;i++){const j=(i+1)%P.length; s+=P[i].x*P[j].y-P[j].x*P[i].y;}
      const m2=parseFloat((Math.abs(s/2)*mmPerPx*mmPerPx/1e6).toFixed(2));
      const label=safePrompt("Label for this area:",`Measured area p${m.pageIdx+1}`);
      if(label===null) return;
      onMutate(p=>({...p,takeoffItems:[...(p.takeoffItems||[]),
        {id:Date.now(),layerId:targetLayer,type:"area",label:label||"Measured area",qty:m2,unit:"m²",source:"measured"}]}));
      setMeasure(x=>({...x,pts:[]}));
      pop(`${m2} m² added to takeoff.`);
    } else if(m.tool==="count") {
      if(!m.counts.length) return pop("Click each item to count first.","error");
      const label=safePrompt("Label for this count:",`Counted items p${m.pageIdx+1}`);
      if(label===null) return;
      onMutate(p=>({...p,takeoffItems:[...(p.takeoffItems||[]),
        {id:Date.now(),layerId:targetLayer,type:"count",label:label||"Counted items",qty:m.counts.length,unit:"ea",source:"measured"}]}));
      setMeasure(x=>({...x,counts:[]}));
      pop(`${m.counts.length} ea added to takeoff.`);
    }
  }

  // live readout for the measure panel
  function measureLive() {
    const m=measure; if(!m) return "";
    const mmPerPx=calibRef.current[m.pageIdx];
    if(m.tool==="calibrate") return m.pts.length<2?`Click 2 points of a known dimension (${m.pts.length}/2)`:"Press Done and enter the real distance";
    if(!mmPerPx) return "Not calibrated";
    if(m.tool==="linear"&&m.pts.length>1){let px=0;for(let i=1;i<m.pts.length;i++)px+=Math.hypot(m.pts[i].x-m.pts[i-1].x,m.pts[i].y-m.pts[i-1].y);return `${(px*mmPerPx/1000).toFixed(2)} lm`;}
    if(m.tool==="area"&&m.pts.length>2){let s=0;const P=m.pts;for(let i=0;i<P.length;i++){const j=(i+1)%P.length;s+=P[i].x*P[j].y-P[j].x*P[i].y;}return `${(Math.abs(s/2)*mmPerPx*mmPerPx/1e6).toFixed(2)} m²`;}
    if(m.tool==="count") return `${m.counts.length} ea`;
    return "Click to add points";
  }

  // Fix: map takeoff items to correct estimate categories using layer name + label content
  async function pushToEstimate() {
    const layerMap={};
    (proj.takeoffLayers||[]).forEach(l=>{ layerMap[l.id]=l.name.toLowerCase(); });
    function guessCategory(item) {
      const ln=layerMap[item.layerId]||"";
      const lb=(item.label||"").toLowerCase();
      if(item.cab) {
        if(item.cab.type==="Benchtop"||item.cab.type==="Splashback") return "Benchtops";
        return "Cabinetry";
      }
      if(lb.includes("upper cabinet")||lb.includes("lower cabinet")||lb.includes("pantry")||lb.includes("laundry cabinet")) return "Cabinetry";
      if(lb.includes("vanity")||lb.includes("mirror cabinet")) return "Cabinetry";
      if(lb.includes("benchtop")||lb.includes("splashback")) return "Benchtops";
      if(lb.includes("robe")||lb.includes("walk-in")||lb.includes("built-in robe")) return "Cabinetry";
      if(lb.includes("hinge")||lb.includes("runner")||lb.includes("handle")||lb.includes("hardware")) return "Cabinetry";
      if(ln.includes("cabinet")||lb.includes("cabinet")) return "Cabinetry";
      if(lb.includes("window")||lb.includes("sliding door")) return "Windows & Doors";
      if(lb.includes("door")&&!lb.includes("sliding")) return "Windows & Doors";
      if(ln.includes("joinery")) return "Windows & Doors";
      if(ln.includes("roof")||lb.includes("roof")) return "Roofing";
      if(ln.includes("wall")||lb.includes("wall length")||lb.includes("framing")) return "Framing";
      if(lb.includes("slab")||lb.includes("floor area")) return "Foundations";
      if(lb.includes("room")||lb.includes("floor")) return "Flooring";
      return "Other";
    }

    // Load the project's cabinet pricing context (formula rules + chosen rates) once.
    let pricing=null;
    try{
      const { data:u }=await supabase.auth.getUser();
      const { data:prof }=await supabase.from("profiles").select("company_id").eq("id",u?.user?.id).single();
      if(prof?.company_id) pricing=await loadCabinetPricing(prof.company_id, proj.id);
    }catch{}

    const toAdd=(proj.takeoffItems||[]).map(ti=>{
      let rate=0;
      // Price real cabinet lines (not benchtop/splashback) via the parametric formula
      if(ti.cab && pricing?.ready && pricing.rules &&
         ti.cab.type!=="Benchtop" && ti.cab.type!=="Splashback"){
        const {doors,drawers}=parseCabConfig(ti.cab.config);
        const pr=priceCabinet({type:ti.cab.type,width:ti.cab.width,doors,drawers}, pricing.rules, pricing.rates);
        rate=pr.total;
      }
      return {
        id:uid(),
        category:guessCategory(ti),
        description:ti.label+(ti.notes?` (${ti.notes})`:""),
        qty:ti.qty,unit:ti.unit,rate,margin:proj.margin||20,source:"takeoff",
        cab:ti.cab||undefined,
      };
    });
    onMutate(p=>({...p,lineItems:[...(p.lineItems||[]),...toAdd]}));
    const priced=toAdd.filter(x=>x.rate>0).length;
    if(!pricing?.ready)
      pop(`${toAdd.length} items pushed. Set the Cabinet Preset to auto-price cabinets.`,"info");
    else
      pop(`${toAdd.length} items pushed — ${priced} cabinets auto-priced from your catalogue.`);
  }

  const ai = proj.aiSummary;

  const selectedTrades = proj.trades||[];
  const tradeScope = selectedTrades.length===0 ? "All trades" : selectedTrades.map(k=>TRADES[k]?.label||k).join(", ");

  return <div>
    {/* ── TRADE SELECTOR ── */}
    <Card sx={{marginBottom:14}}>
      <Row gap={10} sx={{marginBottom:10}}>
        <div style={{fontWeight:700,fontSize:13}}>Trade Scope</div>
        <div style={{color:T.muted,fontSize:12}}>Select which trades to extract takeoff for. Leave all unselected to extract everything.</div>
      </Row>
      <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:10}}>
        {TRADE_KEYS.map(k=>{
          const tr=TRADES[k];
          const on=selectedTrades.includes(k);
          return <div key={k} onClick={()=>{
            const next=on?selectedTrades.filter(x=>x!==k):[...selectedTrades,k];
            onMutate(p=>({...p,trades:next}));
          }} style={{
            display:"flex",alignItems:"center",gap:6,padding:"6px 12px",borderRadius:6,
            cursor:"pointer",fontSize:12,fontWeight:600,userSelect:"none",
            background:on?`${tr.color}20`:T.bg,
            border:`1px solid ${on?tr.color:T.border}`,
            color:on?tr.color:T.muted,
            transition:"all 0.15s"
          }}>
            <span>{tr.icon}</span> {tr.label}
            {on&&<span style={{fontSize:10,opacity:0.7}}>✓</span>}
          </div>;
        })}
      </div>
      {selectedTrades.length>0&&<div style={{fontSize:11,color:T.muted}}>
        <span style={{color:T.accent,fontWeight:600}}>Active scope: </span>{tradeScope}
        {" · "}<span style={{color:T.faint,cursor:"pointer",textDecoration:"underline"}}
          onClick={()=>onMutate(p=>({...p,trades:[]}))}>Clear all (use all trades)</span>
      </div>}
      {selectedTrades.length===0&&<div style={{fontSize:11,color:T.faint}}>
        No trades selected — all trades will be extracted. Select specific trades to focus the AI and reduce API usage.
      </div>}
    </Card>

    {/* ── Toolbar */}
    <Row gap={8} sx={{marginBottom:14,flexWrap:"wrap"}}>
      <Btn v="pri" onClick={()=>fileInput.current?.click()}>📁 Upload PDF Plans</Btn>
      <input ref={fileInput} type="file" accept=".pdf" style={{display:"none"}}
        onChange={e=>{const f=e.target.files?.[0];if(f)handleFile(f);e.target.value="";}}/>
      {pdfMeta&&<Btn v="tel" onClick={runExtract} disabled={analyzing}>
        {analyzing?`⏳ Analysing… ${progress.done}/${progress.total||"?"}`
          :`⬡ AI Extract — ${pdfMeta.numPages} pages · ${tradeScope}`}
      </Btn>}
      {items.length>0&&<Btn v="grn" onClick={pushToEstimate}>→ Push {items.length} items to Estimate</Btn>}
      {pdfMeta&&<Btn v="blu" onClick={()=>openMeasure(currentPage)}>📐 Measure p{currentPage+1}</Btn>}
      <Btn v="gho" onClick={addLayer}>+ Layer</Btn>
      <Btn v="gho" onClick={()=>setShowAddItem(!showAddItem)}>+ Manual Item</Btn>
    </Row>

    {/* ── MEASURE PANEL — scale-calibrated on-plan measurement */}
    {measure&&<Card sx={{marginBottom:14,padding:0,overflow:"hidden"}} hi>
      <div style={{padding:"10px 14px",borderBottom:`1px solid ${T.border}`,display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
        <div style={{fontWeight:700,fontSize:13}}>📐 Measure — page {measure.pageIdx+1}</div>
        <Bdg color={calibRef.current[measure.pageIdx]?T.green:T.red}>
          {calibRef.current[measure.pageIdx]?`1px = ${calibRef.current[measure.pageIdx].toFixed(3)}mm`:"NOT CALIBRATED"}
        </Bdg>
        {[["calibrate","⚖ Calibrate"],["linear","━ Linear"],["area","▰ Area"],["count","● Count"]].map(([t,l])=>
          <div key={t} onClick={()=>setMeasure(m=>({...m,tool:t,pts:[],counts:t==="count"?m.counts:[]}))} style={{
            padding:"5px 12px",borderRadius:5,cursor:"pointer",fontSize:12,fontWeight:600,
            background:measure.tool===t?T.blueDim:T.bg,color:measure.tool===t?T.blue:T.muted,
            border:`1px solid ${measure.tool===t?T.blue:T.border}`}}>{l}</div>)}
        <span style={{fontFamily:T.mono,fontSize:12,color:T.accent,fontWeight:700,marginLeft:4}}>{measureLive()}</span>
        <div style={{marginLeft:"auto",display:"flex",gap:6}}>
          <Btn sm v="grn" onClick={finishMeasure}>✓ Done</Btn>
          <Btn sm v="gho" onClick={()=>setMeasure(m=>({...m,pts:[],counts:[]}))}>Clear</Btn>
          <Btn sm v="red" onClick={()=>setMeasure(null)}>✕ Close</Btn>
        </div>
      </div>
      <div style={{position:"relative",maxHeight:640,overflow:"auto",background:"#202830"}}>
        <div style={{position:"relative",width:"100%"}}>
          <img src={measure.img} onClick={measureClick}
            style={{width:"100%",display:"block",cursor:"crosshair",userSelect:"none"}} draggable={false}/>
          <svg viewBox={`0 0 ${measure.w} ${measure.h}`} preserveAspectRatio="none"
            style={{position:"absolute",inset:0,width:"100%",height:"100%",pointerEvents:"none"}}>
            {measure.pts.length>0&&measure.tool!=="count"&&<>
              {measure.tool==="area"&&measure.pts.length>2&&
                <polygon points={measure.pts.map(p=>`${p.x},${p.y}`).join(" ")}
                  fill="rgba(59,130,246,0.18)" stroke="#3b82f6" strokeWidth={Math.max(2,measure.w/600)}/>}
              {(measure.tool==="linear"||measure.tool==="calibrate"||(measure.tool==="area"&&measure.pts.length<=2))&&
                <polyline points={measure.pts.map(p=>`${p.x},${p.y}`).join(" ")}
                  fill="none" stroke={measure.tool==="calibrate"?"#eab308":"#3b82f6"} strokeWidth={Math.max(2,measure.w/600)}/>}
              {measure.pts.map((p,i)=><circle key={i} cx={p.x} cy={p.y} r={Math.max(4,measure.w/300)}
                fill={measure.tool==="calibrate"?"#eab308":"#3b82f6"} stroke="#fff" strokeWidth={Math.max(1,measure.w/1200)}/>)}
            </>}
            {measure.counts.map((p,i)=><g key={i}>
              <circle cx={p.x} cy={p.y} r={Math.max(8,measure.w/150)} fill="rgba(34,197,94,0.85)" stroke="#fff" strokeWidth={Math.max(1.5,measure.w/900)}/>
              <text x={p.x} y={p.y} textAnchor="middle" dominantBaseline="central"
                fontSize={Math.max(9,measure.w/130)} fill="#fff" fontWeight="800">{i+1}</text>
            </g>)}
          </svg>
        </div>
      </div>
      <div style={{padding:"7px 14px",fontSize:11,color:T.faint,borderTop:`1px solid ${T.border}`}}>
        Calibrate once per page against a known dimension (grid line, dimension string, scale bar). Linear: click along the run. Area: click polygon corners. Count: click each item. ✓ Done saves to the {activeLayer?`"${layers.find(l=>l.id===activeLayer)?.name}"`:"first"} layer.
      </div>
    </Card>}

    {/* ── Progress bar */}
    {analyzing&&progress.total>0&&<div style={{marginBottom:12}}>
      <div style={{background:T.border,borderRadius:4,height:5,overflow:"hidden"}}>
        <div style={{height:"100%",borderRadius:4,
          background:`linear-gradient(90deg,${T.accent},${T.yellow})`,
          width:`${(progress.done/progress.total)*100}%`,transition:"width 0.4s"}}/>
      </div>
      <div style={{color:T.muted,fontSize:11,marginTop:4,fontFamily:T.mono}}>
        {progress.done}/{progress.total} batches · {Math.round(progress.done/progress.total*100)}%
      </div>
    </div>}

    <div style={{display:"flex",gap:14,flexWrap:"wrap"}}>
      {/* ── PDF thumbnail strip */}
      <div style={{flexShrink:0,width:pdfMeta?150:undefined}}>
        {!pdfMeta
          ? <div
              onDragOver={e=>e.preventDefault()}
              onDrop={e=>{e.preventDefault();const f=e.dataTransfer.files[0];if(f)handleFile(f);}}
              onClick={()=>fileInput.current?.click()}
              style={{background:T.bg,border:`2px dashed ${T.border}`,borderRadius:8,
                padding:"36px 20px",display:"flex",flexDirection:"column",alignItems:"center",
                justifyContent:"center",cursor:"pointer",textAlign:"center",minWidth:200,minHeight:200}}>
              <div style={{fontSize:36,opacity:0.35,marginBottom:10}}>📐</div>
              <div style={{color:T.muted,fontSize:13,fontWeight:600}}>Drop PDF here</div>
              <div style={{color:T.faint,fontSize:11,marginTop:4}}>Any architectural drawing format</div>
            </div>
          : <div>
              <div style={{color:T.muted,fontSize:10,marginBottom:6,wordBreak:"break-all"}}>
                {pdfMeta.name.length>24?pdfMeta.name.slice(0,24)+"…":pdfMeta.name} · {pdfMeta.numPages}pp
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:4,maxHeight:560,overflowY:"auto"}}>
                {pdfMeta.thumbs.map((src,i)=>
                  <div key={i} onClick={()=>setCurrentPage(i)} style={{
                    border:`2px solid ${currentPage===i?T.accent:T.border}`,
                    borderRadius:4,overflow:"hidden",cursor:"pointer",flexShrink:0}}>
                    <img src={src} style={{width:"100%",display:"block"}}/>
                    <div style={{fontSize:9,color:T.faint,padding:"2px 4px",background:T.bg}}>p{i+1}</div>
                  </div>)}
                {pdfMeta.numPages>24&&<div style={{color:T.faint,fontSize:10,textAlign:"center",padding:4}}>
                  +{pdfMeta.numPages-24} more pages
                </div>}
              </div>
            </div>
        }
      </div>

      {/* ── Right panel */}
      <div style={{flex:1,minWidth:0}}>

        {/* ── AI Summary */}
        {ai&&<Card sx={{marginBottom:12}}>
          <Row gap={10} sx={{marginBottom:10,flexWrap:"wrap"}}>
            <div style={{fontWeight:700,fontSize:13}}>AI Analysis Summary</div>
            <Bdg color={ai.confidence==="high"?T.green:ai.confidence==="medium"?T.yellow:T.red}>
              {ai.confidence} confidence
            </Bdg>
            {ai.scale&&<Bdg color={T.blue}>{ai.scale}</Bdg>}
            {ai.storeys>0&&<Bdg color={T.purple}>{ai.storeys} storeys</Bdg>}
            {(ai.tradesUsed||[]).length>0&&<Bdg color={T.teal}>{ai.tradesUsed.length} trades</Bdg>}
          </Row>
          {ai.buildingType&&<div style={{color:T.text,fontSize:13,marginBottom:8}}>📐 {ai.buildingType}</div>}
          {ai.notes&&<div style={{color:T.muted,fontSize:12,marginBottom:12,lineHeight:1.6}}>{ai.notes}</div>}

          {/* Window Schedule */}
          {(ai.windowSchedule||[]).length>0&&<div style={{marginBottom:12}}>
            <div style={{fontWeight:700,fontSize:12,color:T.blue,marginBottom:6}}>Window Schedule ({(ai.windowSchedule||[]).length} types)</div>
            <div style={{overflowX:"auto"}}>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
                <thead><tr style={{color:T.faint}}>
                  {["Ref","Size (H×W)","Type","Head","Sill","Spec"].map(h=><th key={h} style={{padding:"4px 8px",textAlign:"left",fontWeight:600}}>{h}</th>)}
                </tr></thead>
                <tbody>{(ai.windowSchedule||[]).map((w,i)=><tr key={i} style={{borderTop:`1px solid ${T.border}`}}>
                  <td style={{padding:"5px 8px",fontFamily:T.mono,color:T.blue,fontWeight:700}}>{w.ref}</td>
                  <td style={{padding:"5px 8px",fontFamily:T.mono,color:T.text}}>{w.size}</td>
                  <td style={{padding:"5px 8px",color:T.text}}>{w.type}</td>
                  <td style={{padding:"5px 8px",color:T.muted,fontFamily:T.mono}}>{w.headHeight}</td>
                  <td style={{padding:"5px 8px",color:T.muted,fontFamily:T.mono}}>{w.sillHeight}</td>
                  <td style={{padding:"5px 8px",color:T.muted}}>{w.spec}</td>
                </tr>)}</tbody>
              </table>
            </div>
          </div>}

          {/* Sliding Door Schedule */}
          {(ai.slidingDoorSchedule||[]).length>0&&<div style={{marginBottom:12}}>
            <div style={{fontWeight:700,fontSize:12,color:T.teal,marginBottom:6}}>Sliding Door Schedule ({(ai.slidingDoorSchedule||[]).length} types)</div>
            <div style={{overflowX:"auto"}}>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
                <thead><tr style={{color:T.faint}}>
                  {["Ref","Size","Type","Panels","Spec"].map(h=><th key={h} style={{padding:"4px 8px",textAlign:"left",fontWeight:600}}>{h}</th>)}
                </tr></thead>
                <tbody>{(ai.slidingDoorSchedule||[]).map((d,i)=><tr key={i} style={{borderTop:`1px solid ${T.border}`}}>
                  <td style={{padding:"5px 8px",fontFamily:T.mono,color:T.teal,fontWeight:700}}>{d.ref}</td>
                  <td style={{padding:"5px 8px",fontFamily:T.mono,color:T.text}}>{d.size}</td>
                  <td style={{padding:"5px 8px",color:T.text}}>{d.type}</td>
                  <td style={{padding:"5px 8px",color:T.muted,fontFamily:T.mono}}>{d.panels}</td>
                  <td style={{padding:"5px 8px",color:T.muted}}>{d.spec}</td>
                </tr>)}</tbody>
              </table>
            </div>
          </div>}

          {/* Door Schedule */}
          {(ai.doorSchedule||[]).length>0&&<div style={{marginBottom:12}}>
            <div style={{fontWeight:700,fontSize:12,color:T.purple,marginBottom:6}}>Door Schedule ({(ai.doorSchedule||[]).length} types)</div>
            <div style={{overflowX:"auto"}}>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
                <thead><tr style={{color:T.faint}}>
                  {["Ref","Size","Frame Type","Head","FRL","Hardware/Spec"].map(h=><th key={h} style={{padding:"4px 8px",textAlign:"left",fontWeight:600}}>{h}</th>)}
                </tr></thead>
                <tbody>{(ai.doorSchedule||[]).map((d,i)=><tr key={i} style={{borderTop:`1px solid ${T.border}`}}>
                  <td style={{padding:"5px 8px",fontFamily:T.mono,color:T.purple,fontWeight:700}}>{d.ref}</td>
                  <td style={{padding:"5px 8px",fontFamily:T.mono,color:T.text}}>{d.size}</td>
                  <td style={{padding:"5px 8px",color:T.text}}>{d.frameType||d.type}</td>
                  <td style={{padding:"5px 8px",color:T.muted,fontFamily:T.mono}}>{d.headHeight}</td>
                  <td style={{padding:"5px 8px",color:d.frl?T.red:T.faint,fontSize:10,fontFamily:T.mono}}>{d.frl||"—"}</td>
                  <td style={{padding:"5px 8px",color:T.muted}}>{d.hardware||d.spec}</td>
                </tr>)}</tbody>
              </table>
            </div>
          </div>}

          {/* Cabinetry Takeoff — per unit, per room, itemised cabinets (matches quote spreadsheet format) */}
          {(ai.cabinetryUnits||[]).length>0&&(()=>{
            const units=ai.cabinetryUnits;
            const grandTotal=units.reduce((s,u)=>s+(u.rooms||[]).reduce((s2,r)=>s2+(r.cabinets||[]).reduce((s3,c)=>s3+(c.qty||0),0),0),0);
            return <div style={{marginTop:4}}>
              <div style={{fontWeight:700,fontSize:12,color:"#ec4899",marginBottom:10}}>
                🪵 Cabinetry Takeoff — {units.length} unit{units.length>1?"s":""} · {grandTotal} cabinets total
              </div>
              {units.map((u,ui)=>{
                const unitQty=(u.rooms||[]).reduce((s,r)=>s+(r.cabinets||[]).reduce((s2,c)=>s2+(c.qty||0),0),0);
                return <div key={ui} style={{marginBottom:14,background:T.bg,borderRadius:8,border:`1px solid ${T.border}`,overflow:"hidden"}}>
                  <div style={{padding:"8px 14px",background:T.card2,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <span style={{fontWeight:800,fontSize:12,color:T.text}}>{u.unit}</span>
                    <span style={{fontFamily:T.mono,fontSize:11,color:"#ec4899",fontWeight:700}}>{unitQty} cabinets</span>
                  </div>
                  {(u.rooms||[]).map((rm,ri)=>{
                    const roomQty=(rm.cabinets||[]).reduce((s,c)=>s+(c.qty||0),0);
                    return <div key={ri} style={{borderTop:`1px solid ${T.border}`}}>
                      <div style={{padding:"6px 14px",display:"flex",justifyContent:"space-between",background:`${T.card}`}}>
                        <span style={{fontWeight:700,fontSize:11,color:T.accent,textTransform:"uppercase",letterSpacing:"0.05em"}}>{rm.room}</span>
                        <span style={{fontFamily:T.mono,fontSize:10,color:T.muted}}>{roomQty} cab</span>
                      </div>
                      <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
                        <thead><tr style={{color:T.faint,fontSize:10}}>
                          <th style={{padding:"3px 14px",textAlign:"left",fontWeight:600,width:"22%"}}>Type</th>
                          <th style={{padding:"3px 8px",textAlign:"left",fontWeight:600,width:"26%"}}>Config</th>
                          <th style={{padding:"3px 8px",textAlign:"right",fontWeight:600,width:"16%"}}>Width mm</th>
                          <th style={{padding:"3px 8px",textAlign:"right",fontWeight:600,width:"10%"}}>Qty</th>
                          <th style={{padding:"3px 14px",textAlign:"left",fontWeight:600}}>Notes</th>
                        </tr></thead>
                        <tbody>
                          {(rm.cabinets||[]).map((c,ci)=><tr key={ci} style={{borderTop:`1px solid ${T.border}40`}}>
                            <td style={{padding:"4px 14px",color:T.text,fontWeight:600}}>{c.type}</td>
                            <td style={{padding:"4px 8px",color:T.text}}>{c.config}</td>
                            <td style={{padding:"4px 8px",textAlign:"right",fontFamily:T.mono,color:T.muted}}>{c.width>0?c.width:"—"}</td>
                            <td style={{padding:"4px 8px",textAlign:"right",fontFamily:T.mono,color:"#ec4899",fontWeight:700}}>{c.qty}</td>
                            <td style={{padding:"4px 14px",color:T.faint,fontSize:10}}>{c.notes}</td>
                          </tr>)}
                          {(rm.benchtop?.linearMetres||0)>0&&<tr style={{borderTop:`1px solid ${T.border}40`}}>
                            <td style={{padding:"4px 14px",color:T.green,fontWeight:600}}>Benchtop</td>
                            <td style={{padding:"4px 8px",color:T.text}}>{rm.benchtop.material||"—"}</td>
                            <td style={{padding:"4px 8px",textAlign:"right",fontFamily:T.mono,color:T.green}}>{rm.benchtop.linearMetres}lm</td>
                            <td style={{padding:"4px 8px"}}/><td style={{padding:"4px 14px"}}/>
                          </tr>}
                          {(rm.splashback?.area||0)>0&&<tr style={{borderTop:`1px solid ${T.border}40`}}>
                            <td style={{padding:"4px 14px",color:T.teal,fontWeight:600}}>Splashback</td>
                            <td style={{padding:"4px 8px",color:T.text}}>{rm.splashback.material||"—"}</td>
                            <td style={{padding:"4px 8px",textAlign:"right",fontFamily:T.mono,color:T.teal}}>{rm.splashback.area}m²</td>
                            <td style={{padding:"4px 8px"}}/><td style={{padding:"4px 14px"}}/>
                          </tr>}
                        </tbody>
                      </table>
                    </div>;
                  })}
                </div>;
              })}
            </div>;
          })()}
        </Card>}

        {/* ── Add manual item form */}
        {showAddItem&&<Card hi sx={{marginBottom:12}}>
          <div style={{fontWeight:700,marginBottom:10,fontSize:13}}>Add Takeoff Item</div>
          <Grid3 gap={10}>
            <Sel label="Type" value={newItem.type}
              onChange={v=>setNewItem(x=>({...x,type:v,unit:v==="area"?"m²":v==="length"?"lm":"ea"}))}
              options={[{value:"area",label:"Area (m²)"},{value:"length",label:"Length (lm)"},{value:"count",label:"Count (ea)"}]}/>
            <Inp label="Label / Description" value={newItem.label}
              onChange={v=>setNewItem(x=>({...x,label:v}))} placeholder="e.g. Ground Floor Slab"
              sx={{gridColumn:"2/-1"}}/>
            <Inp label="Quantity" value={newItem.qty} onChange={v=>setNewItem(x=>({...x,qty:v}))} type="number" mono/>
            <Sel label="Unit" value={newItem.unit} onChange={v=>setNewItem(x=>({...x,unit:v}))} options={UNITS}/>
            <Sel label="Layer" value={newItem.layerId||""}
              onChange={v=>setNewItem(x=>({...x,layerId:parseInt(v)||null}))}
              options={[{value:"",label:"No layer"},...layers.map(l=>({value:l.id,label:l.name}))]}/>
          </Grid3>
          <Row gap={8}><Btn v="pri" sm onClick={addManual}>Add</Btn><Btn sm onClick={()=>setShowAddItem(false)}>Cancel</Btn></Row>
        </Card>}

        {/* ── Layers */}
        {layers.length>0&&<Card sx={{marginBottom:12}}>
          <div style={{fontWeight:700,fontSize:13,marginBottom:10}}>Measurement Layers</div>
          <Row gap={6} wrap>
            {layers.map(l=><div key={l.id}
              onClick={()=>setActiveLayer(l.id===activeLayer?null:l.id)}
              style={{display:"flex",alignItems:"center",gap:6,padding:"5px 11px",
                borderRadius:5,cursor:"pointer",
                background:activeLayer===l.id?`${l.color}18`:T.bg,
                border:`1px solid ${activeLayer===l.id?l.color:T.border}`}}>
              <span style={{width:10,height:10,borderRadius:"50%",background:l.color,display:"inline-block",flexShrink:0}}/>
              <span style={{fontSize:12,color:T.text}}>{l.name}</span>
              <span style={{color:T.faint,fontSize:11,fontFamily:T.mono}}>
                {items.filter(i=>i.layerId===l.id).length}
              </span>
            </div>)}
          </Row>
        </Card>}

        {/* ── Takeoff items table */}
        {items.length>0
          ? <Card sx={{padding:0,overflow:"hidden"}}>
              <div style={{padding:"11px 16px",borderBottom:`1px solid ${T.border}`,
                display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div style={{fontWeight:700,fontSize:13}}>Takeoff Items ({items.length})</div>
                <Btn sm v="grn" onClick={pushToEstimate}>→ Push to Estimate</Btn>
              </div>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                <thead><tr style={{background:T.bg,color:T.faint,fontSize:11,textAlign:"left"}}>
                  {["Layer","Type","Description","Qty","Unit","Source",""].map(h=>
                    <th key={h} style={{padding:"6px 10px",fontWeight:600}}>{h}</th>)}
                </tr></thead>
                <tbody>
                  {items.map(item=>{
                    const layer=layers.find(l=>l.id===item.layerId);
                    return <tr key={item.id} style={{borderTop:`1px solid ${T.border}`}}>
                      <td style={{padding:"8px 10px"}}>
                        {layer&&<Row gap={5}>
                          <span style={{width:8,height:8,borderRadius:"50%",background:layer.color,display:"inline-block"}}/>
                          <span style={{color:T.muted,fontSize:11}}>{layer.name}</span>
                        </Row>}
                      </td>
                      <td style={{padding:"8px 10px"}}>
                        <Bdg color={item.type==="area"?T.yellow:item.type==="length"?T.blue:T.green} sm>{item.type}</Bdg>
                      </td>
                      <td style={{padding:"8px 10px",color:T.text,fontWeight:600}}>{item.label}</td>
                      <td style={{padding:"8px 10px",fontFamily:T.mono,color:T.accent,fontWeight:700}}>{item.qty}</td>
                      <td style={{padding:"8px 10px",color:T.muted}}>{item.unit}</td>
                      <td style={{padding:"8px 10px"}}>
                        <Bdg color={item.source==="ai"?T.teal:T.faint} sm>{item.source||"manual"}</Bdg>
                      </td>
                      <td style={{padding:"8px 10px"}}>
                        <span style={{cursor:"pointer",color:T.red,fontSize:13}}
                          onClick={()=>onMutate(p=>({...p,takeoffItems:p.takeoffItems.filter(x=>x.id!==item.id)}))}>✕</span>
                      </td>
                    </tr>;
                  })}
                </tbody>
              </table>
            </Card>
          : !pdfMeta&&<div style={{color:T.faint,fontSize:13,padding:"20px 0"}}>
              Upload a PDF and run AI Extract, or add items manually.
            </div>
        }

        {/* ── Analysis log */}
        {aLog.length>0&&<Card sx={{marginTop:12,padding:12}}>
          <div style={{color:T.faint,fontSize:10,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:6}}>Analysis Log</div>
          <div ref={logRef} style={{maxHeight:190,overflowY:"auto"}}>
            {aLog.map((l,i)=><div key={i} style={{fontSize:11,fontFamily:T.mono,marginBottom:3,
              color:l.type==="success"?T.green:l.type==="error"?T.red:l.type==="warn"?T.yellow:T.muted}}>
              <span style={{color:T.faint}}>[{l.ts}] </span>{l.msg}
            </div>)}
          </div>
        </Card>}
      </div>
    </div>
  </div>;
}

// ═══════════════════════════════════════════════════════════════════════════
// ESTIMATE MODULE
// ═══════════════════════════════════════════════════════════════════════════
function EstimateModule({proj, rates, cabLib, onMutate, c, pop}) {
  const [showAdd,  setShowAdd]  = useState(false);
  const [showRates,setShowRates]= useState(false);
  const [showCabSetup,setShowCabSetup]=useState(false);
  const [nli, setNli] = useState({category:CATS[0],description:"",qty:1,unit:"m²",rate:0,margin:proj.margin||20});
  const [templates,setTemplates]=useLS("qf_templates",[]);
  const [showTpl,setShowTpl]=useState(false);

  function saveTemplate(){
    const name=safePrompt("Template name:",proj.name+" template");
    if(!name) return;
    setTemplates(ts=>[...ts,{id:Date.now(),name,
      lineItems:(proj.lineItems||[]).map(li=>({category:li.category,description:li.description,qty:li.qty,unit:li.unit,rate:li.rate,margin:li.margin})),
      overhead:proj.overhead,margin:proj.margin}]);
    pop(`Template "${name}" saved — reuse it on any project.`);
  }
  function applyTemplate(t){
    onMutate(p=>({...p,lineItems:[...(p.lineItems||[]),
      ...t.lineItems.map(li=>({...li,id:uid(),source:"template"}))]}));
    setShowTpl(false);
    pop(`Template "${t.name}" applied — ${t.lineItems.length} items added.`);
  }

  // Per-project cabinetry config — initialised from the global Cabinet Library,
  // then fully editable for this project (dims, board rates, hardware, install, logistics)
  const cc = proj.cabConfig;
  const hasCab = (proj.lineItems||[]).some(li=>li.cab)||(proj.takeoffItems||[]).some(ti=>ti.cab)||(proj.trades||[]).includes("cabinetry");
  function initCabConfig(){
    const b=cabLib||SEED_CABLIB;
    onMutate(p=>({...p,cabConfig:JSON.parse(JSON.stringify({
      carcassRatePerM2:b.carcassRatePerM2, doorHardware:b.doorHardware,
      drawerHardware:b.drawerHardware, assemblyPerCabinet:b.assemblyPerCabinet,
      supplierCalibration:b.supplierCalibration, useCalibration:b.useCalibration,
      dims:b.dims, panelDims:b.panelDims,
      finishes:b.finishes, defaultFinishId:b.defaultFinishId,
      installHourlyRate:b.installHourlyRate, installMinHours:b.installMinHours,
      installSiteSetupHours:b.installSiteSetupHours, installRates:b.installRates,
      deliveryAllowance:b.deliveryAllowance, protectionAllowance:b.protectionAllowance,
      pmAllowance:b.pmAllowance,
    }))}));
    setShowCabSetup(true);
    pop("Cabinetry config initialised from Cabinet Library.");
  }
  function setCC(k,v){ onMutate(p=>({...p,cabConfig:{...p.cabConfig,[k]:v}})); }
  function setCCDim(type,k,v){ onMutate(p=>({...p,cabConfig:{...p.cabConfig,dims:{...p.cabConfig.dims,[type]:{...p.cabConfig.dims[type],[k]:v}}}})); }

  function repriceCabItems(){
    const cfg=proj.cabConfig||cabLib||SEED_CABLIB;
    onMutate(p=>({...p,lineItems:p.lineItems.map(li=>{
      if(!li.cab) return li;
      const priced=priceCabLine(li.cab,cfg);
      if(!priced) return li;
      const rate=priced.installMode!=="ea"?priced.supply+priced.installCost:priced.unitCost;
      return {...li,rate:parseFloat(rate.toFixed(2))};
    })}));
    pop("Cabinetry items re-priced with current project config.");
  }

  function updLI(id,k,v) {
    onMutate(p=>({...p,lineItems:p.lineItems.map(li=>
      li.id===id?{...li,[k]:["qty","rate","margin"].includes(k)?parseFloat(v)||0:v}:li)}));
  }
  function delLI(id) { onMutate(p=>({...p,lineItems:p.lineItems.filter(li=>li.id!==id)})); pop("Removed."); }
  function addLI() {
    if(!nli.description) return pop("Description required.","error");
    onMutate(p=>({...p,lineItems:[...(p.lineItems||[]),{...nli,id:Date.now(),source:"manual"}]}));
    setNli({category:CATS[0],description:"",qty:1,unit:"m²",rate:0,margin:proj.margin||20});
    setShowAdd(false); pop("Item added.");
  }

  const grouped = CATS.filter(cat=>(proj.lineItems||[]).some(li=>li.category===cat));

  return <div>
    <Row gap={8} sx={{marginBottom:16,flexWrap:"wrap"}}>
      <Btn v="pri" onClick={()=>setShowAdd(!showAdd)}>+ Add Item</Btn>
      <Btn v="blu" onClick={()=>setShowRates(!showRates)}>⇥ Rate Library</Btn>
      {(proj.lineItems||[]).length>0&&<Btn v="gho" onClick={saveTemplate}>💾 Save as Template</Btn>}
      {templates.length>0&&<Btn v="gho" onClick={()=>setShowTpl(!showTpl)}>📋 Templates ({templates.length})</Btn>}
      {hasCab&&(cc
        ? <Btn v="pur" onClick={()=>setShowCabSetup(!showCabSetup)}>🪵 Cabinetry Setup {showCabSetup?"▴":"▾"}</Btn>
        : <Btn v="pur" onClick={initCabConfig}>🪵 Set Up Cabinetry Pricing</Btn>)}
      {cc&&(proj.lineItems||[]).some(li=>li.cab)&&<Btn v="yel" onClick={repriceCabItems}>↻ Re-price Cabinetry</Btn>}
      {(proj.takeoffItems||[]).length>0&&<Btn v="tel" onClick={()=>{
        const cfg=proj.cabConfig||cabLib||SEED_CABLIB;
        const add=(proj.takeoffItems||[]).map(ti=>{
          let rate=0;
          if(ti.cab){
            const priced=priceCabLine(ti.cab,cfg);
            if(priced) rate=parseFloat((priced.installMode!=="ea"?priced.supply+priced.installCost:priced.unitCost).toFixed(2));
          }
          return {id:uid(),
            category:ti.cab?(["Benchtop","Splashback"].includes(ti.cab.type)?"Benchtops":"Cabinetry"):(ti.type==="count"?"Windows & Doors":ti.type==="area"?"Foundations":"Framing"),
            description:ti.label,qty:ti.qty,unit:ti.unit,rate,margin:proj.margin||20,source:"takeoff",cab:ti.cab||undefined};
        });
        onMutate(p=>({...p,lineItems:[...(p.lineItems||[]),...add]}));
        pop(`${add.length} takeoff items imported.`);
      }}>⬡ Import from Takeoff</Btn>}
    </Row>

    {/* ── Templates picker */}
    {showTpl&&<Card hi sx={{marginBottom:14}}>
      <div style={{fontWeight:700,marginBottom:10,fontSize:13}}>Estimate Templates</div>
      {templates.map(t=><div key={t.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",borderBottom:`1px solid ${T.border}`}}>
        <div>
          <span style={{fontWeight:600,fontSize:13,color:T.text}}>{t.name}</span>
          <span style={{color:T.faint,fontSize:11}}> · {t.lineItems.length} items</span>
        </div>
        <Row gap={6}>
          <Btn sm v="grn" onClick={()=>applyTemplate(t)}>Apply</Btn>
          <Btn sm v="red" onClick={()=>{setTemplates(ts=>ts.filter(x=>x.id!==t.id));pop("Template deleted.");}}>✕</Btn>
        </Row>
      </div>)}
    </Card>}

    {/* ── CABINETRY SETUP — per-project pricing config */}
    {cc&&showCabSetup&&<Card hi sx={{marginBottom:14}}>
      <Row gap={10} sx={{marginBottom:12,flexWrap:"wrap"}}>
        <div style={{fontWeight:700,color:"#ec4899",fontSize:13}}>🪵 Cabinetry Pricing — this project</div>
        <div style={{color:T.muted,fontSize:11}}>Initialised from Cabinet Library. Changes here apply to this project only.</div>
      </Row>

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:14}}>
        {/* Board & hardware */}
        <div>
          <div style={{fontWeight:600,fontSize:11,color:T.muted,textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:8}}>Board & Hardware (supplier rates)</div>
          <Inp label="Carcass board $/m²" value={cc.carcassRatePerM2} onChange={v=>setCC("carcassRatePerM2",v)} type="number" mono/>
          <Inp label="Door hardware $/door" value={cc.doorHardware} onChange={v=>setCC("doorHardware",v)} type="number" mono/>
          <Inp label="Drawer hardware $/drawer" value={cc.drawerHardware} onChange={v=>setCC("drawerHardware",v)} type="number" mono/>
          <Inp label="Assembly $/cabinet" value={cc.assemblyPerCabinet} onChange={v=>setCC("assemblyPerCabinet",v)} type="number" mono/>
          <Row gap={8}>
            <Inp label="Supplier calibration ×" value={cc.supplierCalibration} onChange={v=>setCC("supplierCalibration",v)} type="number" mono sx={{flex:1}}/>
            <div style={{paddingTop:14}}><Toggle on={cc.useCalibration!==false} onChange={v=>setCC("useCalibration",v)} label="On"/></div>
          </Row>
        </div>

        {/* Dimensions + finish */}
        <div>
          <div style={{fontWeight:600,fontSize:11,color:T.muted,textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:8}}>Standard Dimensions (mm)</div>
          {["Base","Overhead","Tall"].map(t=><div key={t} style={{display:"flex",gap:8,alignItems:"flex-end",marginBottom:4}}>
            <div style={{width:70,fontSize:12,color:T.text,fontWeight:600,paddingBottom:16}}>{t}</div>
            <Inp label="Height" value={cc.dims?.[t]?.h} onChange={v=>setCCDim(t,"h",v)} type="number" mono sx={{flex:1,marginBottom:8}}/>
            <Inp label="Depth" value={cc.dims?.[t]?.d} onChange={v=>setCCDim(t,"d",v)} type="number" mono sx={{flex:1,marginBottom:8}}/>
          </div>)}
          <Sel label="Project finish (board $/m²)" value={cc.defaultFinishId}
            onChange={v=>setCC("defaultFinishId",parseInt(v))}
            options={(cc.finishes||[]).map(f=>({value:f.id,label:`${f.name} — $${f.rate}/m²`}))}/>
        </div>

        {/* Install + logistics */}
        <div>
          <div style={{fontWeight:600,fontSize:11,color:T.muted,textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:8}}>Install, PM & Delivery</div>
          <Row gap={8}>
            <Inp label="Install $/hr" value={cc.installHourlyRate} onChange={v=>setCC("installHourlyRate",v)} type="number" mono sx={{flex:1}}/>
            <Inp label="Site setup hrs" value={cc.installSiteSetupHours} onChange={v=>setCC("installSiteSetupHours",v)} type="number" mono sx={{flex:1}}/>
          </Row>
          <Inp label="Project management allocation $" value={cc.pmAllowance} onChange={v=>setCC("pmAllowance",v)} type="number" mono/>
          <Inp label="Delivery / handling $" value={cc.deliveryAllowance} onChange={v=>setCC("deliveryAllowance",v)} type="number" mono/>
          <Inp label="Site protection $" value={cc.protectionAllowance} onChange={v=>setCC("protectionAllowance",v)} type="number" mono/>
          <div style={{fontSize:11,color:T.faint,marginTop:4}}>
            PM, delivery, protection and site-setup hours are added to the estimate total before GST.
          </div>
        </div>
      </div>

      {/* Live price preview */}
      <div style={{marginTop:12,padding:"10px 14px",background:T.bg,borderRadius:6,border:`1px solid ${T.border}`}}>
        <div style={{fontWeight:600,fontSize:11,color:T.muted,marginBottom:6,textTransform:"uppercase",letterSpacing:"0.05em"}}>Live price check</div>
        <Row gap={18} wrap>
          {[{type:"Base",config:"2 Door",width:900},{type:"Base",config:"3 Drawer",width:900},
            {type:"Overhead",config:"2 Door",width:900},{type:"Tall",config:"2 Door",width:900}].map((s,i)=>{
            const pr=priceCabLine(s,cc);
            return <div key={i} style={{fontSize:11}}>
              <span style={{color:T.muted}}>{s.type} {s.config} {s.width}: </span>
              <span style={{fontFamily:T.mono,color:T.accent,fontWeight:700}}>{$$(pr.unitCost)}</span>
              <span style={{color:T.faint}}> (supply {$$(pr.supply,true)} + install {pr.installHours}h)</span>
            </div>;
          })}
        </Row>
      </div>
    </Card>}

    {/* Rate Library picker */}
    {showRates&&<Card hi sx={{marginBottom:14}}>
      <div style={{fontWeight:700,marginBottom:10,color:T.blue}}>Rate Library — click to add</div>
      <div style={{maxHeight:220,overflowY:"auto"}}>
        {rates.map(r=><div key={r.id} style={{display:"flex",justifyContent:"space-between",
          alignItems:"center",padding:"7px 0",borderBottom:`1px solid ${T.border}`}}>
          <div>
            <span style={{fontSize:11,color:T.muted}}>{r.category} / </span>
            <span style={{fontSize:13,color:T.text}}>{r.description}</span>
          </div>
          <Row gap={10}>
            <span style={{fontFamily:T.mono,color:T.accent,fontSize:12}}>${r.rate}/{r.unit}</span>
            <Btn sm v="blu" onClick={()=>{
              onMutate(p=>({...p,lineItems:[...(p.lineItems||[]),{id:Date.now(),
                category:r.category,description:r.description,qty:1,unit:r.unit,
                rate:r.rate,margin:proj.margin||20,source:"rate"}]}));
              setShowRates(false); pop("Rate added.");
            }}>Add</Btn>
          </Row>
        </div>)}
      </div>
      <Btn sm sx={{marginTop:8}} onClick={()=>setShowRates(false)}>Close</Btn>
    </Card>}

    {/* Add item form */}
    {showAdd&&<Card hi sx={{marginBottom:14}}>
      <div style={{fontWeight:700,marginBottom:10,color:T.accent}}>New Line Item</div>
      <Grid2 gap={10}>
        <Sel label="Category" value={nli.category} onChange={v=>setNli(x=>({...x,category:v}))} options={CATS}/>
        <div/>
        <Inp label="Description" value={nli.description} onChange={v=>setNli(x=>({...x,description:v}))}
          placeholder="Description of work" sx={{gridColumn:"1/-1"}}/>
        <Inp label="Qty" value={nli.qty} onChange={v=>setNli(x=>({...x,qty:v}))} type="number" mono/>
        <Sel label="Unit" value={nli.unit} onChange={v=>setNli(x=>({...x,unit:v}))} options={UNITS}/>
        <Inp label="Rate ($)" value={nli.rate} onChange={v=>setNli(x=>({...x,rate:v}))} type="number" mono/>
        <Inp label="Margin (%)" value={nli.margin} onChange={v=>setNli(x=>({...x,margin:v}))} type="number" mono/>
      </Grid2>
      <div style={{color:T.muted,fontSize:12,marginBottom:8}}>
        Line total: <span style={{color:T.accent,fontFamily:T.mono,fontWeight:700}}>
          {$$(nli.qty*nli.rate*(1+nli.margin/100))}
        </span>
      </div>
      <Row gap={8}><Btn v="pri" onClick={addLI}>Add Item</Btn><Btn onClick={()=>setShowAdd(false)}>Cancel</Btn></Row>
    </Card>}

    {!(proj.lineItems||[]).length&&<Card sx={{textAlign:"center",padding:40,color:T.faint}}>
      No line items yet. Add manually, import from Rate Library, or import from Takeoff.
    </Card>}

    {/* Line items by category */}
    {grouped.map(cat=>{
      const catItems=(proj.lineItems||[]).filter(li=>li.category===cat);
      const catTotal=catItems.reduce((s,li)=>s+(li.qty||0)*(li.rate||0)*(1+((li.margin||0)/100)),0);
      return <div key={cat} style={{marginBottom:14}}>
        <Row gap={8} sx={{marginBottom:5}}>
          <div style={{color:T.muted,fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.06em"}}>{cat}</div>
          <div style={{color:T.faint,fontSize:12,fontFamily:T.mono}}>{$$(catTotal,true)}</div>
        </Row>
        <Card sx={{padding:0,overflow:"hidden"}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
            <thead><tr style={{background:T.bg,color:T.faint,fontSize:11,textAlign:"left"}}>
              {["Description","Qty","Unit","Rate","Margin%","Total","Src",""].map(h=>
                <th key={h} style={{padding:"6px 9px",fontWeight:600}}>{h}</th>)}
            </tr></thead>
            <tbody>{catItems.map(li=>{
              const t=(li.qty||0)*(li.rate||0)*(1+((li.margin||0)/100));
              return <tr key={li.id} style={{borderTop:`1px solid ${T.border}`}}>
                <td style={{padding:"8px 9px"}}>
                  <input value={li.description} onChange={e=>updLI(li.id,"description",e.target.value)}
                    style={{background:"transparent",border:"none",color:T.text,fontSize:12,
                      fontFamily:T.font,width:"100%",outline:"none"}}/>
                </td>
                <td style={{padding:"8px 9px"}}>
                  <input type="number" value={li.qty} onChange={e=>updLI(li.id,"qty",e.target.value)}
                    style={{width:58,background:T.bg,border:`1px solid ${T.border}`,borderRadius:4,
                      padding:"3px 6px",color:T.text,fontFamily:T.mono,fontSize:12}}/>
                </td>
                <td style={{padding:"8px 9px",color:T.muted,fontSize:11}}>{li.unit}</td>
                <td style={{padding:"8px 9px"}}>
                  <input type="number" value={li.rate} onChange={e=>updLI(li.id,"rate",e.target.value)}
                    style={{width:72,background:T.bg,border:`1px solid ${T.border}`,borderRadius:4,
                      padding:"3px 6px",color:T.text,fontFamily:T.mono,fontSize:12}}/>
                </td>
                <td style={{padding:"8px 9px"}}>
                  <input type="number" value={li.margin??proj.margin??0} onChange={e=>updLI(li.id,"margin",e.target.value)}
                    style={{width:48,background:T.bg,border:`1px solid ${T.border}`,borderRadius:4,
                      padding:"3px 6px",color:T.text,fontFamily:T.mono,fontSize:12}}/>
                </td>
                <td style={{padding:"8px 9px",fontFamily:T.mono,fontWeight:700,color:T.accent}}>{$$(t)}</td>
                <td style={{padding:"8px 9px"}}>
                  <Bdg color={li.source==="takeoff"?T.teal:li.source==="rate"?T.blue:T.faint} sm>{li.source?.slice(0,1)||"m"}</Bdg>
                </td>
                <td style={{padding:"8px 9px"}}>
                  <span style={{cursor:"pointer",color:T.red,fontSize:13}} onClick={()=>delLI(li.id)}>✕</span>
                </td>
              </tr>;
            })}</tbody>
          </table>
        </Card>
      </div>;
    })}

    {/* Totals */}
    {(proj.lineItems||[]).length>0&&<div style={{display:"flex",justifyContent:"flex-end",marginTop:8}}>
      <Card sx={{width:330}}>
        {[
          {l:`Subtotal (ex. overhead)`,   v:$$(c.sub)},
          {l:`Overhead (${proj.overhead}%)`,  v:$$(c.ovhd)},
          c.varTotal!==0&&{l:`Approved variations`,v:$$(c.varTotal)},
          (c.extras||0)!==0&&{l:`PM / delivery / handling`,v:$$(c.extras)},
          {l:`Total ex. GST`,v:$$(c.exGst),bold:true},
          {l:`GST (${proj.gst}%)`,v:$$(c.gstAmt)},
          {l:`TOTAL inc. GST`,v:$$(c.total),big:true,color:T.accent},
        ].filter(Boolean).map(r=><div key={r.l} style={{
          display:"flex",justifyContent:"space-between",alignItems:"baseline",
          padding:r.big?"10px 0 0":"5px 0",borderTop:r.big?`1px solid ${T.border}`:"none"}}>
          <span style={{color:T.muted,fontSize:12}}>{r.l}</span>
          <span style={{fontFamily:T.mono,color:r.color||T.text,
            fontWeight:r.big?800:r.bold?700:400,fontSize:r.big?18:13}}>{r.v}</span>
        </div>)}
        <Grid3 gap={8} sx={{marginTop:12}}>
          <Inp label="Overhead %" value={proj.overhead} onChange={v=>onMutate(p=>({...p,overhead:v}))} type="number" mono sx={{marginBottom:0}}/>
          <Inp label="GST %" value={proj.gst} onChange={v=>onMutate(p=>({...p,gst:v}))} type="number" mono sx={{marginBottom:0}}/>
          <Inp label="Default Margin %" value={proj.margin} onChange={v=>onMutate(p=>({...p,margin:v}))} type="number" mono sx={{marginBottom:0}}/>
        </Grid3>
      </Card>
    </div>}
  </div>;
}

// ═══════════════════════════════════════════════════════════════════════════
// QUOTE MODULE
// ═══════════════════════════════════════════════════════════════════════════
function QuoteModule({proj, company, c, onMutate, pop}) {
  const today = new Date().toLocaleDateString("en-AU",{day:"numeric",month:"long",year:"numeric"});
  const expiry = new Date(Date.now()+30*86400000).toLocaleDateString("en-AU",{day:"numeric",month:"long",year:"numeric"});
  const ref = `Q-${proj.id}-${new Date().getFullYear()}`;
  const grouped = CATS.filter(cat=>(proj.lineItems||[]).some(li=>li.category===cat));
  const depositAmt = c.total*((proj.depositPct||0)/100);

  return <div>
    <Row gap={8} sx={{marginBottom:16,flexWrap:"wrap"}}>
      <Btn v="pri" onClick={()=>{ window.print(); pop("Use browser Print → Save as PDF","info"); }}>⎙ Print / Save PDF</Btn>
      <Btn v="blu" onClick={()=>pop("Open your email client to send the saved PDF.","info")}>✉ Email Client</Btn>
      {["sent","quoting"].includes(proj.status)&&<>
        <Btn v="grn" onClick={()=>{onMutate(p=>({...p,status:"approved"}));pop("Quote marked ACCEPTED — project approved. 🎉");}}>✓ Client Accepted</Btn>
        <Btn v="red" onClick={()=>{onMutate(p=>({...p,status:"lost"}));pop("Quote marked as lost.","info");}}>✕ Lost</Btn>
      </>}
      <div style={{marginLeft:"auto",display:"flex",alignItems:"flex-end",gap:8}}>
        <Inp label="Deposit %" value={proj.depositPct||0} onChange={v=>onMutate(p=>({...p,depositPct:v}))} type="number" mono sx={{width:90,marginBottom:0}}/>
        {depositAmt>0&&<span style={{fontFamily:T.mono,color:T.green,fontWeight:700,fontSize:13,paddingBottom:9}}>{$$(depositAmt,true)} deposit</span>}
      </div>
    </Row>

    {/* Print-ready white document */}
    <div style={{background:"#fff",color:"#111827",borderRadius:8,padding:"44px 54px",
      maxWidth:840,fontFamily:"Georgia,serif",fontSize:13,lineHeight:1.65,margin:"0 auto",
      boxShadow:"0 4px 40px rgba(0,0,0,0.5)"}}>

      {/* Header */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:28}}>
        <div>
          <div style={{fontWeight:900,fontSize:22,color:"#111827",fontFamily:"system-ui,sans-serif",marginBottom:4}}>{company.name}</div>
          <div style={{color:"#6b7280",fontSize:12,lineHeight:1.75}}>
            {company.address}<br/>
            {company.phone} · {company.email}<br/>
            {company.website}
            {company.abn&&<><br/>ABN / NZBN: {company.abn}</>}
          </div>
        </div>
        <div style={{textAlign:"right"}}>
          <div style={{fontWeight:900,fontSize:32,color:"#b45309",fontFamily:"system-ui,sans-serif",letterSpacing:"-1px"}}>QUOTE</div>
          <div style={{color:"#6b7280",fontSize:12,marginTop:6,lineHeight:1.75}}>
            Ref: <strong>{ref}</strong><br/>
            Date: {today}<br/>
            Valid until: {expiry}
          </div>
        </div>
      </div>
      <hr style={{border:"none",borderTop:"2px solid #b45309",marginBottom:24}}/>

      {/* Client */}
      <div style={{marginBottom:20}}>
        <div style={{fontWeight:700,fontSize:11,textTransform:"uppercase",letterSpacing:"0.08em",
          color:"#9ca3af",marginBottom:5,fontFamily:"system-ui,sans-serif"}}>Prepared For</div>
        <div style={{fontWeight:700,fontSize:15}}>{proj.client}</div>
        <div style={{color:"#6b7280"}}>{proj.address}</div>
      </div>

      {/* Project */}
      <div style={{marginBottom:22,background:"#faf7f2",borderRadius:6,padding:"12px 18px"}}>
        <div style={{fontWeight:700,fontFamily:"system-ui,sans-serif",marginBottom:3}}>{proj.name}</div>
        {(proj.description||proj.notes)&&<div style={{color:"#6b7280",fontSize:12}}>{proj.description||proj.notes}</div>}
      </div>

      {/* Line items by category */}
      {grouped.map(cat=>{
        const catItems=(proj.lineItems||[]).filter(li=>li.category===cat);
        return <div key={cat} style={{marginBottom:18}}>
          <div style={{fontWeight:700,fontFamily:"system-ui,sans-serif",fontSize:11,
            textTransform:"uppercase",letterSpacing:"0.05em",color:"#b45309",
            marginBottom:5,paddingBottom:3,borderBottom:"1px solid #e8d8b0"}}>{cat}</div>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
            <thead><tr style={{color:"#9ca3af",textAlign:"left",fontFamily:"system-ui,sans-serif",fontSize:11}}>
              <th style={{padding:"3px 0",fontWeight:600}}>Description</th>
              <th style={{padding:"3px 8px",textAlign:"right",fontWeight:600}}>Qty</th>
              <th style={{padding:"3px 8px",textAlign:"right",fontWeight:600}}>Unit</th>
              <th style={{padding:"3px 0",textAlign:"right",fontWeight:600}}>Amount</th>
            </tr></thead>
            <tbody>{catItems.map(li=><tr key={li.id} style={{borderBottom:"1px solid #f0e8d8"}}>
              <td style={{padding:"5px 0"}}>{li.description}</td>
              <td style={{padding:"5px 8px",textAlign:"right",fontFamily:"monospace"}}>{li.qty}</td>
              <td style={{padding:"5px 8px",textAlign:"right",color:"#9ca3af"}}>{li.unit}</td>
              <td style={{padding:"5px 0",textAlign:"right",fontFamily:"monospace",fontWeight:600}}>
                {$$((li.qty||0)*(li.rate||0))}
              </td>
            </tr>)}</tbody>
          </table>
        </div>;
      })}

      {/* Approved Variations */}
      {(proj.variations||[]).filter(v=>v.status==="approved").length>0&&<div style={{marginBottom:18}}>
        <div style={{fontWeight:700,fontFamily:"system-ui,sans-serif",fontSize:11,textTransform:"uppercase",
          color:"#b45309",marginBottom:5,paddingBottom:3,borderBottom:"1px solid #e8d8b0"}}>Approved Variations</div>
        {(proj.variations||[]).filter(v=>v.status==="approved").map(v=>
          <div key={v.id} style={{display:"flex",justifyContent:"space-between",padding:"4px 0",fontSize:12}}>
            <span>{v.ref}: {v.description}</span>
            <span style={{fontFamily:"monospace",fontWeight:600}}>{$$(v.amount)}</span>
          </div>)}
      </div>}

      {/* Totals */}
      <div style={{marginTop:22,borderTop:"2px solid #b45309",paddingTop:16,maxWidth:310,marginLeft:"auto"}}>
        {[
          {l:"Subtotal",v:$$(c.sub)},
          {l:`Overhead & Margin (${proj.overhead}%)`,v:$$(c.ovhd)},
          c.varTotal!==0&&{l:"Approved Variations",v:$$(c.varTotal)},
          (c.extras||0)!==0&&{l:"Project Management, Delivery & Handling",v:$$(c.extras)},
          {l:"Total ex. GST",v:$$(c.exGst),bold:true},
          {l:`GST (${proj.gst}%)`,v:$$(c.gstAmt)},
        ].filter(Boolean).map(r=><div key={r.l} style={{display:"flex",justifyContent:"space-between",marginBottom:5}}>
          <span style={{color:"#6b7280",fontFamily:"system-ui,sans-serif",fontSize:12}}>{r.l}</span>
          <span style={{fontFamily:"monospace",fontWeight:r.bold?700:400}}>{r.v}</span>
        </div>)}
        <div style={{display:"flex",justifyContent:"space-between",borderTop:"2px solid #111827",paddingTop:9,marginTop:6}}>
          <span style={{fontWeight:900,fontFamily:"system-ui,sans-serif",fontSize:15}}>TOTAL (inc. GST)</span>
          <span style={{fontFamily:"monospace",fontWeight:900,fontSize:17,color:"#b45309"}}>{$$(c.total)}</span>
        </div>
        {(proj.depositPct||0)>0&&<div style={{marginTop:8,paddingTop:7,borderTop:"1px dashed #d1d5db"}}>
          <div style={{display:"flex",justifyContent:"space-between",fontSize:12}}>
            <span style={{color:"#6b7280",fontFamily:"system-ui,sans-serif"}}>Deposit on acceptance ({proj.depositPct}%)</span>
            <span style={{fontFamily:"monospace",fontWeight:700,color:"#166534"}}>{$$(depositAmt)}</span>
          </div>
          <div style={{display:"flex",justifyContent:"space-between",fontSize:12}}>
            <span style={{color:"#6b7280",fontFamily:"system-ui,sans-serif"}}>Balance per progress claims</span>
            <span style={{fontFamily:"monospace",color:"#6b7280"}}>{$$(c.total-depositAmt)}</span>
          </div>
        </div>}
      </div>

      {/* Bank details */}
      {company.bankAccount&&<div style={{marginTop:22,padding:"10px 14px",background:"#f9fafb",
        borderRadius:4,fontSize:12,color:"#6b7280",borderLeft:"3px solid #e5e7eb"}}>
        <strong style={{color:"#111827"}}>Payment Details: </strong>
        {company.bankName} · {company.bankAccount}
      </div>}

      {/* Footer */}
      <div style={{marginTop:16,fontSize:11,color:"#9ca3af",borderTop:"1px solid #f3f4f6",paddingTop:12,lineHeight:1.7}}>
        {company.quoteValidity||"This quote is valid for 30 days."}<br/>
        {company.paymentTerms||"Payment due within 14 days of invoice date."}<br/>
        All pricing in {company.currency||"AUD"}, GST included at {proj.gst}%.
        Work to be carried out in accordance with applicable building codes and regulations.
      </div>
    </div>
  </div>;
}

// ═══════════════════════════════════════════════════════════════════════════
// SCHEDULE MODULE — task list with timeline bars
// ═══════════════════════════════════════════════════════════════════════════
function ScheduleModule({proj, onMutate, pop}) {
  const [showAdd,setShowAdd]=useState(false);
  const today=new Date().toISOString().slice(0,10);
  const in7=new Date(Date.now()+7*86400000).toISOString().slice(0,10);
  const [nt,setNt]=useState({name:"",start:today,end:in7,assignee:"",status:"pending"});
  const tasks=proj.tasks||[];

  // timeline range
  const dates=tasks.flatMap(t=>[t.start,t.end]).filter(Boolean).sort();
  const min=dates[0]?new Date(dates[0]).getTime():Date.now();
  const max=dates[dates.length-1]?new Date(dates[dates.length-1]).getTime():Date.now()+30*86400000;
  const span=Math.max(max-min,86400000);
  const pos=d=>Math.max(0,Math.min(100,(new Date(d).getTime()-min)/span*100));
  const STAT={pending:{c:T.faint,l:"Pending"},progress:{c:T.blue,l:"In Progress"},done:{c:T.green,l:"Done"},blocked:{c:T.red,l:"Blocked"}};
  const doneN=tasks.filter(t=>t.status==="done").length;

  return <div>
    <Row gap={12} wrap sx={{marginBottom:16}}>
      <KPI label="Tasks" value={tasks.length} sub={`${doneN} complete`}/>
      <KPI label="Progress" value={tasks.length?`${Math.round(doneN/tasks.length*100)}%`:"—"} sub="of schedule" color={T.green}/>
      <KPI label="In Progress" value={tasks.filter(t=>t.status==="progress").length} sub="active now" color={T.blue}/>
      <KPI label="Blocked" value={tasks.filter(t=>t.status==="blocked").length} sub="need attention" color={T.red}/>
    </Row>

    <Row gap={8} sx={{marginBottom:14}}>
      <Btn v="pri" onClick={()=>setShowAdd(!showAdd)}>+ Add Task</Btn>
    </Row>

    {showAdd&&<Card hi sx={{marginBottom:14}}>
      <div style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr 1fr",gap:10}}>
        <Inp label="Task" value={nt.name} onChange={v=>setNt(x=>({...x,name:v}))} placeholder="e.g. Carcass manufacture"/>
        <Inp label="Start" value={nt.start} onChange={v=>setNt(x=>({...x,start:v}))} type="date"/>
        <Inp label="End" value={nt.end} onChange={v=>setNt(x=>({...x,end:v}))} type="date"/>
        <Inp label="Assignee / Crew" value={nt.assignee} onChange={v=>setNt(x=>({...x,assignee:v}))} placeholder="Optional"/>
      </div>
      <Row gap={8}><Btn v="pri" sm onClick={()=>{
        if(!nt.name) return pop("Task name required.","error");
        onMutate(p=>({...p,tasks:[...(p.tasks||[]),{...nt,id:Date.now()}]}));
        setNt({name:"",start:today,end:in7,assignee:"",status:"pending"});
        setShowAdd(false); pop("Task added.");
      }}>Add</Btn><Btn sm onClick={()=>setShowAdd(false)}>Cancel</Btn></Row>
    </Card>}

    {tasks.length>0
      ? <Card sx={{padding:0,overflow:"hidden"}}>
          {tasks.map(t=>{
            const st=STAT[t.status]||STAT.pending;
            const l=pos(t.start), r=pos(t.end);
            return <div key={t.id} style={{borderBottom:`1px solid ${T.border}`,padding:"10px 16px"}}>
              <Row gap={10} sx={{marginBottom:6}}>
                <span style={{fontWeight:600,fontSize:13,color:t.status==="done"?T.muted:T.text,
                  textDecoration:t.status==="done"?"line-through":"none"}}>{t.name}</span>
                {t.assignee&&<span style={{color:T.faint,fontSize:11}}>· {t.assignee}</span>}
                <span style={{color:T.faint,fontSize:11,fontFamily:T.mono}}>{t.start} → {t.end}</span>
                <div style={{marginLeft:"auto",display:"flex",gap:6,alignItems:"center"}}>
                  <select value={t.status} onChange={e=>onMutate(p=>({...p,tasks:p.tasks.map(x=>x.id===t.id?{...x,status:e.target.value}:x)}))}
                    style={{background:T.bg,border:`1px solid ${T.border}`,borderRadius:4,padding:"2px 6px",color:st.c,fontSize:11,fontWeight:600}}>
                    {Object.entries(STAT).map(([k,v])=><option key={k} value={k}>{v.l}</option>)}
                  </select>
                  <span style={{cursor:"pointer",color:T.red,fontSize:12}}
                    onClick={()=>onMutate(p=>({...p,tasks:p.tasks.filter(x=>x.id!==t.id)}))}>✕</span>
                </div>
              </Row>
              <div style={{position:"relative",height:10,background:T.bg,borderRadius:5}}>
                <div style={{position:"absolute",left:`${l}%`,width:`${Math.max(r-l,1.5)}%`,top:0,height:"100%",
                  borderRadius:5,background:st.c,opacity:t.status==="done"?0.45:0.9,transition:"all 0.3s"}}/>
                {/* today marker */}
                <div style={{position:"absolute",left:`${pos(today)}%`,top:-2,bottom:-2,width:2,background:T.accent,borderRadius:1}}/>
              </div>
            </div>;
          })}
        </Card>
      : <Card sx={{textAlign:"center",padding:36,color:T.faint}}>
          No tasks yet. Build the job programme — manufacture, delivery, install stages — and track progress against the timeline. The amber line marks today.
        </Card>}
  </div>;
}

// ═══════════════════════════════════════════════════════════════════════════
// JOB COST MODULE
// ═══════════════════════════════════════════════════════════════════════════
function JobCostModule({proj, onMutate, c, pop}) {
  const [showAct, setShowAct] = useState(false);
  const [showVar, setShowVar] = useState(false);
  const [showPO,  setShowPO]  = useState(false);
  const [na, setNa] = useState({category:CATS[0],description:"",amount:0,date:new Date().toISOString().slice(0,10),supplier:""});
  const [nv, setNv] = useState({ref:`VAR-${String((proj.variations||[]).length+1).padStart(3,"0")}`,description:"",amount:0,status:"pending",date:new Date().toISOString().slice(0,10)});
  const [npo,setNpo]= useState({ref:`PO-${String((proj.purchaseOrders||[]).length+1).padStart(3,"0")}`,supplier:"",category:CATS[0],description:"",amount:0,status:"draft",date:new Date().toISOString().slice(0,10)});

  const pos=proj.purchaseOrders||[];
  const poCommitted=pos.filter(po=>po.status!=="draft").reduce((s,po)=>s+(po.amount||0),0);

  function receivePO(po){
    // Mark received and book the cost as an actual in one step
    onMutate(p=>({...p,
      purchaseOrders:p.purchaseOrders.map(x=>x.id===po.id?{...x,status:"received"}:x),
      actualCosts:[...(p.actualCosts||[]),{id:Date.now(),category:po.category,
        description:`${po.ref}: ${po.description}`,amount:po.amount,date:new Date().toISOString().slice(0,10),supplier:po.supplier}],
    }));
    pop(`${po.ref} received — cost booked to actuals.`);
  }

  const variance = c.exGst - c.actTotal;
  const vPct = c.exGst>0 ? variance/c.exGst*100 : 0;

  return <div>
    <Row gap={12} wrap sx={{marginBottom:18}}>
      <KPI label="Budget ex. GST" value={$$(c.exGst,true)} sub="quoted"/>
      <KPI label="Actual Costs" value={$$(c.actTotal,true)} sub={`${(proj.actualCosts||[]).length} entries`} color={T.blue}/>
      <KPI label="Committed (POs)" value={$$(poCommitted,true)} sub={`${pos.filter(p2=>p2.status!=="draft").length} live orders`} color={T.purple}/>
      <KPI label="Variance" value={$$(Math.abs(variance),true)}
        sub={`${vPct>=0?"Under":"OVER"} budget ${Math.abs(vPct).toFixed(1)}%`}
        color={vPct>=0?T.green:T.red}/>
      <KPI label="Variations" value={$$(c.varTotal,true)}
        sub={`${(proj.variations||[]).filter(v=>v.status==="approved").length} approved`} color={T.yellow}/>
    </Row>

    {/* ── PURCHASE ORDERS */}
    <Card sx={{marginBottom:16}}>
      <Row gap={8} sx={{marginBottom:10}}>
        <div style={{fontWeight:700,fontSize:13}}>Purchase Orders</div>
        <Btn sm v="pur" onClick={()=>setShowPO(!showPO)}>+ New PO</Btn>
        <div style={{color:T.faint,fontSize:11,marginLeft:"auto"}}>draft → sent → received (books to actuals) → billed</div>
      </Row>
      {showPO&&<Card hi sx={{marginBottom:10}}>
        <div style={{display:"grid",gridTemplateColumns:"100px 1fr 1fr",gap:8}}>
          <Inp label="PO Ref" value={npo.ref} onChange={v=>setNpo(x=>({...x,ref:v}))}/>
          <Inp label="Supplier" value={npo.supplier} onChange={v=>setNpo(x=>({...x,supplier:v}))} placeholder="Supplier name"/>
          <Sel label="Category" value={npo.category} onChange={v=>setNpo(x=>({...x,category:v}))} options={CATS}/>
          <Inp label="Amount ex. GST" value={npo.amount} onChange={v=>setNpo(x=>({...x,amount:v}))} type="number" mono/>
          <Inp label="Description" value={npo.description} onChange={v=>setNpo(x=>({...x,description:v}))} sx={{gridColumn:"2/-1"}}/>
        </div>
        <Row gap={8}><Btn v="pri" sm onClick={()=>{
          if(!npo.supplier||!npo.amount) return pop("Supplier and amount required.","error");
          onMutate(p=>({...p,purchaseOrders:[...(p.purchaseOrders||[]),{...npo,id:Date.now(),amount:parseFloat(npo.amount)||0}]}));
          setNpo({ref:`PO-${String(pos.length+2).padStart(3,"0")}`,supplier:"",category:CATS[0],description:"",amount:0,status:"draft",date:new Date().toISOString().slice(0,10)});
          setShowPO(false); pop("PO created.");
        }}>Create PO</Btn><Btn sm onClick={()=>setShowPO(false)}>Cancel</Btn></Row>
      </Card>}
      {pos.length>0
        ? <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
            <thead><tr style={{color:T.faint,fontSize:11,textAlign:"left"}}>
              {["Ref","Supplier","Category","Description","Amount","Status",""].map(h=><th key={h} style={{padding:"5px 8px",fontWeight:600}}>{h}</th>)}
            </tr></thead>
            <tbody>{pos.map(po=><tr key={po.id} style={{borderTop:`1px solid ${T.border}`}}>
              <td style={{padding:"8px 8px",fontFamily:T.mono,color:T.purple,fontWeight:700}}>{po.ref}</td>
              <td style={{padding:"8px 8px",color:T.text}}>{po.supplier}</td>
              <td style={{padding:"8px 8px"}}><Bdg color={T.blue} sm>{po.category}</Bdg></td>
              <td style={{padding:"8px 8px",color:T.muted}}>{po.description}</td>
              <td style={{padding:"8px 8px",fontFamily:T.mono,color:T.accent,fontWeight:700}}>{$$(po.amount)}</td>
              <td style={{padding:"8px 8px"}}>
                <Bdg color={po.status==="received"?T.green:po.status==="billed"?T.teal:po.status==="sent"?T.blue:T.faint} sm>{po.status}</Bdg>
              </td>
              <td style={{padding:"8px 8px"}}>
                <Row gap={5}>
                  {po.status==="draft"&&<Btn sm v="blu" onClick={()=>{onMutate(p=>({...p,purchaseOrders:p.purchaseOrders.map(x=>x.id===po.id?{...x,status:"sent"}:x)}));pop(`${po.ref} marked sent.`);}}>Send</Btn>}
                  {po.status==="sent"&&<Btn sm v="grn" onClick={()=>receivePO(po)}>Receive</Btn>}
                  {po.status==="received"&&<Btn sm v="tel" onClick={()=>{onMutate(p=>({...p,purchaseOrders:p.purchaseOrders.map(x=>x.id===po.id?{...x,status:"billed"}:x)}));pop(`${po.ref} billed.`);}}>Billed</Btn>}
                  <span style={{cursor:"pointer",color:T.red,fontSize:12}}
                    onClick={()=>onMutate(p=>({...p,purchaseOrders:p.purchaseOrders.filter(x=>x.id!==po.id)}))}>✕</span>
                </Row>
              </td>
            </tr>)}</tbody>
          </table>
        : <div style={{color:T.faint,fontSize:12}}>No purchase orders. Raise POs to suppliers and track committed costs before invoices land.</div>}
    </Card>

    {c.exGst>0&&<Card sx={{marginBottom:16}}>
      <div style={{fontWeight:700,fontSize:13,marginBottom:10}}>Budget vs Actual</div>
      <div style={{background:T.bg,borderRadius:5,height:20,overflow:"hidden",position:"relative"}}>
        <div style={{position:"absolute",left:0,top:0,height:"100%",borderRadius:5,
          background:`linear-gradient(90deg,${T.blue},${T.teal})`,
          width:`${Math.min(100,c.exGst>0?c.actTotal/c.exGst*100:0)}%`,transition:"width 0.5s"}}/>
        <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",padding:"0 10px"}}>
          <span style={{fontFamily:T.mono,fontSize:11,fontWeight:700,color:"#fff",textShadow:"0 1px 3px rgba(0,0,0,0.8)"}}>
            {c.exGst>0?(c.actTotal/c.exGst*100).toFixed(1):0}% · {$$(c.actTotal,true)} of {$$(c.exGst,true)}
          </span>
        </div>
      </div>
    </Card>}

    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
      {/* Actual costs */}
      <div>
        <Row gap={8} sx={{marginBottom:10}}>
          <div style={{fontWeight:700,fontSize:13}}>Actual Costs</div>
          <Btn sm v="grn" onClick={()=>setShowAct(!showAct)}>+ Add Cost</Btn>
        </Row>
        {showAct&&<Card hi sx={{marginBottom:10}}>
          <Grid2 gap={8}>
            <Sel label="Category" value={na.category} onChange={v=>setNa(x=>({...x,category:v}))} options={CATS}/>
            <Inp label="Date" value={na.date} onChange={v=>setNa(x=>({...x,date:v}))} type="date"/>
            <Inp label="Description" value={na.description} onChange={v=>setNa(x=>({...x,description:v}))}
              placeholder="Invoice or cost description" sx={{gridColumn:"1/-1"}}/>
            <Inp label="Amount (ex. GST)" value={na.amount} onChange={v=>setNa(x=>({...x,amount:v}))} type="number" mono/>
            <Inp label="Supplier" value={na.supplier} onChange={v=>setNa(x=>({...x,supplier:v}))} placeholder="Supplier name"/>
          </Grid2>
          <Row gap={8}><Btn v="pri" sm onClick={()=>{
            onMutate(p=>({...p,actualCosts:[...(p.actualCosts||[]),{...na,id:Date.now(),amount:parseFloat(na.amount)||0}]}));
            setNa({category:CATS[0],description:"",amount:0,date:new Date().toISOString().slice(0,10),supplier:""});
            setShowAct(false); pop("Cost added.");
          }}>Save</Btn><Btn sm onClick={()=>setShowAct(false)}>Cancel</Btn></Row>
        </Card>}
        {(proj.actualCosts||[]).map(a=><div key={a.id} style={{display:"flex",justifyContent:"space-between",
          padding:"9px 0",borderBottom:`1px solid ${T.border}`,alignItems:"flex-start"}}>
          <div>
            <div style={{fontSize:13,color:T.text}}>{a.description}</div>
            <div style={{fontSize:11,color:T.faint}}>{a.supplier}{a.supplier&&" · "}{a.date} · {a.category}</div>
          </div>
          <Row gap={8}>
            <span style={{fontFamily:T.mono,color:T.blue,fontWeight:700}}>{$$(a.amount)}</span>
            <span style={{cursor:"pointer",color:T.red,fontSize:12}}
              onClick={()=>onMutate(p=>({...p,actualCosts:p.actualCosts.filter(x=>x.id!==a.id)}))}>✕</span>
          </Row>
        </div>)}
        {!(proj.actualCosts||[]).length&&<div style={{color:T.faint,fontSize:12}}>No actual costs recorded.</div>}
        {(proj.actualCosts||[]).length>0&&<div style={{marginTop:10,display:"flex",justifyContent:"flex-end"}}>
          <span style={{fontFamily:T.mono,fontWeight:700,color:T.blue,fontSize:14}}>{$$(c.actTotal)}</span>
        </div>}
      </div>

      {/* Variations */}
      <div>
        <Row gap={8} sx={{marginBottom:10}}>
          <div style={{fontWeight:700,fontSize:13}}>Variations / Change Orders</div>
          <Btn sm v="yel" onClick={()=>setShowVar(!showVar)}>+ Add Variation</Btn>
        </Row>
        {showVar&&<Card hi sx={{marginBottom:10}}>
          <Grid2 gap={8}>
            <Inp label="Ref" value={nv.ref} onChange={v=>setNv(x=>({...x,ref:v}))}/>
            <Inp label="Date" value={nv.date} onChange={v=>setNv(x=>({...x,date:v}))} type="date"/>
            <Inp label="Description" value={nv.description} onChange={v=>setNv(x=>({...x,description:v}))}
              sx={{gridColumn:"1/-1"}}/>
            <Inp label="Amount ($)" value={nv.amount} onChange={v=>setNv(x=>({...x,amount:v}))} type="number" mono/>
            <Sel label="Status" value={nv.status} onChange={v=>setNv(x=>({...x,status:v}))}
              options={["pending","approved","rejected"]}/>
          </Grid2>
          <Row gap={8}><Btn v="pri" sm onClick={()=>{
            onMutate(p=>({...p,variations:[...(p.variations||[]),{...nv,id:Date.now(),amount:parseFloat(nv.amount)||0}]}));
            setNv({ref:`VAR-${String((proj.variations||[]).length+2).padStart(3,"0")}`,description:"",amount:0,status:"pending",date:new Date().toISOString().slice(0,10)});
            setShowVar(false); pop("Variation added.");
          }}>Save</Btn><Btn sm onClick={()=>setShowVar(false)}>Cancel</Btn></Row>
        </Card>}
        {(proj.variations||[]).map(v=><div key={v.id} style={{display:"flex",justifyContent:"space-between",
          padding:"9px 0",borderBottom:`1px solid ${T.border}`,alignItems:"flex-start"}}>
          <div>
            <div style={{fontSize:13,color:T.text,fontWeight:600}}>{v.ref}: {v.description}</div>
            <div style={{fontSize:11,color:T.faint}}>{v.date}</div>
          </div>
          <Row gap={8}>
            <Bdg color={v.status==="approved"?T.green:v.status==="rejected"?T.red:T.yellow} sm>{v.status}</Bdg>
            <span style={{fontFamily:T.mono,color:v.status==="approved"?T.green:T.muted,fontWeight:700}}>{$$(v.amount)}</span>
            <select value={v.status}
              onChange={e=>onMutate(p=>({...p,variations:p.variations.map(x=>x.id===v.id?{...x,status:e.target.value}:x)}))}
              style={{background:T.bg,border:`1px solid ${T.border}`,borderRadius:4,padding:"2px 5px",color:T.text,fontSize:11}}>
              <option>pending</option><option>approved</option><option>rejected</option>
            </select>
            <span style={{cursor:"pointer",color:T.red,fontSize:12}}
              onClick={()=>onMutate(p=>({...p,variations:p.variations.filter(x=>x.id!==v.id)}))}>✕</span>
          </Row>
        </div>)}
        {!(proj.variations||[]).length&&<div style={{color:T.faint,fontSize:12}}>No variations yet.</div>}
      </div>
    </div>
  </div>;
}

// ═══════════════════════════════════════════════════════════════════════════
// CLAIMS MODULE
// ═══════════════════════════════════════════════════════════════════════════
function ClaimsModule({proj, onMutate, c, onPushXero, pop}) {
  const [showAdd, setShowAdd] = useState(false);
  const [nc, setNc] = useState({
    ref:`PC-${String((proj.claims||[]).length+1).padStart(2,"0")}`,
    description:"",pct:0,amount:0,status:"pending",
    date:new Date().toISOString().slice(0,10)
  });

  const totalClaimed = (proj.claims||[]).reduce((s,cl)=>s+(cl.amount||0),0);
  const outstanding  = c.total - totalClaimed;

  return <div>
    <Row gap={12} wrap sx={{marginBottom:18}}>
      <KPI label="Contract Value" value={$$(c.total,true)} sub="inc. GST"/>
      <KPI label="Total Claimed"  value={$$(totalClaimed,true)} sub={`${(proj.claims||[]).length} claims`} color={T.green}/>
      <KPI label="Outstanding"    value={$$(outstanding,true)} sub="remaining" color={T.yellow}/>
      <KPI label="Paid"           value={$$(proj.paid||0,true)} sub="received" color={T.teal}/>
    </Row>

    {c.total>0&&<Card sx={{marginBottom:16}}>
      <div style={{fontWeight:700,fontSize:13,marginBottom:10}}>Claim Progress</div>
      <div style={{background:T.bg,borderRadius:5,height:20,overflow:"hidden",position:"relative"}}>
        <div style={{position:"absolute",left:0,top:0,height:"100%",borderRadius:5,
          background:`linear-gradient(90deg,${T.green},${T.teal})`,
          width:`${Math.min(100,c.total>0?totalClaimed/c.total*100:0)}%`,transition:"width 0.5s"}}/>
        <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",padding:"0 10px"}}>
          <span style={{fontFamily:T.mono,fontSize:11,fontWeight:700,color:"#fff",textShadow:"0 1px 3px rgba(0,0,0,0.8)"}}>
            {(totalClaimed/c.total*100).toFixed(1)}% · {$$(totalClaimed,true)} of {$$(c.total,true)}
          </span>
        </div>
      </div>
    </Card>}

    <Row gap={8} sx={{marginBottom:14}}>
      <Btn v="pri" onClick={()=>setShowAdd(!showAdd)}>+ New Claim</Btn>
      <Btn v="grn" onClick={()=>onPushXero(proj)}>⟳ Push Invoice to Xero</Btn>
      {proj.xeroRef&&<Bdg color={T.green}>{proj.xeroRef} · {$$(proj.invoiced,true)}</Bdg>}
    </Row>

    {showAdd&&<Card hi sx={{marginBottom:14}}>
      <div style={{fontWeight:700,marginBottom:10,fontSize:13}}>New Progress Claim</div>
      <Grid2 gap={10}>
        <Inp label="Claim Ref" value={nc.ref} onChange={v=>setNc(x=>({...x,ref:v}))}/>
        <Inp label="Date" value={nc.date} onChange={v=>setNc(x=>({...x,date:v}))} type="date"/>
        <Inp label="Description" value={nc.description} onChange={v=>setNc(x=>({...x,description:v}))}
          sx={{gridColumn:"1/-1"}}/>
        <Inp label="% of Contract" value={nc.pct} type="number" mono
          onChange={v=>{ const p=parseFloat(v)||0; setNc(x=>({...x,pct:p,amount:parseFloat((c.total*p/100).toFixed(2))})); }}/>
        <Inp label="Amount ($)" value={nc.amount} onChange={v=>setNc(x=>({...x,amount:parseFloat(v)||0}))} type="number" mono/>
      </Grid2>
      <div style={{color:T.muted,fontSize:12,marginBottom:10}}>
        Claim: <span style={{color:T.accent,fontFamily:T.mono,fontWeight:700}}>{$$(nc.amount)}</span>
        {" "}({nc.pct}% of {$$(c.total,true)})
      </div>
      <Row gap={8}><Btn v="pri" onClick={()=>{
        onMutate(p=>({...p,claims:[...(p.claims||[]),{...nc,id:Date.now()}]}));
        setNc({ref:`PC-${String((proj.claims||[]).length+2).padStart(2,"0")}`,description:"",pct:0,amount:0,status:"pending",date:new Date().toISOString().slice(0,10)});
        setShowAdd(false); pop("Claim added.");
      }}>Save Claim</Btn><Btn onClick={()=>setShowAdd(false)}>Cancel</Btn></Row>
    </Card>}

    {(proj.claims||[]).length>0
      ? <Card sx={{padding:0,overflow:"hidden"}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
            <thead><tr style={{background:T.bg,color:T.faint,fontSize:11,textAlign:"left"}}>
              {["Ref","Description","Date","Amount","Status",""].map(h=>
                <th key={h} style={{padding:"7px 10px",fontWeight:600}}>{h}</th>)}
            </tr></thead>
            <tbody>{(proj.claims||[]).map(cl=><tr key={cl.id} style={{borderTop:`1px solid ${T.border}`}}>
              <td style={{padding:"9px 10px",fontFamily:T.mono,color:T.blue,fontWeight:700}}>{cl.ref}</td>
              <td style={{padding:"9px 10px",color:T.text}}>{cl.description}</td>
              <td style={{padding:"9px 10px",color:T.muted,fontSize:12}}>{cl.date}</td>
              <td style={{padding:"9px 10px",fontFamily:T.mono,fontWeight:700,color:T.accent}}>{$$(cl.amount)}</td>
              <td style={{padding:"9px 10px"}}>
                <select value={cl.status}
                  onChange={e=>onMutate(p=>({...p,claims:p.claims.map(x=>x.id===cl.id?{...x,status:e.target.value}:x)}))}
                  style={{background:T.bg,border:`1px solid ${T.border}`,borderRadius:4,padding:"3px 7px",color:T.text,fontSize:12}}>
                  <option>pending</option><option>submitted</option><option>paid</option>
                </select>
              </td>
              <td style={{padding:"9px 10px"}}>
                <span style={{cursor:"pointer",color:T.red,fontSize:12}}
                  onClick={()=>onMutate(p=>({...p,claims:p.claims.filter(x=>x.id!==cl.id)}))}>✕</span>
              </td>
            </tr>)}</tbody>
          </table>
        </Card>
      : <div style={{color:T.faint,fontSize:13}}>No progress claims yet.</div>
    }
  </div>;
}

// ═══════════════════════════════════════════════════════════════════════════
// PROJECT INFO
// ═══════════════════════════════════════════════════════════════════════════
function ProjectInfo({proj, clients, onMutate, pop}) {
  return <div>
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
      <Card>
        <div style={{fontWeight:700,fontSize:13,marginBottom:12,color:T.accent}}>Project Details</div>
        <Inp label="Project Name" value={proj.name} onChange={v=>onMutate(p=>({...p,name:v}))}/>
        <Inp label="Client" value={proj.client} onChange={v=>onMutate(p=>({...p,client:v}))}/>
        <Inp label="Site Address" value={proj.address} onChange={v=>onMutate(p=>({...p,address:v}))}/>
        <Grid2 gap={10}>
          <Inp label="Start Date" value={proj.created} onChange={v=>onMutate(p=>({...p,created:v}))} type="date"/>
          <Inp label="Due Date" value={proj.dueDate||""} onChange={v=>onMutate(p=>({...p,dueDate:v}))} type="date"/>
        </Grid2>
        <Inp label="Description" value={proj.description||""} onChange={v=>onMutate(p=>({...p,description:v}))} rows={2}/>
        <Inp label="Notes" value={proj.notes||""} onChange={v=>onMutate(p=>({...p,notes:v}))} rows={3}/>
        <Btn v="pri" onClick={()=>pop("Project info updated.")}>Save</Btn>
      </Card>
      <div>
        <Card sx={{marginBottom:14}}>
          <div style={{fontWeight:700,fontSize:13,marginBottom:12,color:T.accent}}>Financial Defaults</div>
          <Grid3 gap={10}>
            <Inp label="Margin %" value={proj.margin||0} onChange={v=>onMutate(p=>({...p,margin:v}))} type="number" mono/>
            <Inp label="Overhead %" value={proj.overhead||0} onChange={v=>onMutate(p=>({...p,overhead:v}))} type="number" mono/>
            <Inp label="GST %" value={proj.gst||0} onChange={v=>onMutate(p=>({...p,gst:v}))} type="number" mono/>
          </Grid3>
          <Inp label="Xero Invoice Ref" value={proj.xeroRef||""} onChange={v=>onMutate(p=>({...p,xeroRef:v}))}/>
          <div style={{marginTop:8}}>
            <div style={{color:T.muted,fontSize:11,marginBottom:5,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.05em"}}>Status</div>
            <Sel value={proj.status} onChange={v=>onMutate(p=>({...p,status:v}))}
              options={Object.entries(STATUS).map(([k,v])=>({value:k,label:v.label}))}/>
          </div>
        </Card>
        <Card>
          <div style={{fontWeight:700,fontSize:13,marginBottom:10,color:T.accent}}>Summary</div>
          {(()=>{const c2=calc(proj);return [
            {l:"Quote Total",v:$$(c2.total)},
            {l:"Invoiced",v:$$(proj.invoiced||0)},
            {l:"Actual Costs",v:$$(c2.actTotal)},
            {l:"Variations",v:$$(c2.varTotal)},
          ].map(r=><div key={r.l} style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:`1px solid ${T.border}`,fontSize:13}}>
            <span style={{color:T.muted}}>{r.l}</span>
            <span style={{fontFamily:T.mono,fontWeight:600,color:T.text}}>{r.v}</span>
          </div>);})()}
        </Card>
      </div>
    </div>
  </div>;
}

// ═══════════════════════════════════════════════════════════════════════════
// CLIENTS MODULE
// ═══════════════════════════════════════════════════════════════════════════
function ClientsModule({clients, setClients, projects, pop}) {
  const [sel, setSel] = useState(null);
  const [showNew, setShowNew] = useState(false);
  const [editing, setEditing] = useState(false);
  const [nc, setNc] = useState({name:"",company:"",email:"",phone:"",address:"",abn:"",notes:""});
  const [search, setSearch] = useState("");

  const client = clients.find(c=>c.id===sel);
  const clientProjs = sel ? projects.filter(p=>p.clientId===sel||p.client===client?.name) : [];
  const filtered = clients.filter(c=>!search||[c.name,c.company,c.email].join(" ").toLowerCase().includes(search.toLowerCase()));

  function saveNew() {
    if(!nc.name.trim()) return pop("Name required.","error");
    setClients(cs=>[...cs,{...nc,id:Date.now()}]);
    setNc({name:"",company:"",email:"",phone:"",address:"",abn:"",notes:""});
    setShowNew(false); pop("Client added.");
  }

  function saveEdit() {
    setClients(cs=>cs.map(c=>c.id===sel?{...c,...nc}:c));
    setEditing(false); pop("Client updated.");
  }

  return <div>
    <Hdr sub="Manage clients, contacts and their associated projects."
      action={<Btn v="pri" onClick={()=>{setShowNew(true);setEditing(false);}}>+ New Client</Btn>}>
      Clients
    </Hdr>

    {showNew&&<Card hi sx={{marginBottom:16}}>
      <div style={{fontWeight:700,marginBottom:12,color:T.accent}}>New Client</div>
      <Grid2 gap={10}>
        <Inp label="Full Name" value={nc.name} onChange={v=>setNc(x=>({...x,name:v}))} placeholder="Contact name"/>
        <Inp label="Company" value={nc.company} onChange={v=>setNc(x=>({...x,company:v}))} placeholder="Company or trust name"/>
        <Inp label="Email" value={nc.email} onChange={v=>setNc(x=>({...x,email:v}))} placeholder="email@example.com"/>
        <Inp label="Phone" value={nc.phone} onChange={v=>setNc(x=>({...x,phone:v}))} placeholder="Mobile or landline"/>
        <Inp label="Address" value={nc.address} onChange={v=>setNc(x=>({...x,address:v}))} sx={{gridColumn:"1/-1"}}/>
        <Inp label="ABN / NZBN" value={nc.abn} onChange={v=>setNc(x=>({...x,abn:v}))}/>
        <Inp label="Notes" value={nc.notes} onChange={v=>setNc(x=>({...x,notes:v}))}/>
      </Grid2>
      <Row gap={8}><Btn v="pri" onClick={saveNew}>Save Client</Btn><Btn onClick={()=>setShowNew(false)}>Cancel</Btn></Row>
    </Card>}

    <Row gap={10} sx={{marginBottom:14}}>
      <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search clients…"
        style={{flex:1,background:T.card,border:`1px solid ${T.border}`,borderRadius:5,
          padding:"7px 11px",color:T.text,fontSize:13,outline:"none",fontFamily:T.font}}/>
    </Row>

    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
      {/* Client list */}
      <div>
        {filtered.map(c=>{
          const cProjs=projects.filter(p=>p.clientId===c.id||p.client===c.name);
          const cVal=cProjs.reduce((s,p)=>s+calc(p).total,0);
          return <div key={c.id} onClick={()=>{setSel(c.id===sel?null:c.id);setEditing(false);}} style={{
            display:"flex",justifyContent:"space-between",alignItems:"flex-start",
            padding:"12px 14px",borderRadius:7,marginBottom:6,cursor:"pointer",
            background:sel===c.id?T.accentDim:T.card,
            border:`1px solid ${sel===c.id?T.accentBrd:T.border}`}}>
            <div>
              <div style={{fontWeight:700,fontSize:13,color:T.text}}>{c.name}</div>
              {c.company&&<div style={{color:T.muted,fontSize:12,marginTop:1}}>{c.company}</div>}
              {c.email&&<div style={{color:T.faint,fontSize:11,marginTop:2}}>{c.email}</div>}
            </div>
            <div style={{textAlign:"right"}}>
              <div style={{fontSize:12,color:T.muted}}>{cProjs.length} project{cProjs.length!==1?"s":""}</div>
              {cVal>0&&<div style={{fontFamily:T.mono,color:T.accent,fontSize:12,fontWeight:700}}>{$$(cVal,true)}</div>}
            </div>
          </div>;
        })}
        {!filtered.length&&<div style={{color:T.faint,fontSize:13}}>No clients found.</div>}
      </div>

      {/* Client detail */}
      {client&&<Card>
        {!editing
          ? <>
              <Row gap={8} sx={{marginBottom:14}}>
                <div style={{fontWeight:700,fontSize:14,flex:1}}>{client.name}</div>
                <Btn sm v="blu" onClick={()=>{setNc({...client});setEditing(true);}}>Edit</Btn>
                <Btn sm v="red" onClick={()=>{
                  if(safeConfirm(`Delete ${client.name}?`)) {
                    setClients(cs=>cs.filter(c=>c.id!==sel)); setSel(null); pop("Client deleted.");
                  }
                }}>Delete</Btn>
              </Row>
              {client.company&&<div style={{color:T.muted,fontSize:13,marginBottom:6}}>{client.company}</div>}
              <div style={{fontSize:13,lineHeight:2.1,marginBottom:14}}>
                {client.email&&<div><span style={{color:T.faint}}>✉ </span>{client.email}</div>}
                {client.phone&&<div><span style={{color:T.faint}}>📞 </span>{client.phone}</div>}
                {client.address&&<div><span style={{color:T.faint}}>📍 </span>{client.address}</div>}
                {client.abn&&<div><span style={{color:T.faint}}>ABN </span>{client.abn}</div>}
              </div>
              {client.notes&&<div style={{fontSize:12,color:T.muted,marginBottom:14,padding:"8px 10px",
                background:T.bg,borderRadius:5}}>{client.notes}</div>}
              {clientProjs.length>0&&<div>
                <div style={{fontWeight:600,fontSize:12,color:T.muted,marginBottom:8,textTransform:"uppercase",letterSpacing:"0.05em"}}>Projects</div>
                {clientProjs.map(p=>{
                  const c2=calc(p); const sm=STATUS[p.status]||STATUS.draft;
                  return <div key={p.id} style={{display:"flex",justifyContent:"space-between",
                    padding:"7px 0",borderBottom:`1px solid ${T.border}`,fontSize:12}}>
                    <div>
                      <span style={{color:T.text,fontWeight:600}}>{p.name}</span>
                      <div style={{marginTop:2}}><Bdg color={sm.color} sm>{sm.label}</Bdg></div>
                    </div>
                    <span style={{fontFamily:T.mono,color:T.accent,fontWeight:700}}>{$$(c2.total,true)}</span>
                  </div>;
                })}
              </div>}
            </>
          : <>
              <div style={{fontWeight:700,marginBottom:12,color:T.accent}}>Edit Client</div>
              <Grid2 gap={10}>
                <Inp label="Full Name" value={nc.name} onChange={v=>setNc(x=>({...x,name:v}))}/>
                <Inp label="Company" value={nc.company} onChange={v=>setNc(x=>({...x,company:v}))}/>
                <Inp label="Email" value={nc.email} onChange={v=>setNc(x=>({...x,email:v}))}/>
                <Inp label="Phone" value={nc.phone} onChange={v=>setNc(x=>({...x,phone:v}))}/>
                <Inp label="Address" value={nc.address} onChange={v=>setNc(x=>({...x,address:v}))} sx={{gridColumn:"1/-1"}}/>
                <Inp label="ABN / NZBN" value={nc.abn} onChange={v=>setNc(x=>({...x,abn:v}))}/>
                <Inp label="Notes" value={nc.notes} onChange={v=>setNc(x=>({...x,notes:v}))}/>
              </Grid2>
              <Row gap={8}><Btn v="pri" onClick={saveEdit}>Save</Btn><Btn onClick={()=>setEditing(false)}>Cancel</Btn></Row>
            </>
        }
      </Card>}
    </div>
  </div>;
}

// ═══════════════════════════════════════════════════════════════════════════
// RATE LIBRARY
// ═══════════════════════════════════════════════════════════════════════════
function RateLibrary({rates, setRates, cabLib, setCabLib, pop}) {
  const [tab,setTab]=useState("catalogue");
  return <div>
    <Hdr sub="Build your cost catalogue, then set how cabinets are priced from it.">Rate Library</Hdr>
    <Tabs tabs={[
      {id:"catalogue",label:"📚 Catalogue"},
      {id:"formula",label:"🧮 Cabinet Formula"},
    ]} active={tab} onChange={setTab}/>
    {tab==="catalogue"&& <CatalogueLibrary pop={pop}/>}
    {tab==="formula"  && <CabinetFormula pop={pop}/>}
  </div>;
}

// ════════════════════════════════════════════════════════════════════════════
// CATALOGUE LIBRARY — company-shared, Supabase-backed, user-built nested tabs.
//   Trade tabs (parent_id NULL) → section tabs → items with drill-down attributes.
//   Editing gated by can_edit_library(). Uses in-app modals (window.prompt is
//   blocked in the deployment sandbox).
// ════════════════════════════════════════════════════════════════════════════
const inlineInput={background:"transparent",border:"none",color:T.text,fontSize:12,fontFamily:T.font,width:"100%",outline:"none"};

// ── PARAMETRIC CABINET PRICING ──────────────────────────────────────────────
// Pure function: given a cabinet's dimensions + counts, the company formula
// rules, and the resolved $ rates from the project preset, return a cost
// breakdown. No stored cabinet types — computed live from base costs.
//   cab:   {type, width, height, depth, doors, drawers}  (mm)
//   rules: a cabinet_formula row
//   rates: {carcass:$/m², front:$/m², hinge:$/ea, handle:$/ea, foot:$/ea}
function priceCabinet(cab, rules, rates) {
  const R=rules||{}, P=rates||{};
  const type=(cab.type||"Base");
  // fill missing dims from company defaults
  let W=+cab.width||0, H=+cab.height||0, D=+cab.depth||0;
  if(!H||!D){
    if(/over|wall|upper/i.test(type)){ H=H||R.default_over_h||720; D=D||R.default_over_d||320; }
    else if(/tall|pantry|broom/i.test(type)){ H=H||R.default_tall_h||2100; D=D||R.default_tall_d||560; }
    else { H=H||R.default_base_h||720; D=D||R.default_base_d||560; }
  }
  if(!W) W=600;
  const m2=(mm2)=>mm2/1e6;
  // carcass board area (panels), m²
  let carcassM2=0;
  if(R.include_sides!==false)     carcassM2 += 2*m2(H*D);     // 2 sides
  if(R.include_topbottom!==false) carcassM2 += 2*m2(W*D);     // top + bottom
  if(R.include_back!==false)      carcassM2 += m2(W*H);       // back
  carcassM2 += (R.shelves_per_cab??1)*m2(W*D);               // shelves
  // door/drawer front area, m² (fronts cover the cabinet face: W×H)
  const fronts=(+cab.doors||0)+(+cab.drawers||0);
  const frontM2 = fronts>0 ? m2(W*H) : 0;  // full face split across fronts
  // hardware counts
  const hinges = (+cab.doors||0)*(R.hinges_per_door??2);
  const handles= (+cab.doors||0)*(R.handles_per_door??1) + (+cab.drawers||0)*(R.handles_per_drawer??1);
  const feet   = /base/i.test(type) ? (R.feet_per_base??4) : 0;
  // costs
  const carcassCost = carcassM2*(+P.carcass||0);
  const frontCost   = frontM2*(+P.front||0);
  const hingeCost   = hinges*(+P.hinge||0);
  const handleCost  = handles*(+P.handle||0);
  const footCost    = feet*(+P.foot||0);
  const assembly    = +R.assembly_per_cab||0;
  const total = carcassCost+frontCost+hingeCost+handleCost+footCost+assembly;
  return {
    dims:{W,H,D}, carcassM2:+carcassM2.toFixed(3), frontM2:+frontM2.toFixed(3),
    hinges, handles, feet,
    carcassCost:+carcassCost.toFixed(2), frontCost:+frontCost.toFixed(2),
    hingeCost:+hingeCost.toFixed(2), handleCost:+handleCost.toFixed(2),
    footCost:+footCost.toFixed(2), assembly:+assembly.toFixed(2),
    total:+total.toFixed(2),
  };
}

// Parse an AI "config" string into door/drawer counts (e.g. "2 Door" → doors:2).
function parseCabConfig(config){
  const s=(config||"").toLowerCase();
  let doors=0, drawers=0;
  const dm=s.match(/(\d+)\s*draw/); if(dm) drawers=+dm[1];
  const hm=s.match(/(\d+)\s*door/); if(hm) doors=+hm[1];
  if(!doors&&!drawers){ if(/door/.test(s))doors=1; if(/draw/.test(s))drawers=1; }
  return {doors,drawers};
}

// Resolve a project's cabinet pricing context once (formula rules + chosen rates),
// then price any AI cabinet line. Returns {ctx, price(cabLine)} or null if unset.
async function loadCabinetPricing(companyId, projectId){
  const [{data:rules},{data:preset}]=await Promise.all([
    supabase.from("cabinet_formula").select("*").eq("company_id",companyId).maybeSingle(),
    supabase.from("project_cabinet_preset").select("*").eq("project_id",projectId).maybeSingle(),
  ]);
  if(!rules||!preset) return {rules,preset,rates:null,ready:false};
  // fetch the chosen catalogue items' rates
  const ids=[preset.carcass_item_id,preset.front_item_id,preset.hinge_item_id,preset.handle_item_id,preset.foot_item_id].filter(Boolean);
  let rateMap={};
  if(ids.length){
    const {data:items}=await supabase.from("catalogue_items").select("id,rate").in("id",ids);
    (items||[]).forEach(it=>{ rateMap[it.id]=+it.rate||0; });
  }
  const rates={
    carcass: rateMap[preset.carcass_item_id]||0,
    front:   rateMap[preset.front_item_id]||0,
    hinge:   rateMap[preset.hinge_item_id]||0,
    handle:  rateMap[preset.handle_item_id]||0,
    foot:    rateMap[preset.foot_item_id]||0,
  };
  const ready = !!(preset.carcass_item_id||preset.front_item_id);
  return {rules,preset,rates,ready};
}





function CatalogueLibrary({pop}) {
  const [companyId,setCompanyId]=useState(null);
  const [canEdit,setCanEdit]=useState(false);
  const [locked,setLocked]=useState(false);
  const [role,setRole]=useState(null);
  const [sections,setSections]=useState([]);
  const [items,setItems]=useState([]);
  const [activeTrade,setActiveTrade]=useState(null);
  const [activeSection,setActiveSection]=useState(null);
  const [loading,setLoading]=useState(true);
  const [err,setErr]=useState(null);
  const [newItem,setNewItem]=useState({name:"",unit:"ea",rate:0,supplier:"",notes:"",attrText:""});
  const [modal,setModal]=useState(null); // {type, ...}

  const trades=sections.filter(s=>!s.parent_id).sort((a,b)=>a.sort_order-b.sort_order);
  const subSections=sections.filter(s=>s.parent_id===activeTrade).sort((a,b)=>a.sort_order-b.sort_order);

  async function loadShell() {
    setLoading(true); setErr(null);
    try {
      const { data:u }=await supabase.auth.getUser();
      const uid=u?.user?.id; if(!uid) throw new Error("Not signed in.");
      const { data:prof }=await supabase.from("profiles").select("company_id,role").eq("id",uid).single();
      const cid=prof?.company_id; setCompanyId(cid); setRole(prof?.role);
      const { data:comp }=await supabase.from("companies").select("library_locked,library_master_id").eq("id",cid).maybeSingle();
      setLocked(!!comp?.library_locked);
      setCanEdit(prof?.role==="owner" || !comp?.library_locked || comp?.library_master_id===uid);
      const { data:secs }=await supabase.from("catalogue_sections").select("*").eq("company_id",cid);
      setSections(secs||[]);
      const firstTrade=(secs||[]).find(s=>!s.parent_id);
      if(firstTrade){
        setActiveTrade(firstTrade.id);
        setActiveSection((secs||[]).find(s=>s.parent_id===firstTrade.id)?.id||null);
      }
    } catch(e){ setErr(e?.message||String(e)); }
    finally { setLoading(false); }
  }
  useEffect(()=>{ loadShell(); },[]);

  useEffect(()=>{
    if(!activeSection){ setItems([]); return; }
    let on=true;
    supabase.from("catalogue_items").select("*").eq("section_id",activeSection).order("sort_order")
      .then(({data})=>{ if(on) setItems(data||[]); });
    return ()=>{on=false;};
  },[activeSection]);

  async function createTrade(name){
    setModal(null); if(!name) return;
    const { data,error }=await supabase.from("catalogue_sections")
      .insert({company_id:companyId,name,sort_order:trades.length}).select().single();
    if(error) return pop(error.message,"error");
    setSections(s=>[...s,data]); setActiveTrade(data.id); setActiveSection(null);
  }
  async function createSection(name){
    setModal(null); if(!name) return;
    const { data,error }=await supabase.from("catalogue_sections")
      .insert({company_id:companyId,parent_id:activeTrade,name,sort_order:subSections.length}).select().single();
    if(error) return pop(error.message,"error");
    setSections(s=>[...s,data]); setActiveSection(data.id);
  }
  async function doDelSection(id,isTrade){
    setModal(null);
    const { error }=await supabase.from("catalogue_sections").delete().eq("id",id);
    if(error) return pop(error.message,"error");
    const remaining=sections.filter(s=>s.id!==id&&s.parent_id!==id);
    setSections(remaining);
    if(isTrade){ const t=remaining.find(s=>!s.parent_id); setActiveTrade(t?.id||null); setActiveSection(remaining.find(s=>s.parent_id===t?.id)?.id||null); }
    else { setActiveSection(remaining.find(s=>s.parent_id===activeTrade)?.id||null); }
    pop("Deleted.");
  }
  async function addItem(){
    if(!activeSection) return pop("Select a section tab first.","error");
    if(!newItem.name) return pop("Item name required.","error");
    let attributes={};
    if(newItem.attrText.trim()){
      newItem.attrText.split(",").forEach(pair=>{
        const [k,...v]=pair.split(":"); if(!k||!v.length) return;
        const val=v.join(":").trim(); const num=parseFloat(val);
        attributes[k.trim()]=(!isNaN(num)&&String(num)===val)?num:val;
      });
    }
    const { data,error }=await supabase.from("catalogue_items").insert({
      company_id:companyId,section_id:activeSection,name:newItem.name,unit:newItem.unit,
      rate:parseFloat(newItem.rate)||0,supplier:newItem.supplier,notes:newItem.notes,
      attributes,sort_order:items.length,
    }).select().single();
    if(error) return pop(error.message,"error");
    setItems(it=>[...it,data]);
    setNewItem({name:"",unit:"ea",rate:0,supplier:"",notes:"",attrText:""});
    pop("Item added.");
  }
  async function updItem(id,field,value){
    setItems(it=>it.map(x=>x.id===id?{...x,[field]:value}:x));
    const patch={[field]:field==="rate"?(parseFloat(value)||0):value};
    await supabase.from("catalogue_items").update(patch).eq("id",id);
  }
  async function delItem(id){
    const { error }=await supabase.from("catalogue_items").delete().eq("id",id);
    if(error) return pop(error.message,"error");
    setItems(it=>it.filter(x=>x.id!==id)); pop("Removed.");
  }
  async function toggleLock(){
    if(role!=="owner") return pop("Only the owner can lock the library.","error");
    const { data:u }=await supabase.auth.getUser();
    const next=!locked;
    const { error }=await supabase.from("companies")
      .update({library_locked:next,library_master_id:next?u?.user?.id:null}).eq("id",companyId);
    if(error) return pop(error.message,"error");
    setLocked(next); setCanEdit(true);
    pop(next?"Library locked — only you (owner) can edit now.":"Library unlocked — all staff can edit.");
  }

  if(loading) return <Card><div style={{color:T.muted,fontSize:13}}>Loading catalogue…</div></Card>;
  if(err) return <Card><div style={{color:T.red,fontSize:13}}>Couldn't load catalogue: {err}</div>
    <div style={{color:T.faint,fontSize:12,marginTop:6}}>If this mentions a missing table, run the CATALOGUE Layer 1 SQL in Supabase first.</div></Card>;

  return <div>
    {modal?.type==="trade"&&<PromptModal title="New trade tab" label="Trade name"
      placeholder="e.g. Cabinetry, Electrical, Plumbing" confirmText="Add trade"
      onConfirm={createTrade} onCancel={()=>setModal(null)}/>}
    {modal?.type==="section"&&<PromptModal title="New section tab" label="Section name"
      placeholder="e.g. Board, Hardware, Assembly" confirmText="Add section"
      onConfirm={createSection} onCancel={()=>setModal(null)}/>}
    {modal?.type==="delSection"&&<ConfirmModal title="Delete tab" danger confirmText="Delete"
      message={modal.isTrade?"Delete this trade and ALL its sections and items? This cannot be undone."
        :"Delete this section and all its items? This cannot be undone."}
      onConfirm={()=>doDelSection(modal.id,modal.isTrade)} onCancel={()=>setModal(null)}/>}

    <Row gap={8} sx={{marginBottom:14,flexWrap:"wrap"}}>
      <Bdg color={canEdit?T.green:T.faint}>{canEdit?"You can edit":"Read-only"}</Bdg>
      {locked&&<Bdg color={T.yellow}>🔒 Locked to master editor</Bdg>}
      {role==="owner"&&<Btn sm v={locked?"yel":"gho"} onClick={toggleLock}>{locked?"Unlock library":"Lock to me only"}</Btn>}
      <div style={{marginLeft:"auto",color:T.faint,fontSize:11}}>Shared across your whole company</div>
    </Row>

    {trades.length===0
      ? <Card hi sx={{textAlign:"center",padding:40}}>
          <div style={{fontSize:34,marginBottom:10}}>📚</div>
          <div style={{fontWeight:700,fontSize:15,marginBottom:6}}>Build your catalogue</div>
          <div style={{color:T.muted,fontSize:13,marginBottom:16,maxWidth:440,marginInline:"auto"}}>
            Start by adding a trade (e.g. Cabinetry), then sections inside it (Board, Hardware, Assembly), then your items with rates. Everything is shared across your company.
          </div>
          {canEdit
            ? <Btn v="pri" onClick={()=>setModal({type:"trade"})}>+ Add your first trade</Btn>
            : <div style={{color:T.faint,fontSize:12}}>The library is locked — ask your master editor to set it up.</div>}
        </Card>
      : <>
        <Row gap={6} sx={{marginBottom:12,flexWrap:"wrap"}}>
          {trades.map(t=><div key={t.id} onClick={()=>{setActiveTrade(t.id);setActiveSection(sections.find(s=>s.parent_id===t.id)?.id||null);}}
            style={{padding:"7px 14px",borderRadius:7,cursor:"pointer",fontSize:13,fontWeight:700,
              display:"flex",alignItems:"center",gap:8,
              background:activeTrade===t.id?T.accentDim:T.card2,color:activeTrade===t.id?T.accent:T.muted,
              border:`1px solid ${activeTrade===t.id?T.accentBrd:T.border}`}}>
            {t.icon&&<span>{t.icon}</span>}{t.name}
            {canEdit&&activeTrade===t.id&&<span onClick={e=>{e.stopPropagation();setModal({type:"delSection",id:t.id,isTrade:true});}}
              style={{color:T.red,marginLeft:4,fontSize:14}}>×</span>}
          </div>)}
          {canEdit&&<Btn sm v="gho" onClick={()=>setModal({type:"trade"})}>+ Trade</Btn>}
        </Row>

        <Row gap={6} sx={{marginBottom:16,flexWrap:"wrap"}}>
          {subSections.map(s=><div key={s.id} onClick={()=>setActiveSection(s.id)}
            style={{padding:"5px 12px",borderRadius:6,cursor:"pointer",fontSize:12,fontWeight:600,
              display:"flex",alignItems:"center",gap:6,
              background:activeSection===s.id?T.blueDim:"transparent",color:activeSection===s.id?T.blue:T.muted,
              border:`1px solid ${activeSection===s.id?`${T.blue}44`:T.border}`}}>
            {s.name}
            {canEdit&&activeSection===s.id&&<span onClick={e=>{e.stopPropagation();setModal({type:"delSection",id:s.id,isTrade:false});}}
              style={{color:T.red,marginLeft:2}}>×</span>}
          </div>)}
          {canEdit&&activeTrade&&<Btn sm v="gho" onClick={()=>setModal({type:"section"})}>+ Section</Btn>}
        </Row>

        {!activeSection
          ? <Card><div style={{color:T.muted,fontSize:13}}>Add a section tab (Board, Hardware…) to start adding items.</div></Card>
          : <Card sx={{padding:0,overflow:"hidden"}}>
              <div style={{overflowX:"auto"}}>
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                  <thead><tr style={{background:T.bg,color:T.faint,fontSize:11,textAlign:"left"}}>
                    {["Item","Unit","Rate","Supplier","Details","Notes",canEdit?"":null].filter(x=>x!==null).map((h,i)=>
                      <th key={i} style={{padding:"8px 12px",fontWeight:600}}>{h}</th>)}
                  </tr></thead>
                  <tbody>
                    {items.map(it=><tr key={it.id} style={{borderTop:`1px solid ${T.border}`}}>
                      <td style={{padding:"6px 12px",minWidth:160}}>
                        {canEdit?<input value={it.name} onChange={e=>updItem(it.id,"name",e.target.value)} style={inlineInput}/>:<span style={{color:T.text}}>{it.name}</span>}
                      </td>
                      <td style={{padding:"6px 12px"}}>
                        {canEdit?<input value={it.unit||""} onChange={e=>updItem(it.id,"unit",e.target.value)} style={{...inlineInput,width:60}}/>:<span style={{color:T.muted}}>{it.unit}</span>}
                      </td>
                      <td style={{padding:"6px 12px"}}>
                        {canEdit?<input type="number" value={it.rate} onChange={e=>updItem(it.id,"rate",e.target.value)} style={{...inlineInput,width:90,color:T.accent,fontFamily:T.mono}}/>:<span style={{color:T.accent,fontFamily:T.mono}}>{$$(it.rate)}</span>}
                      </td>
                      <td style={{padding:"6px 12px"}}>
                        {canEdit?<input value={it.supplier||""} onChange={e=>updItem(it.id,"supplier",e.target.value)} style={inlineInput}/>:<span style={{color:T.muted}}>{it.supplier}</span>}
                      </td>
                      <td style={{padding:"6px 12px",color:T.muted,fontSize:11,fontFamily:T.mono}}>
                        {Object.entries(it.attributes||{}).map(([k,v])=>`${k}: ${v}`).join(" · ")||"—"}
                      </td>
                      <td style={{padding:"6px 12px",color:T.faint,fontSize:11}}>{it.notes}</td>
                      {canEdit&&<td style={{padding:"6px 12px"}}>
                        <span onClick={()=>delItem(it.id)} style={{color:T.red,cursor:"pointer"}}>✕</span>
                      </td>}
                    </tr>)}
                    {items.length===0&&<tr><td colSpan={7} style={{padding:"16px 12px",color:T.faint,fontSize:12}}>No items in this section yet.</td></tr>}
                  </tbody>
                </table>
              </div>

              {canEdit&&<div style={{borderTop:`1px solid ${T.border}`,padding:14,background:T.bg}}>
                <div style={{fontWeight:600,fontSize:12,color:T.muted,marginBottom:8,textTransform:"uppercase",letterSpacing:"0.05em"}}>Add item</div>
                <div style={{display:"grid",gridTemplateColumns:"2fr 70px 90px 1.5fr",gap:8,marginBottom:8}}>
                  <Inp label="Name" value={newItem.name} onChange={v=>setNewItem(x=>({...x,name:v}))} placeholder="e.g. 18mm White Melamine" sx={{marginBottom:0}}/>
                  <Inp label="Unit" value={newItem.unit} onChange={v=>setNewItem(x=>({...x,unit:v}))} placeholder="m2" sx={{marginBottom:0}}/>
                  <Inp label="Rate $" value={newItem.rate} onChange={v=>setNewItem(x=>({...x,rate:v}))} type="number" mono sx={{marginBottom:0}}/>
                  <Inp label="Supplier" value={newItem.supplier} onChange={v=>setNewItem(x=>({...x,supplier:v}))} sx={{marginBottom:0}}/>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"2fr 2fr auto",gap:8,alignItems:"flex-end"}}>
                  <Inp label="Details (key:value, comma-separated)" value={newItem.attrText} onChange={v=>setNewItem(x=>({...x,attrText:v}))} placeholder="thickness:18, substrate:MR MDF" sx={{marginBottom:0}}/>
                  <Inp label="Notes" value={newItem.notes} onChange={v=>setNewItem(x=>({...x,notes:v}))} sx={{marginBottom:0}}/>
                  <Btn v="pri" onClick={addItem}>+ Add</Btn>
                </div>
              </div>}
            </Card>}
      </>}
  </div>;
}

// ════════════════════════════════════════════════════════════════════════════
// CABINET FORMULA — the editable rule-set + a live worked example. One row per
// company. Pairs with per-project presets (which catalogue items to pull from).
// ════════════════════════════════════════════════════════════════════════════
function CabinetFormula({pop}) {
  const [companyId,setCompanyId]=useState(null);
  const [canEdit,setCanEdit]=useState(false);
  const [rules,setRules]=useState(null);
  const [loading,setLoading]=useState(true);
  const [err,setErr]=useState(null);
  // worked-example inputs + sample rates so the shop sees the maths
  const [ex,setEx]=useState({type:"Base",width:1000,height:720,depth:560,doors:2,drawers:0});
  const [exRates,setExRates]=useState({carcass:52,front:85,hinge:3.5,handle:6,foot:1.2});

  useEffect(()=>{(async()=>{
    setLoading(true); setErr(null);
    try{
      const { data:u }=await supabase.auth.getUser();
      const uid=u?.user?.id; if(!uid) throw new Error("Not signed in.");
      const { data:prof }=await supabase.from("profiles").select("company_id,role").eq("id",uid).single();
      const cid=prof?.company_id; setCompanyId(cid);
      const { data:comp }=await supabase.from("companies").select("library_locked,library_master_id").eq("id",cid).maybeSingle();
      setCanEdit(prof?.role==="owner" || !comp?.library_locked || comp?.library_master_id===uid);
      let { data:f }=await supabase.from("cabinet_formula").select("*").eq("company_id",cid).maybeSingle();
      if(!f){
        const { data:created }=await supabase.from("cabinet_formula").insert({company_id:cid}).select().single();
        f=created;
      }
      setRules(f);
    }catch(e){ setErr(e?.message||String(e)); }
    finally{ setLoading(false); }
  })();},[]);

  function setRule(k,v){ setRules(r=>({...r,[k]:v})); }
  async function save(){
    if(!canEdit) return pop("Library is locked — only the master editor can change the formula.","error");
    const { error }=await supabase.from("cabinet_formula").update({...rules,updated_at:new Date().toISOString()}).eq("company_id",companyId);
    if(error) return pop(error.message,"error");
    pop("Formula saved.");
  }

  if(loading) return <Card><div style={{color:T.muted,fontSize:13}}>Loading formula…</div></Card>;
  if(err) return <Card><div style={{color:T.red,fontSize:13}}>Couldn't load: {err}</div>
    <div style={{color:T.faint,fontSize:12,marginTop:6}}>If this mentions a missing table, run the CABINET-FORMULA Layer 3 SQL in Supabase first.</div></Card>;

  const r=rules||{};
  const calc=priceCabinet(ex, r, exRates);

  return <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
    {/* RULES */}
    <Card>
      <div style={{fontWeight:700,fontSize:13,marginBottom:4}}>How a cabinet's cost is built</div>
      <div style={{color:T.faint,fontSize:11,marginBottom:14}}>
        The AI reads cabinet type, size and door/drawer counts off the plans. These rules turn that into quantities, which are priced against each project's chosen catalogue items.
      </div>

      <div style={{fontWeight:600,fontSize:11,color:T.accent,textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:8}}>Carcass board (panels counted)</div>
      <Toggle on={r.include_sides!==false} onChange={v=>setRule("include_sides",v)} label="2 sides (Height × Depth)"/>
      <Toggle on={r.include_topbottom!==false} onChange={v=>setRule("include_topbottom",v)} label="Top + bottom (Width × Depth)"/>
      <Toggle on={r.include_back!==false} onChange={v=>setRule("include_back",v)} label="Back panel (Width × Height)"/>
      <Inp label="Shelves per cabinet (each Width × Depth)" value={r.shelves_per_cab} onChange={v=>setRule("shelves_per_cab",parseInt(v)||0)} type="number" mono/>

      <div style={{fontWeight:600,fontSize:11,color:T.accent,textTransform:"uppercase",letterSpacing:"0.05em",margin:"14px 0 8px"}}>Hardware rules</div>
      <Row gap={8}>
        <Inp label="Hinges / door" value={r.hinges_per_door} onChange={v=>setRule("hinges_per_door",parseFloat(v)||0)} type="number" mono sx={{flex:1}}/>
        <Inp label="Handles / door" value={r.handles_per_door} onChange={v=>setRule("handles_per_door",parseFloat(v)||0)} type="number" mono sx={{flex:1}}/>
      </Row>
      <Row gap={8}>
        <Inp label="Handles / drawer" value={r.handles_per_drawer} onChange={v=>setRule("handles_per_drawer",parseFloat(v)||0)} type="number" mono sx={{flex:1}}/>
        <Inp label="Feet / base cabinet" value={r.feet_per_base} onChange={v=>setRule("feet_per_base",parseFloat(v)||0)} type="number" mono sx={{flex:1}}/>
      </Row>

      <div style={{fontWeight:600,fontSize:11,color:T.accent,textTransform:"uppercase",letterSpacing:"0.05em",margin:"14px 0 8px"}}>Default sizes (mm, used when the plan doesn't give one)</div>
      <Row gap={8}>
        <Inp label="Base H" value={r.default_base_h} onChange={v=>setRule("default_base_h",parseInt(v)||0)} type="number" mono sx={{flex:1}}/>
        <Inp label="Base D" value={r.default_base_d} onChange={v=>setRule("default_base_d",parseInt(v)||0)} type="number" mono sx={{flex:1}}/>
        <Inp label="Over H" value={r.default_over_h} onChange={v=>setRule("default_over_h",parseInt(v)||0)} type="number" mono sx={{flex:1}}/>
        <Inp label="Tall H" value={r.default_tall_h} onChange={v=>setRule("default_tall_h",parseInt(v)||0)} type="number" mono sx={{flex:1}}/>
      </Row>
      <Inp label="Assembly / labour add-on per cabinet ($)" value={r.assembly_per_cab} onChange={v=>setRule("assembly_per_cab",parseFloat(v)||0)} type="number" mono/>

      {canEdit
        ? <Btn v="pri" full sx={{marginTop:8}} onClick={save}>Save formula</Btn>
        : <div style={{color:T.faint,fontSize:12,marginTop:8}}>🔒 Library locked — read-only.</div>}
    </Card>

    {/* LIVE WORKED EXAMPLE */}
    <Card hi>
      <div style={{fontWeight:700,fontSize:13,marginBottom:4}}>Live worked example</div>
      <div style={{color:T.faint,fontSize:11,marginBottom:12}}>
        Enter a cabinet and sample rates to see exactly how the formula prices it. In a real project these rates come from the catalogue items you choose in the project's Cabinet Preset.
      </div>

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
        <Sel label="Type" value={ex.type} onChange={v=>setEx(x=>({...x,type:v}))} options={["Base","Overhead","Tall"]}/>
        <Inp label="Width mm" value={ex.width} onChange={v=>setEx(x=>({...x,width:+v||0}))} type="number" mono/>
        <Inp label="Height mm" value={ex.height} onChange={v=>setEx(x=>({...x,height:+v||0}))} type="number" mono/>
        <Inp label="Depth mm" value={ex.depth} onChange={v=>setEx(x=>({...x,depth:+v||0}))} type="number" mono/>
        <Inp label="Doors" value={ex.doors} onChange={v=>setEx(x=>({...x,doors:+v||0}))} type="number" mono/>
        <Inp label="Drawers" value={ex.drawers} onChange={v=>setEx(x=>({...x,drawers:+v||0}))} type="number" mono/>
      </div>

      <div style={{fontWeight:600,fontSize:11,color:T.muted,textTransform:"uppercase",letterSpacing:"0.05em",margin:"12px 0 6px"}}>Sample rates (from catalogue)</div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr 1fr",gap:6}}>
        <Inp label="Carc/m²" value={exRates.carcass} onChange={v=>setExRates(x=>({...x,carcass:+v||0}))} type="number" mono/>
        <Inp label="Front/m²" value={exRates.front} onChange={v=>setExRates(x=>({...x,front:+v||0}))} type="number" mono/>
        <Inp label="Hinge" value={exRates.hinge} onChange={v=>setExRates(x=>({...x,hinge:+v||0}))} type="number" mono/>
        <Inp label="Handle" value={exRates.handle} onChange={v=>setExRates(x=>({...x,handle:+v||0}))} type="number" mono/>
        <Inp label="Foot" value={exRates.foot} onChange={v=>setExRates(x=>({...x,foot:+v||0}))} type="number" mono/>
      </div>

      <div style={{marginTop:14,background:T.bg,borderRadius:8,padding:14,border:`1px solid ${T.border}`}}>
        {[
          ["Carcass board",`${calc.carcassM2} m² × $${exRates.carcass}`,calc.carcassCost],
          ["Door/drawer fronts",`${calc.frontM2} m² × $${exRates.front}`,calc.frontCost],
          ["Hinges",`${calc.hinges} × $${exRates.hinge}`,calc.hingeCost],
          ["Handles",`${calc.handles} × $${exRates.handle}`,calc.handleCost],
          ["Feet",`${calc.feet} × $${exRates.foot}`,calc.footCost],
          ["Assembly",``,calc.assembly],
        ].map(([label,detail,val])=>(val>0||label==="Assembly")&&<div key={label} style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:6,fontSize:12}}>
          <span style={{color:T.text}}>{label} <span style={{color:T.faint,fontSize:11,fontFamily:T.mono}}>{detail}</span></span>
          <span style={{fontFamily:T.mono,color:T.muted}}>{$$(val)}</span>
        </div>)}
        <div style={{display:"flex",justifyContent:"space-between",borderTop:`1px solid ${T.border}`,paddingTop:9,marginTop:6}}>
          <span style={{fontWeight:800,fontSize:14}}>Cabinet cost</span>
          <span style={{fontFamily:T.mono,fontWeight:800,fontSize:16,color:T.accent}}>{$$(calc.total)}</span>
        </div>
      </div>
      <div style={{color:T.faint,fontSize:11,marginTop:8}}>
        Computed live — no stored cabinet types. The AI takeoff runs this same formula on every cabinet it reads, using the project's selected catalogue items.
      </div>
    </Card>
  </div>;
}

// ── Cabinet Library: global carcass/hardware rates, dims, and a live-generated
//    price grid — the spreadsheet's 800-row CABINET_LIBRARY computed from formulas
function CabinetLibrary({cabLib,setCabLib,pop}) {
  const L=cabLib||SEED_CABLIB;
  const set=(k,v)=>setCabLib(x=>({...x,[k]:v}));
  const setDim=(t,k,v)=>setCabLib(x=>({...x,dims:{...x.dims,[t]:{...x.dims[t],[k]:v}}}));
  const [gridType,setGridType]=useState("Base");

  const CONFIGS={
    Base:["1 Door","2 Door","1 Drawer","2 Drawer","3 Drawer","4 Drawer","5 Drawer"],
    Overhead:["1 Door","2 Door"],
    Tall:["1 Door","2 Door"],
    Panel:["End Panel","Feature Panel","Filler","Kickboard","Wall Panel","Bulkhead","Floating Shelf"],
  };
  const widths=[];
  for(let w=300;w<=1200;w+=50) widths.push(w);

  return <div>
    <div style={{display:"grid",gridTemplateColumns:"310px 1fr",gap:14}}>
      <div>
        <Card sx={{marginBottom:14}}>
          <div style={{fontWeight:700,fontSize:13,marginBottom:12,color:"#ec4899"}}>Carcass & Hardware (defaults)</div>
          <Inp label="Carcass board $/m²" value={L.carcassRatePerM2} onChange={v=>set("carcassRatePerM2",v)} type="number" mono/>
          <Inp label="Door hardware $/door" value={L.doorHardware} onChange={v=>set("doorHardware",v)} type="number" mono/>
          <Inp label="Drawer hardware $/drawer" value={L.drawerHardware} onChange={v=>set("drawerHardware",v)} type="number" mono/>
          <Inp label="Assembly $/cabinet" value={L.assemblyPerCabinet} onChange={v=>set("assemblyPerCabinet",v)} type="number" mono/>
          <Row gap={8}>
            <Inp label="Supplier calibration ×" value={L.supplierCalibration} onChange={v=>set("supplierCalibration",v)} type="number" mono sx={{flex:1}}/>
            <div style={{paddingTop:14}}><Toggle on={L.useCalibration!==false} onChange={v=>set("useCalibration",v)} label="On"/></div>
          </Row>
          <div style={{fontSize:11,color:T.faint}}>Calibration aligns formula costs with your supplier's quoted C&A pricing.</div>
        </Card>
        <Card>
          <div style={{fontWeight:700,fontSize:13,marginBottom:12,color:"#ec4899"}}>Standard Dimensions (mm)</div>
          {["Base","Overhead","Tall"].map(t=><div key={t} style={{display:"flex",gap:8,alignItems:"flex-end",marginBottom:2}}>
            <div style={{width:74,fontSize:12,color:T.text,fontWeight:600,paddingBottom:16}}>{t}</div>
            <Inp label="Height" value={L.dims?.[t]?.h} onChange={v=>setDim(t,"h",v)} type="number" mono sx={{flex:1,marginBottom:8}}/>
            <Inp label="Depth" value={L.dims?.[t]?.d} onChange={v=>setDim(t,"d",v)} type="number" mono sx={{flex:1,marginBottom:8}}/>
          </div>)}
          <div style={{fontSize:11,color:T.faint,marginTop:6}}>
            Global defaults — each project can override all dims and rates in Estimate → Cabinetry Setup.
          </div>
        </Card>
      </div>

      <Card sx={{padding:0,overflow:"hidden"}}>
        <div style={{padding:"12px 16px",borderBottom:`1px solid ${T.border}`,display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
          <div style={{fontWeight:700,fontSize:13}}>Generated Price Grid</div>
          <div style={{color:T.muted,fontSize:11}}>supply cost per cabinet at default finish — computed live</div>
          <div style={{marginLeft:"auto",display:"flex",gap:4}}>
            {Object.keys(CONFIGS).map(t=><div key={t} onClick={()=>setGridType(t)} style={{
              padding:"4px 11px",borderRadius:4,cursor:"pointer",fontSize:12,fontWeight:600,
              background:gridType===t?"rgba(236,72,153,0.12)":T.bg,color:gridType===t?"#ec4899":T.muted,
              border:`1px solid ${gridType===t?"#ec4899":T.border}`}}>{t}</div>)}
          </div>
        </div>
        <div style={{overflowX:"auto",maxHeight:560,overflowY:"auto"}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
            <thead><tr style={{background:T.bg,color:T.faint}}>
              <th style={{padding:"6px 12px",textAlign:"left",fontWeight:600}}>{gridType==="Panel"?"Config":"Width"}</th>
              {gridType==="Panel"
                ? ["Carcass m²","Front m²","Supply $","Install hrs"].map(h=><th key={h} style={{padding:"6px 10px",textAlign:"right",fontWeight:600}}>{h}</th>)
                : CONFIGS[gridType].map(cf=><th key={cf} style={{padding:"6px 10px",textAlign:"right",fontWeight:600}}>{cf}</th>)}
            </tr></thead>
            <tbody>
              {gridType==="Panel"
                ? CONFIGS.Panel.map(cfg=>{
                    const pr=priceCabLine({type:"Panel",config:cfg,width:0},L);
                    return <tr key={cfg} style={{borderTop:`1px solid ${T.border}`}}>
                      <td style={{padding:"6px 12px",color:T.text,fontWeight:600}}>{cfg}</td>
                      <td style={{padding:"6px 10px",textAlign:"right",fontFamily:T.mono,color:T.muted}}>{pr.carcassM2.toFixed(2)}</td>
                      <td style={{padding:"6px 10px",textAlign:"right",fontFamily:T.mono,color:T.muted}}>{pr.frontM2.toFixed(2)}</td>
                      <td style={{padding:"6px 10px",textAlign:"right",fontFamily:T.mono,color:T.accent,fontWeight:700}}>{$$(pr.supply)}</td>
                      <td style={{padding:"6px 10px",textAlign:"right",fontFamily:T.mono,color:T.teal}}>{pr.installHours}h</td>
                    </tr>;
                  })
                : widths.map(w=><tr key={w} style={{borderTop:`1px solid ${T.border}`}}>
                    <td style={{padding:"5px 12px",fontFamily:T.mono,color:T.text,fontWeight:700}}>{w}</td>
                    {CONFIGS[gridType].map(cfg=>{
                      const valid=!(cfg==="1 Door"&&w>600)&&!(cfg==="2 Door"&&w<500);
                      if(!valid) return <td key={cfg} style={{padding:"5px 10px",textAlign:"right",color:T.faint}}>—</td>;
                      const pr=priceCabLine({type:gridType,config:cfg,width:w},L);
                      return <td key={cfg} style={{padding:"5px 10px",textAlign:"right",fontFamily:T.mono,color:T.accent}}>{$$(pr.supply)}</td>;
                    })}
                  </tr>)}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  </div>;
}

// ── Finish Library: board $/m² per finish range, supplier-adjustable
function FinishLibrary({cabLib,setCabLib,pop}) {
  const L=cabLib||SEED_CABLIB;
  const [nf,setNf]=useState({name:"",rate:0,notes:""});
  function upd(id,k,v){ setCabLib(x=>({...x,finishes:x.finishes.map(f=>f.id===id?{...f,[k]:k==="rate"?parseFloat(v)||0:v}:f)})); }
  return <div>
    <Card sx={{marginBottom:14,padding:0,overflow:"hidden"}}>
      <div style={{padding:"12px 16px",borderBottom:`1px solid ${T.border}`,fontWeight:700,fontSize:13}}>
        Finish Library — board price per m² <span style={{color:T.muted,fontWeight:400,fontSize:11}}>(adjust to your supplier's pricing)</span>
      </div>
      <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
        <thead><tr style={{background:T.bg,color:T.faint,fontSize:11,textAlign:"left"}}>
          {["Finish Range","Rate $/m²","Notes","Default",""].map(h=><th key={h} style={{padding:"7px 14px",fontWeight:600}}>{h}</th>)}
        </tr></thead>
        <tbody>{(L.finishes||[]).map(f=><tr key={f.id} style={{borderTop:`1px solid ${T.border}`}}>
          <td style={{padding:"8px 14px"}}>
            <input value={f.name} onChange={e=>upd(f.id,"name",e.target.value)}
              style={{background:"transparent",border:"none",color:T.text,fontSize:13,fontFamily:T.font,width:"100%",outline:"none"}}/>
          </td>
          <td style={{padding:"8px 14px"}}>
            <input type="number" value={f.rate} onChange={e=>upd(f.id,"rate",e.target.value)}
              style={{width:90,background:T.bg,border:`1px solid ${T.border}`,borderRadius:4,padding:"4px 8px",color:T.accent,fontFamily:T.mono,fontSize:13}}/>
          </td>
          <td style={{padding:"8px 14px"}}>
            <input value={f.notes||""} onChange={e=>upd(f.id,"notes",e.target.value)}
              style={{background:"transparent",border:"none",color:T.muted,fontSize:12,fontFamily:T.font,width:"100%",outline:"none"}}/>
          </td>
          <td style={{padding:"8px 14px"}}>
            <input type="radio" checked={L.defaultFinishId===f.id} onChange={()=>setCabLib(x=>({...x,defaultFinishId:f.id}))} style={{accentColor:"#ec4899"}}/>
          </td>
          <td style={{padding:"8px 14px"}}>
            <Btn sm v="red" onClick={()=>{setCabLib(x=>({...x,finishes:x.finishes.filter(y=>y.id!==f.id)}));pop("Finish removed.");}}>✕</Btn>
          </td>
        </tr>)}</tbody>
      </table>
    </Card>
    <Card hi>
      <div style={{fontWeight:700,fontSize:13,marginBottom:10,color:T.accent}}>Add Finish</div>
      <div style={{display:"grid",gridTemplateColumns:"2fr 110px 2fr auto",gap:10,alignItems:"flex-end"}}>
        <Inp label="Finish Range" value={nf.name} onChange={v=>setNf(x=>({...x,name:v}))} placeholder="e.g. Woodmatt textured"/>
        <Inp label="$/m²" value={nf.rate} onChange={v=>setNf(x=>({...x,rate:v}))} type="number" mono/>
        <Inp label="Notes" value={nf.notes} onChange={v=>setNf(x=>({...x,notes:v}))}/>
        <div style={{paddingBottom:10}}><Btn v="pri" onClick={()=>{
          if(!nf.name) return pop("Name required.","error");
          setCabLib(x=>({...x,finishes:[...x.finishes,{...nf,id:Date.now(),rate:parseFloat(nf.rate)||0}]}));
          setNf({name:"",rate:0,notes:""}); pop("Finish added.");
        }}>Add</Btn></div>
      </div>
    </Card>
  </div>;
}

// ── Install & Delivery: per-item install hours (ea/lm/m² modes) + logistics defaults
function InstallLibrary({cabLib,setCabLib,pop}) {
  const L=cabLib||SEED_CABLIB;
  const set=(k,v)=>setCabLib(x=>({...x,[k]:v}));
  function updIR(key,k,v){ setCabLib(x=>({...x,installRates:x.installRates.map(r=>r.key===key?{...r,[k]:k==="hours"?parseFloat(v)||0:v}:r)})); }
  return <div>
    <div style={{display:"grid",gridTemplateColumns:"300px 1fr",gap:14}}>
      <div>
        <Card sx={{marginBottom:14}}>
          <div style={{fontWeight:700,fontSize:13,marginBottom:12,color:T.teal}}>Install Rates</div>
          <Inp label="Install company $/hr" value={L.installHourlyRate} onChange={v=>set("installHourlyRate",v)} type="number" mono/>
          <Inp label="Minimum install hours" value={L.installMinHours} onChange={v=>set("installMinHours",v)} type="number" mono/>
          <Inp label="Site setup / unload hours" value={L.installSiteSetupHours} onChange={v=>set("installSiteSetupHours",v)} type="number" mono/>
        </Card>
        <Card>
          <div style={{fontWeight:700,fontSize:13,marginBottom:12,color:T.teal}}>Delivery & Project Handling (defaults)</div>
          <Inp label="Delivery / handling allowance $" value={L.deliveryAllowance} onChange={v=>set("deliveryAllowance",v)} type="number" mono/>
          <Inp label="Site protection allowance $" value={L.protectionAllowance} onChange={v=>set("protectionAllowance",v)} type="number" mono/>
          <Inp label="Project management allocation $" value={L.pmAllowance} onChange={v=>set("pmAllowance",v)} type="number" mono/>
          <div style={{fontSize:11,color:T.faint}}>Defaults copied into each project's Cabinetry Setup — adjust per project there.</div>
        </Card>
      </div>
      <Card sx={{padding:0,overflow:"hidden"}}>
        <div style={{padding:"12px 16px",borderBottom:`1px solid ${T.border}`,fontWeight:700,fontSize:13}}>
          Install Hours per Item <span style={{color:T.muted,fontWeight:400,fontSize:11}}>charged at hourly rate · mode: each / lineal metre / m²</span>
        </div>
        <div style={{maxHeight:560,overflowY:"auto"}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
            <thead><tr style={{background:T.bg,color:T.faint,fontSize:11,textAlign:"left"}}>
              {["Type","Config","Hours","Mode","$ @ rate","Notes"].map(h=><th key={h} style={{padding:"6px 12px",fontWeight:600}}>{h}</th>)}
            </tr></thead>
            <tbody>{(L.installRates||[]).map(r=><tr key={r.key} style={{borderTop:`1px solid ${T.border}`}}>
              <td style={{padding:"7px 12px",color:T.text,fontWeight:600}}>{r.type}</td>
              <td style={{padding:"7px 12px",color:T.text}}>{r.config}</td>
              <td style={{padding:"7px 12px"}}>
                <input type="number" step="0.05" value={r.hours} onChange={e=>updIR(r.key,"hours",e.target.value)}
                  style={{width:64,background:T.bg,border:`1px solid ${T.border}`,borderRadius:4,padding:"3px 6px",color:T.teal,fontFamily:T.mono,fontSize:12}}/>
              </td>
              <td style={{padding:"7px 12px"}}>
                <select value={r.mode} onChange={e=>updIR(r.key,"mode",e.target.value)}
                  style={{background:T.bg,border:`1px solid ${T.border}`,borderRadius:4,padding:"3px 6px",color:T.text,fontSize:11}}>
                  <option value="ea">per item</option><option value="lm">per lm</option><option value="m2">per m²</option>
                </select>
              </td>
              <td style={{padding:"7px 12px",fontFamily:T.mono,color:T.accent}}>{$$(r.hours*(L.installHourlyRate||0))}</td>
              <td style={{padding:"7px 12px",color:T.faint,fontSize:11}}>{r.notes}</td>
            </tr>)}</tbody>
          </table>
        </div>
      </Card>
    </div>
  </div>;
}

// ── Trade Rates: the general per-trade rate table
function TradeRates({rates, setRates, pop}) {
  const [showAdd, setShowAdd] = useState(false);
  const [nr, setNr] = useState({category:CATS[0],description:"",unit:"m²",rate:0,notes:""});
  const [filter, setFilter] = useState("All");
  const [search, setSearch] = useState("");
  const [editId, setEditId] = useState(null);

  const cats = ["All",...CATS.filter(c=>rates.some(r=>r.category===c))];
  const filtered = rates.filter(r=>{
    const mc = filter==="All"||r.category===filter;
    const ms = !search||[r.description,r.category,r.notes].join(" ").toLowerCase().includes(search.toLowerCase());
    return mc&&ms;
  });

  function addRate() {
    if(!nr.description) return pop("Description required.","error");
    setRates(rs=>[...rs,{...nr,id:Date.now(),rate:parseFloat(nr.rate)||0}]);
    setNr({category:CATS[0],description:"",unit:"m²",rate:0,notes:""});
    setShowAdd(false); pop("Rate added.");
  }

  function importCSV(e) {
    const file=e.target.files?.[0]; if(!file) return;
    const reader=new FileReader();
    reader.onload=ev=>{
      const lines=ev.target.result.split("\n").slice(1); // skip header
      let added=0;
      lines.forEach(line=>{
        const [category,description,unit,rate,notes=""]=line.split(",").map(x=>x.trim().replace(/^"|"$/g,""));
        if(description&&rate) { setRates(rs=>[...rs,{id:uid(),category:category||"Other",description,unit:unit||"ea",rate:parseFloat(rate)||0,notes}]); added++; }
      });
      pop(`${added} rates imported.`);
    };
    reader.readAsText(file);
    e.target.value="";
  }

  return <div>
    <Row gap={8} sx={{marginBottom:14,justifyContent:"flex-end"}}>
      <Btn v="gho" sm onClick={()=>{
        const csv="category,description,unit,rate,notes\n"+rates.map(r=>`"${r.category}","${r.description}","${r.unit}",${r.rate},"${r.notes||""}"`).join("\n");
        const a=document.createElement("a"); a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv"}));
        a.download="rates.csv"; a.click(); pop("Rates exported.");
      }}>⬇ Export CSV</Btn>
      <label style={{cursor:"pointer"}}>
        <Btn v="gho" sm>⬆ Import CSV</Btn>
        <input type="file" accept=".csv" style={{display:"none"}} onChange={importCSV}/>
      </label>
      <Btn v="pri" sm onClick={()=>setShowAdd(!showAdd)}>+ Add Rate</Btn>
    </Row>

    {showAdd&&<Card hi sx={{marginBottom:14}}>
      <div style={{fontWeight:700,marginBottom:10,color:T.accent}}>New Rate</div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 2fr 80px 90px",gap:10}}>
        <Sel label="Category" value={nr.category} onChange={v=>setNr(x=>({...x,category:v}))} options={CATS}/>
        <Inp label="Description" value={nr.description} onChange={v=>setNr(x=>({...x,description:v}))} placeholder="e.g. Timber wall framing"/>
        <Sel label="Unit" value={nr.unit} onChange={v=>setNr(x=>({...x,unit:v}))} options={UNITS}/>
        <Inp label="Rate ($)" value={nr.rate} onChange={v=>setNr(x=>({...x,rate:v}))} type="number" mono/>
      </div>
      <Inp label="Notes" value={nr.notes} onChange={v=>setNr(x=>({...x,notes:v}))} placeholder="Optional notes"/>
      <Row gap={8}><Btn v="pri" onClick={addRate}>Add Rate</Btn><Btn onClick={()=>setShowAdd(false)}>Cancel</Btn></Row>
    </Card>}

    <Row gap={8} sx={{marginBottom:14}}>
      <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search rates…"
        style={{flex:1,background:T.card,border:`1px solid ${T.border}`,borderRadius:5,
          padding:"7px 11px",color:T.text,fontSize:13,outline:"none",fontFamily:T.font}}/>
    </Row>

    <Row gap={4} wrap sx={{marginBottom:14}}>
      {cats.map(c=><div key={c} onClick={()=>setFilter(c)} style={{
        padding:"4px 11px",borderRadius:4,cursor:"pointer",fontSize:12,fontWeight:600,
        background:filter===c?T.accentDim:T.card,color:filter===c?T.accent:T.muted,
        border:`1px solid ${filter===c?T.accentBrd:T.border}`}}>{c}</div>)}
    </Row>

    <Card sx={{padding:0,overflow:"hidden"}}>
      <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
        <thead><tr style={{background:T.bg,color:T.faint,fontSize:11,textAlign:"left",textTransform:"uppercase",letterSpacing:"0.05em"}}>
          {["Category","Description","Unit","Rate ($)","Notes",""].map(h=><th key={h} style={{padding:"7px 12px",fontWeight:600}}>{h}</th>)}
        </tr></thead>
        <tbody>
          {filtered.map(r=><tr key={r.id} style={{borderTop:`1px solid ${T.border}`}}>
            <td style={{padding:"9px 12px"}}><Bdg color={T.blue} sm>{r.category}</Bdg></td>
            <td style={{padding:"9px 12px"}}>
              {editId===r.id
                ? <input value={r.description} onChange={e=>setRates(rs=>rs.map(x=>x.id===r.id?{...x,description:e.target.value}:x))}
                    style={{background:T.bg,border:`1px solid ${T.accent}`,borderRadius:4,padding:"4px 8px",color:T.text,fontSize:13,fontFamily:T.font,width:"100%",outline:"none"}}/>
                : <span style={{color:T.text}}>{r.description}</span>
              }
            </td>
            <td style={{padding:"9px 12px",color:T.muted,fontFamily:T.mono,fontSize:12}}>{r.unit}</td>
            <td style={{padding:"9px 12px"}}>
              <input type="number" value={r.rate}
                onChange={e=>setRates(rs=>rs.map(x=>x.id===r.id?{...x,rate:parseFloat(e.target.value)||0}:x))}
                style={{width:88,background:T.bg,border:`1px solid ${T.border}`,borderRadius:4,
                  padding:"4px 7px",color:T.accent,fontFamily:T.mono,fontSize:13}}/>
            </td>
            <td style={{padding:"9px 12px",color:T.muted,fontSize:12}}>{r.notes}</td>
            <td style={{padding:"9px 12px"}}>
              <Row gap={5}>
                <Btn sm v="gho" onClick={()=>setEditId(editId===r.id?null:r.id)}>{editId===r.id?"Done":"Edit"}</Btn>
                <Btn sm v="red" onClick={()=>{setRates(rs=>rs.filter(x=>x.id!==r.id));pop("Rate deleted.");}}>✕</Btn>
              </Row>
            </td>
          </tr>)}
          {!filtered.length&&<tr><td colSpan={6} style={{padding:28,textAlign:"center",color:T.faint}}>No rates found.</td></tr>}
        </tbody>
      </table>
    </Card>
    <div style={{color:T.faint,fontSize:11,marginTop:8}}>{rates.length} rates total · CSV import format: category, description, unit, rate, notes</div>
  </div>;
}

// ═══════════════════════════════════════════════════════════════════════════
// XERO SYNC MODULE
// ═══════════════════════════════════════════════════════════════════════════
function XeroModule({projects, xero, setXero, mutProj, pop}) {
  const ready  = projects.filter(p=>["approved","active"].includes(p.status)&&!p.xeroRef);
  const synced = projects.filter(p=>p.xeroRef);
  const totalInvoiced = synced.reduce((s,p)=>s+(p.invoiced||0),0);

  function pushOne(proj) {
    const c=calc(proj);
    const ref="INV-"+String(Math.floor(1000+Math.random()*9000));
    mutProj(proj.id,p=>({...p,invoiced:c.total,xeroRef:ref,status:p.status==="approved"?"active":p.status}));
    setXero(x=>({...x,log:[{ts:new Date().toLocaleTimeString(),
      msg:`${ref} pushed — ${proj.name} ${$$(c.total,true)}`,ok:true},...(x.log||[])]}));
    pop(`${ref} pushed to Xero!`);
  }

  function pushAll() {
    ready.forEach(p=>pushOne(p));
    pop(`${ready.length} invoice${ready.length!==1?"s":""} pushed to Xero.`);
  }

  function clearLog() { setXero(x=>({...x,log:[]})); pop("Log cleared."); }

  return <div>
    <Hdr sub="Manage your Xero accounting integration and invoice synchronisation.">Xero Sync</Hdr>

    <Row gap={12} wrap sx={{marginBottom:18}}>
      <KPI label="Synced Invoices" value={synced.length} sub="total invoices pushed" color={T.green}/>
      <KPI label="Total Invoiced" value={$$(totalInvoiced,true)} sub="via Xero" color={T.teal}/>
      <KPI label="Awaiting Push" value={ready.length} sub="approved jobs not yet invoiced" color={T.yellow}/>
    </Row>

    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:18}}>
      {/* Connection */}
      <Card>
        <Row gap={10} sx={{marginBottom:12}}>
          <div style={{fontWeight:700,fontSize:13}}>Connection Status</div>
          <Bdg color={xero.connected?T.green:T.red}>{xero.connected?"Live":"Offline"}</Bdg>
        </Row>
        <div style={{color:T.muted,fontSize:13,lineHeight:1.6,marginBottom:16}}>
          {xero.connected
            ? "Xero is connected. Invoices, contacts and payments sync automatically."
            : "Connect your Xero organisation to enable invoice push, payment tracking and two-way reconciliation."}
        </div>
        <Btn v={xero.connected?"red":"grn"} onClick={()=>{
          setXero(x=>({...x,connected:!x.connected}));
          pop(xero.connected?"Xero disconnected.":"Xero connected!");
        }}>{xero.connected?"Disconnect Xero":"Connect to Xero"}</Btn>
      </Card>

      {/* Sync settings */}
      <Card>
        <div style={{fontWeight:700,fontSize:13,marginBottom:14}}>Sync Settings</div>
        <Toggle on={!!xero.autoSync} onChange={v=>setXero(x=>({...x,autoSync:v}))} label="Auto-sync on invoice creation"/>
        <Toggle on={!!xero.twoWay}   onChange={v=>setXero(x=>({...x,twoWay:v}))}   label="Two-way payment reconciliation"/>
        <Toggle on={!!xero.syncPO}   onChange={v=>setXero(x=>({...x,syncPO:v}))}   label="Sync purchase orders"/>
        <Grid2 gap={10} sx={{marginTop:8}}>
          <Inp label="Tax Code" value={xero.taxCode||"GST"} onChange={v=>setXero(x=>({...x,taxCode:v}))} mono/>
          <Inp label="Account Code" value={xero.accountCode||"200"} onChange={v=>setXero(x=>({...x,accountCode:v}))} mono/>
        </Grid2>
      </Card>
    </div>

    {/* Ready to invoice */}
    {ready.length>0&&<Card sx={{marginBottom:14}}>
      <Row gap={10} sx={{marginBottom:14}}>
        <div style={{fontWeight:700,fontSize:13}}>Ready to Invoice ({ready.length})</div>
        {ready.length>1&&<Btn sm v="grn" onClick={pushAll}>Push All to Xero</Btn>}
      </Row>
      {ready.map(p=>{
        const c=calc(p); const sm=STATUS[p.status]||STATUS.draft;
        return <div key={p.id} style={{display:"flex",justifyContent:"space-between",
          alignItems:"center",padding:"10px 0",borderBottom:`1px solid ${T.border}`}}>
          <div>
            <div style={{fontWeight:600,fontSize:13,color:T.text}}>{p.name}</div>
            <div style={{color:T.faint,fontSize:11}}>{p.client} · <Bdg color={sm.color} sm>{sm.label}</Bdg></div>
          </div>
          <Row gap={12}>
            <span style={{fontFamily:T.mono,color:T.accent,fontWeight:700}}>{$$(c.total)}</span>
            <Btn sm v="grn" onClick={()=>pushOne(p)}>⟳ Push</Btn>
          </Row>
        </div>;
      })}
    </Card>}

    {/* Synced invoices */}
    {synced.length>0&&<Card sx={{marginBottom:14}}>
      <div style={{fontWeight:700,fontSize:13,marginBottom:14}}>Synced Invoices ({synced.length})</div>
      <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
        <thead><tr style={{color:T.faint,fontSize:11,textAlign:"left",textTransform:"uppercase",letterSpacing:"0.05em"}}>
          {["Project","Client","Xero Ref","Amount","Action"].map(h=><th key={h} style={{padding:"6px 10px",fontWeight:600}}>{h}</th>)}
        </tr></thead>
        <tbody>{synced.map(p=><tr key={p.id} style={{borderTop:`1px solid ${T.border}`}}>
          <td style={{padding:"9px 10px",fontWeight:600,color:T.text}}>{p.name}</td>
          <td style={{padding:"9px 10px",color:T.muted,fontSize:12}}>{p.client}</td>
          <td style={{padding:"9px 10px"}}><Bdg color={T.green}>{p.xeroRef}</Bdg></td>
          <td style={{padding:"9px 10px",fontFamily:T.mono,color:T.green,fontWeight:700}}>{$$(p.invoiced)}</td>
          <td style={{padding:"9px 10px"}}>
            <Btn sm v="gho" onClick={()=>{
              const ref="INV-"+String(Math.floor(1000+Math.random()*9000));
              const c=calc(p);
              mutProj(p.id,x=>({...x,invoiced:c.total,xeroRef:ref}));
              setXero(x=>({...x,log:[{ts:new Date().toLocaleTimeString(),
                msg:`${ref} re-pushed — ${p.name}`,ok:true},...(x.log||[])]}));
              pop(`Re-pushed as ${ref}`);
            }}>Re-push</Btn>
          </td>
        </tr>)}</tbody>
      </table>
    </Card>}

    {/* Sync log */}
    <Card>
      <Row gap={10} sx={{marginBottom:12}}>
        <div style={{fontWeight:700,fontSize:13}}>Sync Log</div>
        {(xero.log||[]).length>0&&<Btn sm v="gho" onClick={clearLog}>Clear</Btn>}
      </Row>
      {(xero.log||[]).slice(0,25).map((l,i)=><div key={i} style={{
        display:"flex",gap:10,marginBottom:7,padding:"7px 10px",background:T.bg,borderRadius:4,fontSize:12}}>
        <span style={{color:T.faint,fontFamily:T.mono,flexShrink:0,width:58}}>{l.ts}</span>
        <span style={{color:l.ok?T.green:T.red}}>{l.msg}</span>
      </div>)}
      {!(xero.log||[]).length&&<div style={{color:T.faint,fontSize:12}}>No activity yet.</div>}
    </Card>
  </div>;
}

// ═══════════════════════════════════════════════════════════════════════════
// SETTINGS MODULE
// ═══════════════════════════════════════════════════════════════════════════
function SettingsModule({company, setCompany, trash, setTrash, onRestore, pop}) {
  const [local, setLocal] = useState(company);
  const [ai, setAi] = useLS("qf_ai", {mode:"proxy",endpoint:"/api/ai",apiKey:""});
  const set = (k,v) => setLocal(x=>({...x,[k]:v}));

  // storage usage meter (localStorage ~5MB budget in most browsers)
  const usageKB=(()=>{try{let n=0;for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);n+=(k.length+(localStorage.getItem(k)||"").length)*2;}return Math.round(n/1024);}catch{return 0;}})();
  const usagePct=Math.min(100,Math.round(usageKB/5120*100));

  const previewCost = 10000;
  const previewMargin   = previewCost * (1+local.defaultMargin/100);
  const previewOverhead = previewMargin * (1+local.defaultOverhead/100);
  const previewGst      = previewOverhead * (1+local.defaultGst/100);

  return <div>
    <Hdr sub="Company profile, branding, quote defaults and financial settings.">Settings</Hdr>

    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
      {/* Company details */}
      <Card>
        <div style={{fontWeight:700,marginBottom:14,color:T.accent,fontSize:13}}>Company Details</div>

        <Row gap={12} sx={{marginBottom:14}}>
          <div style={{width:48,height:48,borderRadius:10,background:T.accent,color:"#000",
            display:"flex",alignItems:"center",justifyContent:"center",fontWeight:900,fontSize:18,flexShrink:0}}>
            {local.logoText}
          </div>
          <Inp label="Logo Initials (2 chars)" value={local.logoText}
            onChange={v=>set("logoText",v.slice(0,2).toUpperCase())} sx={{flex:1,marginBottom:0}}/>
        </Row>

        <Inp label="Company / Trading Name" value={local.name} onChange={v=>set("name",v)}/>
        <Inp label="ABN / NZBN" value={local.abn} onChange={v=>set("abn",v)}/>
        <Inp label="Registered Address" value={local.address} onChange={v=>set("address",v)}/>
        <Grid2 gap={10}>
          <Inp label="Phone" value={local.phone} onChange={v=>set("phone",v)}/>
          <Inp label="Email" value={local.email} onChange={v=>set("email",v)}/>
        </Grid2>
        <Inp label="Website" value={local.website} onChange={v=>set("website",v)}/>
        <Grid2 gap={10}>
          <Inp label="Bank Name" value={local.bankName||""} onChange={v=>set("bankName",v)}/>
          <Inp label="Bank Account" value={local.bankAccount||""} onChange={v=>set("bankAccount",v)}/>
        </Grid2>
      </Card>

      <div style={{display:"flex",flexDirection:"column",gap:14}}>
        {/* Quote defaults */}
        <Card>
          <div style={{fontWeight:700,marginBottom:14,color:T.accent,fontSize:13}}>Quote Defaults</div>
          <Grid3 gap={10}>
            <Inp label="Default Margin %" value={local.defaultMargin} onChange={v=>set("defaultMargin",v)} type="number" mono/>
            <Inp label="Default Overhead %" value={local.defaultOverhead} onChange={v=>set("defaultOverhead",v)} type="number" mono/>
            <Inp label="Default GST %" value={local.defaultGst} onChange={v=>set("defaultGst",v)} type="number" mono/>
          </Grid3>
          <Sel label="Currency" value={local.currency} onChange={v=>set("currency",v)} options={["AUD","NZD","USD","GBP","SGD"]}/>
          <Inp label="Quote Validity Text" value={local.quoteValidity||""} onChange={v=>set("quoteValidity",v)} rows={2}/>
          <Inp label="Payment Terms" value={local.paymentTerms||""} onChange={v=>set("paymentTerms",v)} rows={2}/>
        </Card>

        {/* Live pricing preview */}
        <Card>
          <div style={{fontWeight:700,marginBottom:10,fontSize:13,color:T.accent}}>Live Pricing Preview</div>
          <div style={{color:T.muted,fontSize:11,marginBottom:10}}>How a $10,000 cost item builds to a quote total:</div>
          {[
            {l:"Raw cost",         v:"$10,000",                            c:T.muted},
            {l:`+ ${local.defaultMargin}% margin`, v:`$${previewMargin.toFixed(0)}`,  c:T.text},
            {l:`+ ${local.defaultOverhead}% overhead`, v:`$${previewOverhead.toFixed(0)}`, c:T.text},
            {l:`+ ${local.defaultGst}% GST`,       v:`$${previewGst.toFixed(0)}`,     c:T.accent, bold:true},
          ].map(r=><div key={r.l} style={{display:"flex",justifyContent:"space-between",
            padding:"6px 0",borderBottom:`1px solid ${T.border}`,fontSize:13}}>
            <span style={{color:T.muted}}>{r.l}</span>
            <span style={{fontFamily:T.mono,color:r.c,fontWeight:r.bold?800:600}}>{r.v}</span>
          </div>)}
          <div style={{marginTop:8,fontSize:11,color:T.faint}}>
            Effective multiplier: {(previewGst/previewCost).toFixed(3)}×
          </div>
        </Card>

        <Btn v="pri" full onClick={()=>{setCompany(local);pop("Settings saved!");}}>
          Save All Settings
        </Btn>

        <Card>
          <div style={{fontWeight:700,marginBottom:10,fontSize:13,color:T.teal}}>Data Backup & Restore</div>
          <div style={{color:T.muted,fontSize:12,marginBottom:8,lineHeight:1.6}}>
            All data lives in this browser. Export a full backup regularly.
          </div>
          {/* storage meter */}
          <div style={{marginBottom:12}}>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:11,color:T.muted,marginBottom:4}}>
              <span>Browser storage used</span>
              <span style={{fontFamily:T.mono,color:usagePct>80?T.red:T.text}}>{usageKB}KB / ~5MB ({usagePct}%)</span>
            </div>
            <div style={{background:T.bg,borderRadius:4,height:6,overflow:"hidden"}}>
              <div style={{height:"100%",width:`${usagePct}%`,background:usagePct>80?T.red:usagePct>60?T.yellow:T.green,borderRadius:4}}/>
            </div>
          </div>
          <Row gap={8}>
            <Btn v="grn" onClick={()=>{
              const keys=["qf_projects","qf_clients","qf_rates","qf_cablib","qf_company","qf_xero","qf_templates","qf_trash","qf_ai"];
              const dump={exportedAt:new Date().toISOString(),app:"QuantaFlow",data:{}};
              keys.forEach(k=>{try{const v=localStorage.getItem(k);if(v)dump.data[k]=JSON.parse(v);}catch{}});
              const a=document.createElement("a");
              a.href=URL.createObjectURL(new Blob([JSON.stringify(dump,null,2)],{type:"application/json"}));
              a.download=`quantaflow-backup-${new Date().toISOString().slice(0,10)}.json`;
              a.click();
              try{localStorage.setItem("qf_lastBackup",String(Date.now()));}catch{}
              pop("Full backup exported.");
            }}>⬇ Export All Data</Btn>
            <label style={{cursor:"pointer"}}>
              <Btn v="yel">⬆ Restore Backup</Btn>
              <input type="file" accept=".json" style={{display:"none"}} onChange={e=>{
                const f=e.target.files?.[0]; if(!f) return;
                const r=new FileReader();
                r.onload=ev=>{
                  try{
                    const dump=JSON.parse(ev.target.result);
                    if(!dump.data) throw new Error("Not a QuantaFlow backup");
                    if(!safeConfirm("Restore will REPLACE all current data with the backup. Continue?")) return;
                    Object.entries(dump.data).forEach(([k,v])=>localStorage.setItem(k,JSON.stringify(v)));
                    pop("Backup restored — reloading…");
                    setTimeout(()=>window.location.reload(),900);
                  }catch(err){ pop("Restore failed: "+err.message,"error"); }
                };
                r.readAsText(f); e.target.value="";
              }}/>
            </label>
          </Row>
        </Card>

        {/* AI Connection — required when hosting outside Claude.ai */}
        <Card>
          <div style={{fontWeight:700,marginBottom:8,fontSize:13,color:T.purple}}>AI Connection</div>
          <div style={{color:T.muted,fontSize:12,marginBottom:10,lineHeight:1.6}}>
            Default: the built-in /api/ai server route, which reads ANTHROPIC_API_KEY or OPENAI_API_KEY from .env.local — your key never reaches the browser.
          </div>
          <Sel label="Mode" value={ai.mode} onChange={v=>setAi(x=>({...x,mode:v}))}
            options={[
              {value:"proxy",label:"Built-in server proxy /api/ai (default — key stays on the server)"},
              {value:"claude",label:"Claude.ai artifact mode (only works inside Claude.ai)"},
              {value:"direct",label:"Direct API key in browser (DEV/TESTING ONLY)"},
            ]}/>
          {ai.mode==="proxy"&&<Inp label="Proxy endpoint URL" value={ai.endpoint} onChange={v=>setAi(x=>({...x,endpoint:v}))}
            placeholder="https://yourapp.com/api/ai" mono/>}
          {ai.mode==="direct"&&<>
            <Inp label="Anthropic API key" value={ai.apiKey} onChange={v=>setAi(x=>({...x,apiKey:v}))}
              placeholder="sk-ant-…" mono type="password"/>
            <div style={{background:T.redDim,border:`1px solid ${T.red}44`,borderRadius:6,padding:"8px 12px",fontSize:11,color:T.red,lineHeight:1.6}}>
              ⚠ The key is stored in this browser and visible to anyone using it. Never ship this mode to customers —
              use a server proxy that holds the key and meters usage per account.
            </div>
          </>}
        </Card>

        {/* Trash — restore soft-deleted projects */}
        <Card>
          <div style={{fontWeight:700,marginBottom:8,fontSize:13,color:T.red}}>Trash ({(trash||[]).length})</div>
          {(trash||[]).length
            ? <>
                {(trash||[]).map(p=><div key={p.id} style={{display:"flex",justifyContent:"space-between",
                  alignItems:"center",padding:"7px 0",borderBottom:`1px solid ${T.border}`}}>
                  <div>
                    <div style={{fontSize:13,fontWeight:600,color:T.text}}>{p.name}</div>
                    <div style={{fontSize:11,color:T.faint}}>{p.client} · trashed {String(p.trashedAt||"").slice(0,10)}</div>
                  </div>
                  <Row gap={6}>
                    <Btn sm v="grn" onClick={()=>onRestore(p.id)}>Restore</Btn>
                    <Btn sm v="red" onClick={()=>{
                      if(safeConfirm(`PERMANENTLY delete "${p.name}"? This cannot be undone.`))
                        setTrash(t=>t.filter(x=>x.id!==p.id));
                    }}>Delete Forever</Btn>
                  </Row>
                </div>)}
                <Btn sm v="gho" sx={{marginTop:10}} onClick={()=>{
                  if(safeConfirm("Empty trash permanently?")) {setTrash([]);pop("Trash emptied.");}
                }}>Empty Trash</Btn>
              </>
            : <div style={{color:T.faint,fontSize:12}}>Deleted projects land here and can be restored. Keeps the last 25.</div>}
        </Card>
      </div>
    </div>
  </div>;
}
