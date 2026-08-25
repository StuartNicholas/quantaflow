// Pure-JS tests for the priceCabinet() costing engine.
// Run with: node tests/priceCabinet.test.js
// No test framework — intentional; project has no test runner configured.

// ─── Inline the function under test ──────────────────────────────────────────
// priceCabinet is extracted verbatim from ConstructionHub.jsx (function priceCabinet).
// If the signature changes, update here too.

function priceCabinet(cab, rules, rates) {
  const R=rules||{}, P=rates||{};
  const type=(cab.type||"Base");
  const cabConfig=cab.config||"";
  let W=+cab.width||0, H=+cab.height||0, D=+cab.depth||0;
  if(!H||!D){
    if(/over|wall|upper/i.test(type)){ H=H||R.default_over_h||720; D=D||R.default_over_d||320; }
    else if(/tall|pantry|broom/i.test(type)){ H=H||R.tall_height_default||R.default_tall_h||2400; D=D||R.default_tall_d||560; }
    else { H=H||R.default_base_h||720; D=D||R.default_base_d||560; }
  }
  if(!W) W=600;
  const m2=(mm2)=>mm2/1e6;
  let carcassM2=0;
  if(R.include_sides!==false)     carcassM2 += 2*m2(H*D);
  if(R.include_topbottom!==false) carcassM2 += 2*m2(W*D);
  if(R.include_back!==false)      carcassM2 += m2(W*H);
  carcassM2 += (R.shelves_per_cab??1)*m2(W*D);
  carcassM2 = Math.round(carcassM2*1000)/1000;
  const doors=+cab.doors||0, drawers=+cab.drawers||0;
  const fronts=doors+drawers;
  const frontM2 = fronts>0 ? m2(W*H) : 0;

  const hrsKey=`${type}|${cabConfig}|${W}`;
  const hrs=(R.default_hrs&&R.default_hrs[hrsKey])||{};
  const draftingHrs=+(hrs.drafting||0);
  const cuttingHrs =+(hrs.cutting ||0);
  const edgingHrs  =+(hrs.edging  ||0);
  const assemblyHrs=+(hrs.assembly||0);
  const packingHrs =+(hrs.packing ||0);

  const rDrafting = P.rate_drafting  ??R.rate_drafting  ??null;
  const rCutting  = P.rate_cutting   ??R.rate_cutting   ??null;
  const rEdging   = P.rate_edging    ??R.rate_edging    ??null;
  const rAssembly = P.rate_assembly  ??R.rate_assembly  ??null;
  const rPacking  = P.rate_packing   ??R.rate_packing   ??null;

  const labourCost = draftingHrs*(rDrafting??0) + cuttingHrs*(rCutting??0) +
                     edgingHrs*(rEdging??0) + assemblyHrs*(rAssembly??0) + packingHrs*(rPacking??0);

  const hasNewAssemblyCost = assemblyHrs>0 && rAssembly!=null && +rAssembly>0;
  const legacyAssembly = hasNewAssemblyCost ? 0 : (+R.assembly_per_cab||0);

  const carcassRate = P.carcass??null;
  const carcassCost = carcassM2*(carcassRate??0);

  const missingRates=[];
  if(carcassM2>0 && carcassRate===null)  missingRates.push("carcass");
  if(draftingHrs>0 && rDrafting===null)  missingRates.push("rate_drafting");
  if(cuttingHrs >0 && rCutting ===null)  missingRates.push("rate_cutting");
  if(edgingHrs  >0 && rEdging  ===null)  missingRates.push("rate_edging");
  if(assemblyHrs>0 && rAssembly===null)  missingRates.push("rate_assembly");
  if(packingHrs >0 && rPacking ===null)  missingRates.push("rate_packing");

  if((R.pricing_model||"spreadsheet")==="spreadsheet"){
    const doorHwRate   = P.door_hardware_rate  ??R.door_hardware_cost  ??null;
    const drawerHwRate = P.drawer_hardware_rate??R.drawer_hardware_cost??null;
    if(doors  >0 && doorHwRate  ===null) missingRates.push("door_hardware");
    if(drawers>0 && drawerHwRate===null) missingRates.push("drawer_hardware");
    const doorHwCost   = doors  *(doorHwRate  ??0);
    const drawerHwCost = drawers*(drawerHwRate??0);
    const finishRate = P.front??R.default_finish_rate??null;
    if(frontM2>0 && finishRate===null) missingRates.push("front");
    const frontCost  = frontM2*(finishRate??0);
    const total = carcassCost+doorHwCost+drawerHwCost+frontCost+labourCost+legacyAssembly;
    return {
      model:"spreadsheet",
      dims:{W,H,D}, carcassM2:+carcassM2.toFixed(3), frontM2:+frontM2.toFixed(3),
      doors, drawers,
      carcassCost:+carcassCost.toFixed(2),
      doorHwCost:+doorHwCost.toFixed(2), drawerHwCost:+drawerHwCost.toFixed(2),
      frontCost:+frontCost.toFixed(2),
      labourCost:+labourCost.toFixed(2),
      legacyAssembly:+legacyAssembly.toFixed(2),
      assembly:+legacyAssembly.toFixed(2),
      calibration:1,
      total:+total.toFixed(2),
      missingRates, reviewRequired:missingRates.length>0,
    };
  }

  const hinges = doors*(R.hinges_per_door??2);
  const handles= doors*(R.handles_per_door??1)+drawers*(R.handles_per_drawer??1);
  const feet   = /base/i.test(type)?(R.feet_per_base??4):0;
  const hingeRate  = P.hinge ??null;
  const handleRate = P.handle??null;
  const footRate   = P.foot  ??null;
  const frontRate2 = P.front ??null;
  if(hinges >0 && hingeRate ===null) missingRates.push("hinge");
  if(handles>0 && handleRate===null) missingRates.push("handle");
  if(feet   >0 && footRate  ===null) missingRates.push("foot");
  if(frontM2>0 && frontRate2===null) missingRates.push("front");
  const frontCost  = frontM2 *(frontRate2??0);
  const hingeCost  = hinges  *(hingeRate ??0);
  const handleCost = handles *(handleRate??0);
  const footCost   = feet    *(footRate  ??0);
  const total = carcassCost+frontCost+hingeCost+handleCost+footCost+labourCost+legacyAssembly;
  return {
    model:"components",
    dims:{W,H,D}, carcassM2:+carcassM2.toFixed(3), frontM2:+frontM2.toFixed(3),
    hinges, handles, feet,
    carcassCost:+carcassCost.toFixed(2), frontCost:+frontCost.toFixed(2),
    hingeCost:+hingeCost.toFixed(2), handleCost:+handleCost.toFixed(2),
    footCost:+footCost.toFixed(2),
    labourCost:+labourCost.toFixed(2),
    legacyAssembly:+legacyAssembly.toFixed(2),
    assembly:+legacyAssembly.toFixed(2),
    total:+total.toFixed(2),
    missingRates, reviewRequired:missingRates.length>0,
  };
}

// ─── Minimal test harness ─────────────────────────────────────────────────────
let pass=0, fail=0;
function expect(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if(ok) { console.log(`  ✓ ${label}`); pass++; }
  else  { console.error(`  ✗ ${label}\n    expected: ${JSON.stringify(expected)}\n    actual:   ${JSON.stringify(actual)}`); fail++; }
}
function approx(label, actual, expected, tolerance=0.01) {
  const ok = Math.abs(actual - expected) <= tolerance;
  if(ok) { console.log(`  ✓ ${label}`); pass++; }
  else  { console.error(`  ✗ ${label}\n    expected: ${expected} ±${tolerance}\n    actual:   ${actual}`); fail++; }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

console.log("\n── 1. Carcass geometry: 1200mm Base 2 Door ──");
{
  // User-verified breakdown:
  // Sides:      2 × 720 × 560 = 806,400
  // Top+Bottom: 2 × 1200 × 560 = 1,344,000
  // Back:       1200 × 720 = 864,000
  // Shelf:      1200 × 560 = 672,000
  // Total = 3,686,400 mm² = 3.686 m² (rounded to 3dp)
  const rules = { include_sides:true, include_topbottom:true, include_back:true, shelves_per_cab:1 };
  const rates = { carcass:52, front:85, door_hardware_rate:12, drawer_hardware_rate:95 };
  const r = priceCabinet({type:"Base",config:"2 Door",width:1200,height:720,depth:560,doors:2,drawers:0}, rules, rates);
  approx("carcassM2 = 3.686", r.carcassM2, 3.686, 0.001);
  approx("carcassCost = 3.686 × 52 = 191.67", r.carcassCost, 191.67, 0.01);
  expect("reviewRequired = false", r.reviewRequired, false);
  expect("model = spreadsheet", r.model, "spreadsheet");
}

console.log("\n── 2. Missing carcass rate → reviewRequired ──");
{
  const rules = {};
  const rates = { carcass:null, front:85, door_hardware_rate:12 };
  const r = priceCabinet({type:"Base",config:"2 Door",width:600,height:720,depth:560,doors:2,drawers:0}, rules, rates);
  expect("reviewRequired = true", r.reviewRequired, true);
  expect("missingRates includes carcass", r.missingRates.includes("carcass"), true);
  // carcassCost is computed with ??0 so total is still numeric
  approx("total is numeric (not NaN)", r.total, r.total, 0);
}

console.log("\n── 3. No hardcoded $12/$95 — missing door hardware → reviewRequired ──");
{
  const rules = {};
  // door_hardware_rate not set anywhere → should require review
  const rates = { carcass:52, front:85 };
  const r = priceCabinet({type:"Base",config:"2 Door",width:600,height:720,depth:560,doors:2,drawers:0}, rules, rates);
  expect("reviewRequired = true (no door hw rate)", r.reviewRequired, true);
  expect("missingRates includes door_hardware", r.missingRates.includes("door_hardware"), true);
  expect("doorHwCost = 0 (no fallback)", r.doorHwCost, 0);
}

console.log("\n── 4. Production hours key is Type|Config|Width ──");
{
  const rules = {
    default_hrs: { "Base|2 Door|600": {drafting:0.5, cutting:1.0, edging:0.5, assembly:2.0, packing:0.5} },
    rate_assembly: 50,
    rate_cutting: 55,
  };
  const rates = { carcass:52, front:85, door_hardware_rate:12, rate_drafting:45, rate_cutting:60, rate_edging:40, rate_assembly:55, rate_packing:35 };
  const r = priceCabinet({type:"Base",config:"2 Door",width:600,height:720,depth:560,doors:2,drawers:0}, rules, rates);
  // labourCost = 0.5×45 + 1.0×60 + 0.5×40 + 2.0×55 + 0.5×35 = 22.5+60+20+110+17.5 = 230
  approx("labourCost from calibrated hours", r.labourCost, 230, 0.01);
}

console.log("\n── 5. Hours key lookup miss → zero labour (different width) ──");
{
  const rules = {
    default_hrs: { "Base|2 Door|600": {assembly:2.0} },
    rate_assembly: 50,
  };
  const rates = { carcass:52, front:85, door_hardware_rate:12 };
  // width 900 ≠ 600, so hrs lookup misses → zero labour
  const r = priceCabinet({type:"Base",config:"2 Door",width:900,height:720,depth:560,doors:2,drawers:0}, rules, rates);
  expect("labourCost = 0 when key misses", r.labourCost, 0);
}

console.log("\n── 6. Legacy assembly fallback logic ──");
{
  const rules = { assembly_per_cab:50 };
  const rates = { carcass:52, front:85, door_hardware_rate:12 };
  // No hours set → legacy fallback used
  const r1 = priceCabinet({type:"Base",config:"2 Door",width:600,height:720,depth:560,doors:2,drawers:0}, rules, rates);
  expect("legacyAssembly used when no hrs", r1.legacyAssembly, 50);

  // assemblyHrs > 0 AND rAssembly > 0 → legacy suppressed
  const rules2 = {
    assembly_per_cab:50,
    default_hrs: { "Base|2 Door|600": {assembly:2.0} },
    rate_assembly: 50,
  };
  const r2 = priceCabinet({type:"Base",config:"2 Door",width:600,height:720,depth:560,doors:2,drawers:0}, rules2, rates);
  expect("legacyAssembly = 0 when both hrs and rate set", r2.legacyAssembly, 0);

  // assemblyHrs > 0 but rAssembly is null → legacy NOT suppressed
  const rules3 = {
    assembly_per_cab:50,
    default_hrs: { "Base|2 Door|600": {assembly:2.0} },
  };
  const rates3 = { carcass:52, front:85, door_hardware_rate:12 };
  const r3 = priceCabinet({type:"Base",config:"2 Door",width:600,height:720,depth:560,doors:2,drawers:0}, rules3, rates3);
  expect("legacyAssembly preserved when assemblyHrs set but rate is null", r3.legacyAssembly, 50);
  // And rate_assembly missing → missingRates includes it
  expect("rate_assembly in missingRates when hrs>0 but rate null", r3.missingRates.includes("rate_assembly"), true);

  // rAssembly > 0 but assemblyHrs = 0 → legacy NOT suppressed (AND condition)
  const rules4 = { assembly_per_cab:50, rate_assembly: 50 };
  const rates4 = { carcass:52, front:85, door_hardware_rate:12, rate_assembly:50 };
  const r4 = priceCabinet({type:"Base",config:"2 Door",width:600,height:720,depth:560,doors:2,drawers:0}, rules4, rates4);
  expect("legacyAssembly preserved when rate set but assemblyHrs = 0", r4.legacyAssembly, 50);
}

console.log("\n── 7. calibration always returns 1 ──");
{
  const rules = {};
  const rates = { carcass:52, front:85, door_hardware_rate:12 };
  const r = priceCabinet({type:"Base",config:"2 Door",width:600,height:720,depth:560,doors:2,drawers:0}, rules, rates);
  expect("calibration = 1 (no supplier_calibration)", r.calibration, 1);
}

console.log("\n── 8. reviewRequired preserves partial total as numeric (no NaN) ──");
{
  const rates = { carcass:null, front:null };
  const r = priceCabinet({type:"Base",config:"2 Door",width:600,height:720,depth:560,doors:2,drawers:0}, {}, rates);
  expect("reviewRequired = true", r.reviewRequired, true);
  expect("total is a finite number", Number.isFinite(r.total), true);
}

console.log("\n── 9. Drawer-only cabinet (no doors) ──");
{
  const rules = {};
  const rates = { carcass:52, front:85, drawer_hardware_rate:95 };
  const r = priceCabinet({type:"Base",config:"3 Drawer",width:600,height:720,depth:560,doors:0,drawers:3}, rules, rates);
  // No doors → door_hardware_rate not required (doors=0)
  expect("door_hardware not in missingRates for drawer-only", r.missingRates.includes("door_hardware"), false);
  expect("drawerHwCost = 3 × 95 = 285", r.drawerHwCost, 285);
}

console.log("\n── 10. Overhead default dimensions ──");
{
  const rules = { default_over_h:720, default_over_d:320 };
  const rates = { carcass:52, front:85, door_hardware_rate:12 };
  const r = priceCabinet({type:"Overhead",config:"2 Door",width:900,doors:2,drawers:0}, rules, rates);
  expect("height defaults to 720 for Overhead", r.dims.H, 720);
  expect("depth defaults to 320 for Overhead", r.dims.D, 320);
}

// ─── Inline seedDefaultHrs + PROVISIONAL_HRS (matches ConstructionHub.jsx) ───

const PROVISIONAL_HRS = {
  "Base|1 Door":    {drafting:0.062, cutting:0.044, edging:0.044, assembly:0.111, packing:0.022},
  "Base|2 Door":    {drafting:0.079, cutting:0.057, edging:0.057, assembly:0.143, packing:0.029},
  "Base|1 Drawer":  {drafting:0.088, cutting:0.063, edging:0.063, assembly:0.159, packing:0.032},
  "Base|2 Drawer":  {drafting:0.115, cutting:0.083, edging:0.083, assembly:0.206, packing:0.041},
  "Base|3 Drawer":  {drafting:0.141, cutting:0.102, edging:0.102, assembly:0.254, packing:0.051},
  "Base|4 Drawer":  {drafting:0.168, cutting:0.121, edging:0.121, assembly:0.302, packing:0.060},
  "Base|5 Drawer":  {drafting:0.194, cutting:0.140, edging:0.140, assembly:0.349, packing:0.070},
  "Overhead|1 Door":{drafting:0.079, cutting:0.057, edging:0.057, assembly:0.143, packing:0.029},
  "Overhead|2 Door":{drafting:0.097, cutting:0.070, edging:0.070, assembly:0.175, packing:0.035},
  "Tall|1 Door":    {drafting:0.141, cutting:0.102, edging:0.102, assembly:0.254, packing:0.051},
  "Tall|2 Door":    {drafting:0.194, cutting:0.140, edging:0.140, assembly:0.349, packing:0.070},
};
const HRS_OPS=["drafting","cutting","edging","assembly","packing"];

const CABINET_TYPES = [
  {type:"Base",     config:"1 Door",  wMin:300, wMax:600},
  {type:"Base",     config:"2 Door",  wMin:500, wMax:1200},
  {type:"Base",     config:"1 Drawer",wMin:300, wMax:1200},
  {type:"Base",     config:"2 Drawer",wMin:300, wMax:1200},
  {type:"Base",     config:"3 Drawer",wMin:300, wMax:1200},
  {type:"Base",     config:"4 Drawer",wMin:300, wMax:1200},
  {type:"Base",     config:"5 Drawer",wMin:300, wMax:1200},
  {type:"Overhead", config:"1 Door",  wMin:300, wMax:600},
  {type:"Overhead", config:"2 Door",  wMin:500, wMax:1200},
  {type:"Tall",     config:"1 Door",  wMin:300, wMax:600},
  {type:"Tall",     config:"2 Door",  wMin:500, wMax:1200},
];

function seedDefaultHrs(existing, cabinetTypes, step, minW, maxW){
  const merged={...existing};
  let changed=false;
  cabinetTypes.forEach(ct=>{
    const prov=PROVISIONAL_HRS[`${ct.type}|${ct.config}`];
    if(!prov) return;
    const lo=Math.max(ct.wMin,minW), hi=Math.min(ct.wMax,maxW);
    for(let w=lo;w<=hi;w+=step){
      const key=`${ct.type}|${ct.config}|${w}`;
      const cur=merged[key]||{};
      const patched={...cur};
      HRS_OPS.forEach(op=>{ if(!+cur[op]){ patched[op]=prov[op]; changed=true; } });
      merged[key]=patched;
    }
  });
  return {merged,changed};
}

// ─── Seed tests ──────────────────────────────────────────────────────────────

console.log("\n── 11. seedDefaultHrs: Base|2 Door|600 provisional values ──");
{
  const {merged} = seedDefaultHrs({}, CABINET_TYPES, 50, 300, 1200);
  const h = merged["Base|2 Door|600"];
  expect("drafting 0.079", h.drafting, 0.079);
  expect("cutting  0.057", h.cutting,  0.057);
  expect("edging   0.057", h.edging,   0.057);
  expect("assembly 0.143", h.assembly, 0.143);
  expect("packing  0.029", h.packing,  0.029);
}

console.log("\n── 12. seedDefaultHrs: Base|4 Drawer|600 provisional values ──");
{
  const {merged} = seedDefaultHrs({}, CABINET_TYPES, 50, 300, 1200);
  const h = merged["Base|4 Drawer|600"];
  expect("drafting 0.168", h.drafting, 0.168);
  expect("cutting  0.121", h.cutting,  0.121);
  expect("edging   0.121", h.edging,   0.121);
  expect("assembly 0.302", h.assembly, 0.302);
  expect("packing  0.060", h.packing,  0.060);
}

console.log("\n── 13. seedDefaultHrs: Tall|2 Door|600 provisional values ──");
{
  const {merged} = seedDefaultHrs({}, CABINET_TYPES, 50, 300, 1200);
  const h = merged["Tall|2 Door|600"];
  expect("drafting 0.194", h.drafting, 0.194);
  expect("cutting  0.140", h.cutting,  0.140);
  expect("edging   0.140", h.edging,   0.140);
  expect("assembly 0.349", h.assembly, 0.349);
  expect("packing  0.070", h.packing,  0.070);
}

console.log("\n── 14. seedDefaultHrs: every generated width has an entry ──");
{
  const {merged} = seedDefaultHrs({}, CABINET_TYPES, 50, 300, 1200);
  let missingKeys = [];
  CABINET_TYPES.forEach(ct=>{
    const lo=Math.max(ct.wMin,300), hi=Math.min(ct.wMax,1200);
    for(let w=lo;w<=hi;w+=50){
      const key=`${ct.type}|${ct.config}|${w}`;
      if(!merged[key]) missingKeys.push(key);
    }
  });
  expect("no missing keys", missingKeys.length, 0);
}

console.log("\n── 15. seedDefaultHrs: preserves existing non-zero values ──");
{
  const existing = {
    "Base|2 Door|600": {drafting:1.5, cutting:0, edging:0, assembly:0, packing:0},
  };
  const {merged} = seedDefaultHrs(existing, CABINET_TYPES, 50, 300, 1200);
  const h = merged["Base|2 Door|600"];
  // drafting was non-zero → preserved
  expect("existing non-zero drafting preserved", h.drafting, 1.5);
  // cutting was 0 → seeded with provisional
  expect("zero cutting seeded with provisional", h.cutting, 0.057);
}

console.log("\n── 16. seedDefaultHrs: changed=false when all values already set ──");
{
  // Fully populate first
  const {merged: first} = seedDefaultHrs({}, CABINET_TYPES, 50, 300, 1200);
  // Seed again — nothing should change
  const {changed} = seedDefaultHrs(first, CABINET_TYPES, 50, 300, 1200);
  expect("changed=false on re-seed of complete data", changed, false);
}

console.log("\n── 17. priceCabinet uses seeded hours correctly ──");
{
  const {merged} = seedDefaultHrs({}, CABINET_TYPES, 50, 300, 1200);
  const rules = { default_hrs: merged, rate_assembly: 50, rate_cutting: 55, rate_drafting: 45, rate_edging: 40, rate_packing: 35 };
  const rates = { carcass: 52, front: 85, door_hardware_rate: 12 };
  const r = priceCabinet({type:"Base",config:"2 Door",width:600,height:720,depth:560,doors:2,drawers:0}, rules, rates);
  // labourCost = 0.079×45 + 0.057×55 + 0.057×40 + 0.143×50 + 0.029×35
  //            = 3.555 + 3.135 + 2.28 + 7.15 + 1.015 = 17.135
  approx("labourCost from seeded Base|2 Door|600 hours", r.labourCost, 17.135, 0.005);
  expect("reviewRequired=false with all rates set", r.reviewRequired, false);
}

// ─── Summary ────────────────────────────────────────────────────────────────
console.log(`\n${"─".repeat(50)}`);
console.log(`Results: ${pass} passed, ${fail} failed`);
if(fail>0){ console.error("SOME TESTS FAILED"); process.exit(1); }
else { console.log("All tests passed."); }
