/* Habits — Vitamins & minerals and nutrition targets. Self-contained like strength.js: it has no store
   of its own. Daily totals are built from two existing logs, each counted once:
   - food diary entries (HT.data.nutrition.entries[].n), and
   - supplements marked "Taken" in the Health supplement routine (HT.data.health.intake). When a dose is
     marked taken, the routine's supplement facts are copied onto that day, so editing a label later
     doesn't rewrite history unless the user asks for it.
   Water comes from the Health "Water" metric, body weight from the Weight log.

   Reference values are the Dietary Reference Intakes (US National Academies, also used by Health Canada),
   picked by age group and sex. Height and weight only affect calories (EER) and protein (g per kg).
   Custom targets and limits only change comparisons — never the recorded intake.

   Hooks used elsewhere: HT.micros.normalize (nutrition storage), normFacts / normSnap / snapFor /
   facts form helpers (Health routines), diaryExtras (Nutrition diary), healthCard (Health overview). */
(function () {
  'use strict';
  const HT = window.HT;
  const esc = HT.esc, icon = HT.icon;
  const N = HT.nutrition;
  const M = (HT.micros = {});
  const ND = () => HT.data.nutrition;
  const HD = () => HT.data.health;

  const num = (v) => { const n = typeof v === 'string' ? Number(v.replace(',', '.').trim()) : Number(v); return v !== '' && v != null && Number.isFinite(n) ? n : null; };
  const pos = (v) => { const n = num(v); return n != null && n > 0 ? n : null; };
  const nonneg = (v) => { const n = num(v); return n != null && n >= 0 ? n : null; };
  const r4 = (n) => Math.round(n * 1e4) / 1e4;
  const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
  const arr = (v) => (Array.isArray(v) ? v : []);
  const plural = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');
  const longDate = (key) => HT.parseKey(key).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  const shortDate = (key) => HT.parseKey(key).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const pctText = (p) => (p >= 1000 ? Math.round(p).toLocaleString() : p >= 100 ? Math.round(p) : Math.round(p * 10) / 10) + '%';

  /* ---------- nutrient lists ---------- */

  const VITAMINS = ['vita', 'vitc', 'vitd', 'vite', 'vitk', 'b1', 'b2', 'b3', 'b5', 'b6', 'b7', 'b9', 'b12', 'choline'];
  const MINERALS = ['calcium', 'magnesium', 'zinc', 'iron', 'potassium', 'sodium', 'phosphorus', 'selenium', 'copper', 'manganese', 'iodine', 'chromium', 'molybdenum', 'chloride'];
  M.VITAMINS = VITAMINS;
  M.MINERALS = MINERALS;
  M.KEYS = VITAMINS.concat(MINERALS);
  const FACT_KEYS = ['vita', 'vitc', 'vitd', 'vite', 'vitk', 'vitk1', 'vitk2', 'b1', 'b2', 'b3', 'b5', 'b6', 'b7', 'b9', 'b12', 'choline'].concat(MINERALS);
  M.FACT_KEYS = FACT_KEYS;
  const TRACKED = new Set(FACT_KEYS);
  M.tracks = (k) => TRACKED.has(k);
  const nutr = (k) => N.NUTRIENTS.find((x) => x[0] === k);
  const label = (k) => (nutr(k) || [k, k])[1];
  const unitOf = (k) => (nutr(k) || [])[2];
  const fmt = (k, v) => N.fmtN(k, v);
  const UNIT_NOTE = { vita: 'µg RAE', b9: 'µg DFE', b3: 'mg NE', vite: 'mg α-tocopherol' };
  M.label = label;

  /* Vitamin K: the total if listed, otherwise K1 + K2 when either is listed (never both, so nothing is counted twice). */
  const val = (n, k) => {
    if (!n) return null;
    if (k === 'vitk') return n.vitk != null ? n.vitk : n.vitk1 != null || n.vitk2 != null ? r4((n.vitk1 || 0) + (n.vitk2 || 0)) : null;
    return n[k] != null ? n[k] : null;
  };
  M.val = val;

  /* ---------- reference values (Dietary Reference Intakes) ----------
     [type, males by age group, females by age group, UL by age group (same for both sexes) or null, UL basis]
     Age groups: 14–18, 19–30, 31–50, 51–70, 71+ years. Units match N.NUTRIENTS (copper and manganese in mg).
     UL basis: 'total' = food + supplements; 'supp' = supplements only (food doesn't count);
     'preformed' = preformed vitamin A from supplements; 'cdrr' = sodium Chronic Disease Risk Reduction intake. */
  const AGE_GROUPS = ['14–18', '19–30', '31–50', '51–70', '71+'];
  const x5 = (v) => [v, v, v, v, v];
  const DRI = {
    vita: ['RDA', x5(900), x5(700), [2800, 3000, 3000, 3000, 3000], 'preformed'],
    vitc: ['RDA', [75, 90, 90, 90, 90], [65, 75, 75, 75, 75], [1800, 2000, 2000, 2000, 2000], 'total'],
    vitd: ['RDA', [15, 15, 15, 15, 20], [15, 15, 15, 15, 20], x5(100), 'total'],
    vite: ['RDA', x5(15), x5(15), [800, 1000, 1000, 1000, 1000], 'supp'],
    vitk: ['AI', [75, 120, 120, 120, 120], [75, 90, 90, 90, 90], null],
    b1: ['RDA', x5(1.2), [1.0, 1.1, 1.1, 1.1, 1.1], null],
    b2: ['RDA', x5(1.3), [1.0, 1.1, 1.1, 1.1, 1.1], null],
    b3: ['RDA', x5(16), x5(14), [30, 35, 35, 35, 35], 'supp'],
    b5: ['AI', x5(5), x5(5), null],
    b6: ['RDA', [1.3, 1.3, 1.3, 1.7, 1.7], [1.2, 1.3, 1.3, 1.5, 1.5], [80, 100, 100, 100, 100], 'total'],
    b7: ['AI', [25, 30, 30, 30, 30], [25, 30, 30, 30, 30], null],
    b9: ['RDA', x5(400), x5(400), [800, 1000, 1000, 1000, 1000], 'supp'],
    b12: ['RDA', x5(2.4), x5(2.4), null],
    choline: ['AI', x5(550), [400, 425, 425, 425, 425], [3000, 3500, 3500, 3500, 3500], 'total'],
    calcium: ['RDA', [1300, 1000, 1000, 1000, 1200], [1300, 1000, 1000, 1200, 1200], [3000, 2500, 2500, 2000, 2000], 'total'],
    magnesium: ['RDA', [410, 400, 420, 420, 420], [360, 310, 320, 320, 320], x5(350), 'supp'],
    zinc: ['RDA', x5(11), [9, 8, 8, 8, 8], [34, 40, 40, 40, 40], 'total'],
    iron: ['RDA', [11, 8, 8, 8, 8], [15, 18, 18, 8, 8], x5(45), 'total'],
    potassium: ['AI', [3000, 3400, 3400, 3400, 3400], [2300, 2600, 2600, 2600, 2600], null],
    sodium: ['AI', x5(1500), x5(1500), x5(2300), 'cdrr'],
    phosphorus: ['RDA', [1250, 700, 700, 700, 700], [1250, 700, 700, 700, 700], [4000, 4000, 4000, 4000, 3000], 'total'],
    selenium: ['RDA', x5(55), x5(55), x5(400), 'total'],
    copper: ['RDA', [0.89, 0.9, 0.9, 0.9, 0.9], [0.89, 0.9, 0.9, 0.9, 0.9], [8, 10, 10, 10, 10], 'total'],
    manganese: ['AI', [2.2, 2.3, 2.3, 2.3, 2.3], [1.6, 1.8, 1.8, 1.8, 1.8], [9, 11, 11, 11, 11], 'total'],
    iodine: ['RDA', x5(150), x5(150), [900, 1100, 1100, 1100, 1100], 'total'],
    chromium: ['AI', [35, 35, 35, 30, 30], [24, 25, 25, 20, 20], null],
    molybdenum: ['RDA', [43, 45, 45, 45, 45], [43, 45, 45, 45, 45], [1700, 2000, 2000, 2000, 2000], 'total'],
    chloride: ['AI', [2300, 2300, 2300, 2000, 1800], [2300, 2300, 2300, 2000, 1800], x5(3600), 'total'],
    fibre: ['AI', [38, 38, 38, 30, 30], [26, 25, 25, 21, 21], null],
  };
  M.DRI = DRI;
  const SRC = 'Dietary Reference Intakes, US National Academies (also used by Health Canada)';
  const srcFor = (k) => (k === 'sodium' || k === 'potassium' ? 'Dietary Reference Intakes for Sodium and Potassium, National Academies (2019)'
    : k === 'calcium' || k === 'vitd' ? 'Dietary Reference Intakes for Calcium and Vitamin D, National Academies (2011)' : SRC);
  const UL_NOTE = {
    vita: 'Applies to preformed vitamin A (retinol and retinyl esters). Only supplements are counted, because food labels don\'t separate preformed vitamin A from beta-carotene.',
    vite: 'Applies to vitamin E from supplements and fortified foods, not food that naturally contains it. Only supplements are counted here.',
    b3: 'Applies to niacin from supplements and fortified foods. Only supplements are counted here.',
    b9: 'Applies to folic acid from supplements and fortified foods. Only supplements are counted here; amounts entered in µg DFE are converted assuming folic acid (÷ 1.7).',
    magnesium: 'Applies to magnesium from supplements and medicines only — magnesium in food doesn\'t count toward it.',
    sodium: 'Chronic Disease Risk Reduction intake (CDRR). Above it, lowering intake is advised for long-term health. It isn\'t a toxicity limit.',
  };
  const ulNote = (k, t) => (t.customU ? 'Your own limit, compared with ' + (t.ulBasis === 'supp' || t.ulBasis === 'preformed' ? 'supplement intake only.' : 'food and supplements combined.') : UL_NOTE[k] || 'Applies to food and supplements combined.');
  const TYPE_INFO = [
    ['RDA', 'Recommended Dietary Allowance', 'Meets the needs of nearly all (97–98%) healthy people in an age and sex group.'],
    ['AI', 'Adequate Intake', 'Used when there isn\'t enough evidence for an RDA. Intake at or above it is likely adequate.'],
    ['UL', 'Tolerable Upper Intake Level', 'The most that is unlikely to cause harm. It is a ceiling, not a goal.'],
    ['CDRR', 'Chronic Disease Risk Reduction intake', 'For sodium: above it, cutting back is expected to lower long-term risk.'],
    ['EER', 'Estimated Energy Requirement', 'Calories to maintain weight, from age, sex, height, weight and activity.'],
    ['AMDR', 'Acceptable Macronutrient Distribution Range', 'The share of calories from carbohydrate or fat linked to lower long-term risk.'],
    ['Guideline', 'Sports-nutrition guideline', 'Not a DRI. Used for protein when your goal is muscle gain or fat loss.'],
    ['Custom', 'Your own value', 'Replaces the recommendation in comparisons. It never changes what you logged.'],
  ];
  M.TYPE_INFO = TYPE_INFO;

  /* ---------- profile ---------- */

  const ACT = [['sedentary', 'Sedentary', 'Mostly sitting; little walking or exercise'], ['low', 'Low active', 'About 30–60 minutes of moderate activity a day'],
    ['active', 'Active', 'At least 60 minutes of moderate activity a day'], ['very', 'Very active', 'Hard training most days, or a physical job plus exercise']];
  const GOALS = [['maintain', 'Maintenance'], ['gain', 'Muscle gain'], ['loss', 'Fat loss']];
  M.ACT = ACT;
  M.GOALS = GOALS;
  const SEX = [['', 'Not set'], ['m', 'Male'], ['f', 'Female']];
  M.normProfile = (raw) => {
    const p = obj(raw), age = num(p.age), h = num(p.heightCm);
    return {
      sex: p.sex === 'm' || p.sex === 'f' ? p.sex : '',
      age: age != null && age >= 1 && age <= 120 ? Math.round(age) : null,
      birth: HT.isDateKey(p.birth) && p.birth < HT.today() ? p.birth : '',
      heightCm: h != null && h >= 50 && h <= 272 ? Math.round(h * 10) / 10 : null,
      hUnit: p.hUnit === 'cm' ? 'cm' : 'ftin',
      activity: ACT.some((a) => a[0] === p.activity) ? p.activity : '',
      goal: GOALS.some((g) => g[0] === p.goal) ? p.goal : 'maintain',
    };
  };
  /* Called from HT.normalizeNutrition: adds the profile, custom limits and the custom/recommended switch. */
  M.normalize = (out, raw) => {
    const r = obj(raw), l = obj(r.limits), limits = {};
    M.KEYS.forEach((k) => { const v = pos(l[k]); if (v != null) limits[k] = v; });
    out.limits = limits;
    out.profile = M.normProfile(r.profile);
    out.useCustom = r.useCustom !== false;
    return out;
  };
  M.age = () => {
    const p = ND().profile;
    if (p.birth) {
      const b = HT.parseKey(p.birth), t = HT.parseKey(HT.today());
      let a = t.getFullYear() - b.getFullYear();
      if (t.getMonth() < b.getMonth() || (t.getMonth() === b.getMonth() && t.getDate() < b.getDate())) a--;
      return a;
    }
    return p.age;
  };
  /* Latest weigh-in from the Weight log. */
  M.weight = () => {
    const W = HT.weight, e = W && W.latest();
    return e && e.kg > 0 ? { kg: e.kg, date: e.date } : null;
  };
  const groupIdx = (age) => (age == null ? -1 : age < 14 ? -2 : age <= 18 ? 0 : age <= 30 ? 1 : age <= 50 ? 2 : age <= 70 ? 3 : 4);
  const fmtHeight = (cm, unit) => {
    if (cm == null) return 'Not set';
    if (unit === 'cm') return Math.round(cm) + ' cm';
    let inches = Math.round(cm / 2.54), ft = Math.floor(inches / 12);
    inches -= ft * 12;
    return ft + ' ft ' + inches + ' in';
  };
  M.fmtHeight = fmtHeight;

  /* IOM (2005) Estimated Energy Requirement. Ages 14–18 use the adolescent equations (+25 kcal for growth). */
  M.eer = (sex, age, kg, m, act) => {
    const i = ['sedentary', 'low', 'active', 'very'].indexOf(act);
    if (i < 0) return null;
    if (age <= 18) {
      if (sex === 'm') return 88.5 - 61.9 * age + [1, 1.13, 1.26, 1.42][i] * (26.7 * kg + 903 * m) + 25;
      return 135.3 - 30.8 * age + [1, 1.16, 1.31, 1.56][i] * (10 * kg + 934 * m) + 25;
    }
    if (sex === 'm') return 662 - 9.53 * age + [1, 1.11, 1.25, 1.48][i] * (15.91 * kg + 539.6 * m);
    return 354 - 6.91 * age + [1, 1.12, 1.27, 1.45][i] * (9.36 * kg + 726 * m);
  };

  /* Recommended values for the current profile. Each: { type, target, ul, ulType, ulBasis, cat, source, needs[] } */
  M.defaults = () => {
    const p = ND().profile, age = M.age(), gi = groupIdx(age), sex = p.sex;
    const who = (same) => (sex ? (sex === 'm' ? 'Males' : 'Females') : same ? 'Males and females' : '') + ' ' + (AGE_GROUPS[gi] || '') + ' y';
    const ageNeed = gi === -2 ? 'under14' : 'age';
    const out = {};
    Object.keys(DRI).forEach((k) => {
      const d = DRI[k];
      const o = { type: d[0], target: null, ul: null, ulType: d[3] ? (d[4] === 'cdrr' ? 'CDRR' : 'UL') : '', ulBasis: d[3] ? d[4] : null, cat: '', source: srcFor(k), needs: [] };
      if (gi < 0) { o.needs.push(ageNeed); out[k] = o; return; }
      const mv = d[1][gi], fv = d[2][gi];
      if (sex) o.target = sex === 'm' ? mv : fv;
      else if (mv === fv) o.target = mv;
      else o.needs.push('sex');
      if (d[3]) o.ul = d[3][gi];
      o.cat = who(mv === fv);
      out[k] = o;
    });
    const w = M.weight(), kg = w ? w.kg : null, hm = p.heightCm ? p.heightCm / 100 : null;
    const need = [];
    if (!sex) need.push('sex');
    if (gi < 0) need.push(ageNeed);
    if (!hm) need.push('height');
    if (!kg) need.push('weight');
    if (!p.activity) need.push('activity');
    const goalF = p.goal === 'loss' ? 0.85 : p.goal === 'gain' ? 1.1 : 1;
    const eer = need.length ? null : M.eer(sex, age, kg, hm, p.activity);
    const kcal = eer != null && eer > 0 ? Math.round((eer * goalF) / 10) * 10 : null;
    const act = (ACT.find((a) => a[0] === p.activity) || ['', ''])[1];
    out.kcal = {
      type: 'EER', target: kcal, ul: null, ulType: '', ulBasis: null, needs: need, cat: gi >= 0 && sex ? who(false) + (act ? ', ' + act.toLowerCase() : '') : '',
      source: 'Estimated Energy Requirement equations, Institute of Medicine (2005)' + (goalF < 1 ? '; 15% lower for fat loss' : goalF > 1 ? '; 10% higher for muscle gain' : '') + '. An estimate: if your weight changes in a way you don\'t want while eating this much, set your own target.',
    };
    const sport = p.goal === 'gain' || p.goal === 'loss';
    const perKg = sport ? 1.6 : gi === 0 ? 0.85 : 0.8;
    const pNeed = [];
    if (!kg) pNeed.push('weight');
    if (gi < 0) pNeed.push(ageNeed);
    out.protein = {
      type: sport ? 'Guideline' : 'RDA', target: !pNeed.length ? Math.round(kg * perKg) : null, perKg, ul: null, ulType: '', ulBasis: null, needs: pNeed, cat: gi >= 0 ? perKg + ' g per kg of body weight' : '',
      source: sport ? 'International Society of Sports Nutrition position stand (2017): 1.4–2.0 g/kg a day for people who train; 1.6 g/kg used' : 'Dietary Reference Intakes (National Academies): ' + perKg + ' g per kg of body weight for ages ' + (gi === 0 ? '14–18' : '19+'),
    };
    const fat = kcal ? Math.round((kcal * 0.3) / 9) : null;
    let carbs = null;
    if (kcal) {
      const left = (kcal - (out.protein.target || 0) * 4 - fat * 9) / 4;
      carbs = Math.round(Math.min((kcal * 0.65) / 4, Math.max((kcal * 0.45) / 4, 130, left)));
    }
    out.fat = { type: 'AMDR', target: fat, ul: null, ulType: '', ulBasis: null, needs: need.slice(), cat: kcal ? '30% of calories' : '', source: 'Acceptable Macronutrient Distribution Range: ' + (gi === 0 ? '25–35' : '20–35') + '% of calories (30% used)' };
    out.carbs = { type: 'AMDR', target: carbs, ul: null, ulType: '', ulBasis: null, needs: need.slice(), cat: kcal ? 'Calories left after protein and fat, kept within 45–65%' : '', source: 'Acceptable Macronutrient Distribution Range: 45–65% of calories; the RDA minimum is 130 g' };
    return out;
  };

  /* The value in effect: the user's custom value (if they chose to use custom values) or the recommendation. */
  M.target = (k, defs) => {
    const d = (defs || M.defaults())[k] || { type: '', target: null, ul: null, ulType: '', ulBasis: null, needs: [] };
    const on = ND().useCustom;
    const ct = on && ND().targets[k] != null ? ND().targets[k] : null;
    const cu = on && ND().limits[k] != null ? ND().limits[k] : null;
    return {
      k, def: d, customT: ct != null, customU: cu != null,
      target: ct != null ? ct : d.target, type: ct != null ? 'Custom' : d.type,
      ul: cu != null ? cu : d.ul, ulType: cu != null ? 'Custom limit' : d.ulType, ulBasis: d.ulBasis || (cu != null ? 'total' : null),
    };
  };

  /* ---------- supplement facts ---------- */

  const MASS = { 'µg': 0.001, mg: 1, g: 1000 };
  /* Units a supplement label may use for a nutrient. IU is offered only where the conversion is fixed by
     the nutrient's form (vitamin D; vitamin A and E with the form stated). */
  M.units = (k) => {
    if (k === 'vita') return [['rae_pre', 'µg RAE · retinol / retinyl (preformed)'], ['rae_bc', 'µg RAE · beta-carotene'], ['rae_mix', 'µg RAE · mixed or not stated'], ['iu_pre', 'IU · retinol / retinyl (preformed)'], ['iu_bc', 'IU · beta-carotene']];
    if (k === 'vite') return [['mg', 'mg α-tocopherol'], ['iu_nat', 'IU · natural (d-alpha)'], ['iu_syn', 'IU · synthetic (dl-alpha)']];
    if (k === 'vitd') return [['µg', 'µg'], ['iu', 'IU'], ['mg', 'mg']];
    if (k === 'b9') return [['dfe', 'µg DFE'], ['fa', 'µg folic acid']];
    const u = unitOf(k);
    return [u].concat(['µg', 'mg', 'g'].filter((x) => x !== u)).map((x) => [x, x]);
  };
  /* Converts a label amount to the stored unit. Returns { v: amount counted toward intake,
     ul: amount counted toward a supplement-based upper limit }, or null if the unit doesn't fit. */
  M.convert = (k, a, u) => {
    a = nonneg(a);
    if (a == null) return null;
    if (k === 'vita') {
      // IOM: 1 IU retinol = 0.3 µg RAE; 1 IU supplemental beta-carotene = 0.15 µg RAE. Beta-carotene isn't preformed.
      const f = { rae_pre: [1, 1], rae_bc: [1, 0], rae_mix: [1, 1], iu_pre: [0.3, 0.3], iu_bc: [0.15, 0] }[u];
      return f ? { v: r4(a * f[0]), ul: r4(a * f[1]) } : null;
    }
    if (k === 'vite') {
      // Intake as 2R-α-tocopherol: natural 0.67 mg/IU, synthetic 0.45 mg/IU. For the UL every form counts:
      // synthetic all-rac α-tocopherol is 0.9 mg/IU.
      const f = { mg: [1, 1], iu_nat: [0.67, 0.67], iu_syn: [0.45, 0.9] }[u];
      return f ? { v: r4(a * f[0]), ul: r4(a * f[1]) } : null;
    }
    if (k === 'vitd' && u === 'iu') return { v: r4(a / 40), ul: r4(a / 40) }; // 1 µg = 40 IU
    if (k === 'b9') {
      if (u === 'dfe') return { v: r4(a), ul: r4(a / 1.7) };
      if (u === 'fa') return { v: r4(a * 1.7), ul: r4(a) }; // 1 µg folic acid (with food) = 1.7 µg DFE
      return null;
    }
    const cu = unitOf(k);
    if (!MASS[u] || !MASS[cu]) return null;
    const v = r4((a * MASS[u]) / MASS[cu]);
    return { v, ul: v };
  };
  M.normFacts = (raw) => {
    if (!raw || typeof raw !== 'object') return null;
    const f = obj(raw), seen = new Set(), rows = [];
    arr(f.rows).forEach((r) => {
      r = obj(r);
      if (!FACT_KEYS.includes(r.k) || seen.has(r.k) || rows.length >= 40) return;
      const a = nonneg(r.a);
      if (a == null) return;
      const units = M.units(r.k).map((x) => x[0]);
      seen.add(r.k);
      rows.push({ k: r.k, a, u: units.includes(r.u) ? r.u : units[0] });
    });
    if (!rows.length) return null;
    const mult = pos(f.mult);
    return { rows, mult: mult != null && mult <= 50 ? mult : 1 };
  };
  /* Amounts per dose (label amount × servings taken each time). */
  M.factsN = (facts) => {
    if (!facts || !facts.rows || !facts.rows.length) return null;
    const n = {}, ul = {};
    facts.rows.forEach((r) => { const c = M.convert(r.k, r.a, r.u); if (c) { n[r.k] = r4(c.v * facts.mult); ul[r.k] = r4(c.ul * facts.mult); } });
    return Object.keys(n).length ? { n, ul } : null;
  };
  M.snapFor = (x) => { const f = M.factsN(x.facts); return f ? { n: f.n, ul: f.ul } : {}; };
  M.normSnap = (e) => {
    const en = obj(e.n), eu = obj(e.ul), n = {}, ul = {};
    FACT_KEYS.forEach((k) => { const v = nonneg(en[k]); if (v != null) { n[k] = r4(v); const w = nonneg(eu[k]); ul[k] = r4(w != null ? w : v); } });
    return Object.keys(n).length ? { n, ul } : {};
  };
  /* After editing a label: copy the new amounts onto days already logged as taken (only when asked). */
  M.applyFactsToPast = (x) => {
    if (!x) return 0;
    const snap = M.snapFor(x);
    let count = 0;
    Object.keys(HD().intake).forEach((k) => {
      const e = HD().intake[k][x.id];
      if (!e || e.s !== 'taken') return;
      delete e.n; delete e.ul;
      Object.assign(e, snap);
      count++;
    });
    HT.save();
    return count;
  };
  M.factsLine = (x) => {
    const f = M.factsN(x.facts);
    if (!f) return '';
    const keys = Object.keys(f.n);
    return keys.slice(0, 4).map((k) => label(k).replace(/ \(.*\)$/, '') + ' ' + fmt(k, f.n[k])).join(' · ') + (keys.length > 4 ? ' · +' + (keys.length - 4) + ' more' : '');
  };

  /* Supplement-facts editor inside the Health routine form. `fx` is an editable draft. */
  M.factsDraft = (facts) => ({ rows: facts ? facts.rows.map((r) => ({ k: r.k, a: String(r.a), u: r.u })) : [], mult: facts ? String(facts.mult) : '1', open: !!facts, apply: false, logged: 0 });
  M.factsForm = (fx, logged) => {
    fx.logged = logged || 0;
    return '<details class="nmore" id="rt-fx"' + (fx.open || fx.rows.length ? ' open' : '') + '><summary>Supplement facts <em>optional</em></summary>' +
      '<p class="hint">Copy the amounts per serving from the label. Each day you mark it Taken, they\'re added to your vitamin and mineral totals.</p>' +
      '<div id="rt-fx-rows">' + fx.rows.map((r, i) => '<div class="fx-row" data-i="' + i + '"><span class="fx-name">' + esc(label(r.k)) + '</span>' +
        '<input type="number" inputmode="decimal" min="0" step="any" data-fx-a value="' + esc(r.a) + '" aria-label="' + esc(label(r.k)) + ' amount">' +
        '<select data-fx-u aria-label="' + esc(label(r.k)) + ' unit">' + M.units(r.k).map((u) => '<option value="' + esc(u[0]) + '"' + (u[0] === r.u ? ' selected' : '') + '>' + esc(u[1]) + '</option>').join('') + '</select>' +
        '<button type="button" class="icon-btn" data-fx-rm aria-label="Remove ' + esc(label(r.k)) + '">' + icon.x + '</button></div>').join('') + '</div>' +
      '<select id="rt-fx-add" class="fx-add" aria-label="Add a vitamin or mineral"><option value="">+ Add a vitamin or mineral…</option>' +
        FACT_KEYS.filter((k) => !fx.rows.some((r) => r.k === k)).map((k) => '<option value="' + k + '">' + esc(label(k)) + '</option>').join('') + '</select>' +
      '<label class="field gap-top"><span class="label">Servings each time you take it</span><input id="rt-fx-mult" type="number" inputmode="decimal" min="0.1" max="50" step="any" value="' + esc(fx.mult) + '"></label>' +
      '<p class="hint">IU is only offered where the conversion is fixed: vitamin D, and vitamins A and E once you choose the form shown on the label.</p>' +
      (fx.logged ? '<div class="switch-row"><div><div class="sw-title">Also update past days</div><div class="hint">Apply these amounts to the ' + plural(fx.logged, 'day') + ' already logged as taken. Off: past days keep the amounts they were logged with.</div></div>' +
        '<label class="switch"><input type="checkbox" id="rt-fx-apply"' + (fx.apply ? ' checked' : '') + '><span></span></label></div>' : '') +
      '</details>';
  };
  M.bindFacts = (wrap, fx) => {
    const redraw = () => { const box = HT.$('#rt-fx', wrap); if (box) { fx.open = true; box.outerHTML = M.factsForm(fx, fx.logged); } };
    wrap.addEventListener('toggle', (e) => { if (e.target.id === 'rt-fx') fx.open = e.target.open; }, true);
    wrap.addEventListener('input', (e) => {
      const row = e.target.closest('.fx-row');
      if (row && e.target.matches('[data-fx-a]')) fx.rows[+row.dataset.i].a = e.target.value;
      if (e.target.id === 'rt-fx-mult') fx.mult = e.target.value;
    });
    wrap.addEventListener('change', (e) => {
      const row = e.target.closest('.fx-row');
      if (row && e.target.matches('[data-fx-u]')) fx.rows[+row.dataset.i].u = e.target.value;
      if (e.target.id === 'rt-fx-apply') fx.apply = e.target.checked;
      if (e.target.id === 'rt-fx-add' && e.target.value) {
        const k = e.target.value;
        fx.rows.push({ k, a: '', u: M.units(k)[0][0] });
        redraw();
        const inp = HT.$('#rt-fx .fx-row:last-child [data-fx-a]', wrap);
        if (inp) inp.focus();
      }
    });
    wrap.addEventListener('click', (e) => {
      const b = e.target.closest('[data-fx-rm]');
      if (!b) return;
      fx.rows.splice(+b.closest('.fx-row').dataset.i, 1);
      redraw();
    });
  };
  /* Returns { facts } (null when empty) or { error }. */
  M.readFacts = (fx) => {
    const rows = [];
    for (const r of fx.rows) {
      if (String(r.a).trim() === '') return { error: 'Enter an amount for ' + label(r.k) + ', or remove it' };
      const a = nonneg(r.a);
      if (a == null) return { error: label(r.k) + ' must be a number of 0 or more' };
      if (!M.convert(r.k, a, r.u)) return { error: 'Pick a unit for ' + label(r.k) };
      rows.push({ k: r.k, a, u: r.u });
    }
    const mult = String(fx.mult).trim() === '' ? 1 : pos(fx.mult);
    if (mult == null || mult < 0.1 || mult > 50) return { error: 'Servings each time must be between 0.1 and 50' };
    return { facts: rows.length ? { rows, mult } : null };
  };

  /* ---------- daily totals ---------- */

  const routine = (id) => HD().routines.find((r) => r.id === id);
  /* date → { entries: [diary entries], supps: [{ id, name, n, ul }] } for days that have anything logged. */
  M.index = (from, to) => {
    const by = {};
    const day = (k) => (by[k] = by[k] || { entries: [], supps: [] });
    ND().entries.forEach((e) => { if (e.date >= from && e.date <= to) day(e.date).entries.push(e); });
    Object.keys(HD().intake).forEach((k) => {
      if (k < from || k > to) return;
      const d = HD().intake[k];
      Object.keys(d).forEach((id) => {
        const e = d[id];
        if (e.s !== 'taken') return;
        const rt = routine(id);
        day(k).supps.push({ id, name: rt ? rt.name : 'Supplement', n: e.n || null, ul: e.ul || null });
      });
    });
    return by;
  };
  const DAY_KEYS = M.KEYS.concat(['fibre']);
  /* Per nutrient: total (null = no source lists it), food and supplement parts, and every source.
     Foods that don't list a nutrient are counted as unknown, never as zero. A supplement with facts
     entered contains only what its label lists. */
  M.day = (key, bucket) => {
    const b = bucket || M.index(key, key)[key] || { entries: [], supps: [] };
    const out = { date: key, logged: b.entries.length + b.supps.length > 0, foods: b.entries.length, supps: b.supps.length, n: {} };
    DAY_KEYS.forEach((k) => {
      let food = 0, supp = 0, suppUL = 0, fk = 0, fu = 0, sk = 0, sn = 0;
      const src = [];
      b.entries.forEach((e) => {
        const v = val(e.n, k);
        if (v == null) { fu++; return; }
        fk++; food += v;
        if (v > 0) src.push({ kind: 'food', id: e.id, name: e.name, meal: e.meal, v });
      });
      b.supps.forEach((s) => {
        if (!s.n) { sn++; return; }
        const v = val(s.n, k);
        if (v == null) return;
        sk++; supp += v;
        suppUL += s.ul && s.ul[k] != null ? s.ul[k] : v;
        if (v > 0) src.push({ kind: 'supp', id: s.id, name: s.name, v });
      });
      out.n[k] = {
        total: fk + sk ? r4(food + supp) : null, food: fk ? r4(food) : null, supp: r4(supp), suppUL: r4(suppUL),
        foodKnown: fk, foodUnknown: fu, suppKnown: sk, suppNoFacts: sn, src: src.sort((a, c) => c.v - a.v),
      };
    });
    return out;
  };
  /* Logged days in a range (days with food or a supplement taken), oldest first. */
  M.range = (from, to) => {
    const by = M.index(from, to);
    return Object.keys(by).sort().map((k) => M.day(k, by[k]));
  };

  /* 'unknown' | 'over' | 'below' | 'within' | 'notarget' */
  M.status = (x, t) => {
    if (!x || x.total == null) return 'unknown';
    const amt = t.ulBasis === 'supp' || t.ulBasis === 'preformed' ? x.suppUL : x.total;
    if (t.ul != null && amt > t.ul) return 'over';
    if (t.target == null) return 'notarget';
    return x.total < t.target ? 'below' : 'within';
  };
  const ulShort = (t) => (t.ulType === 'CDRR' ? 'CDRR' : t.ulType === 'Custom limit' ? 'your limit' : 'upper limit');
  const limitPhrase = (k, t) => (t.ulType === 'Custom limit' ? 'your ' + fmt(k, t.ul) + ' limit' : 'the ' + fmt(k, t.ul) + ' ' + ulShort(t));
  const STATUS = {
    unknown: ['No data', 's-unknown'], below: ['Below target', 's-below'], within: ['Target met', 's-within'], notarget: ['No target', 's-unknown'],
  };
  const statusTag = (s, t) => (s === 'over' ? ['Above ' + ulShort(t), 's-over'] : STATUS[s]);

  /* ---------- alerts ---------- */

  /* Informational alerts for a day: limits passed, supplements that push intake over, overlapping
     supplements, and nutrients that are often low or often over in the 14 days up to that day. */
  M.alerts = (key, defs) => {
    defs = defs || M.defaults();
    const day = M.day(key), out = [];
    M.KEYS.forEach((k) => {
      const t = M.target(k, defs), x = day.n[k];
      if (t.ul == null || x.total == null) return;
      if (t.ulBasis === 'supp' || t.ulBasis === 'preformed') {
        if (x.suppUL > t.ul) out.push({ lvl: 'over', k, text: label(k) + ' from supplements is ' + fmt(k, x.suppUL) + ', above ' + limitPhrase(k, t) + ' for supplemental intake.' });
      } else if (x.total > t.ul) {
        const foodOnly = (x.food || 0) > t.ul;
        out.push({ lvl: 'over', k, text: foodOnly || !x.supp
          ? label(k) + ' totals ' + fmt(k, x.total) + ', above ' + limitPhrase(k, t) + '.'
          : 'Supplements push ' + label(k) + ' above ' + limitPhrase(k, t) + ': ' + fmt(k, x.food || 0) + ' from food + ' + fmt(k, x.supp) + ' from supplements = ' + fmt(k, x.total) + '.' });
      }
    });
    // Two or more active supplements with the same nutrient.
    const active = HD().routines.filter((r) => r.status === 'active' && r.facts);
    const seen = {};
    active.forEach((r) => { const f = M.factsN(r.facts); if (f) Object.keys(f.n).forEach((k) => { const kk = k === 'vitk1' || k === 'vitk2' ? 'vitk' : k; (seen[kk] = seen[kk] || new Set()).add(r.name); }); });
    Object.keys(seen).forEach((k) => {
      const names = Array.from(seen[k]);
      if (names.length > 1) out.push({ lvl: 'overlap', k, text: label(k) + ' is in ' + names.length + ' supplements in your routine: ' + names.join(', ') + '.' });
    });
    // Patterns over the last 14 days.
    const days = M.range(HT.addDays(key, -13), key);
    M.KEYS.forEach((k) => {
      const t = M.target(k, defs);
      const known = days.filter((d) => d.n[k].total != null);
      if (known.length < 5) return;
      const st = known.map((d) => M.status(d.n[k], t));
      const below = st.filter((s) => s === 'below').length, over = st.filter((s) => s === 'over').length;
      if (t.target != null && below / known.length >= 0.7) out.push({ lvl: 'low', k, text: label(k) + ' was below your target on ' + below + ' of the last ' + plural(known.length, 'logged day') + ' that list it.' });
      if (over >= 3) out.push({ lvl: 'over', k, text: label(k) + ' was above ' + (t.ulType === 'Custom limit' ? 'your limit' : 'the ' + ulShort(t)) + ' on ' + over + ' of the last ' + plural(known.length, 'logged day') + '.' });
    });
    return out;
  };

  /* ---------- shared UI ---------- */

  M.vs = { mode: 'day', range: '30', from: '', to: '', agg: 'day', hk: 'magnesium', open: {}, sel: null };
  const NEED_TEXT = { sex: 'sex', age: 'age', under14: 'age 14 or older', height: 'height', weight: 'a weigh-in', activity: 'activity level' };
  const needsText = (needs) => needs.map((n) => NEED_TEXT[n] || n).join(', ');
  const barW = (x, t) => (x && x.total != null && t.target ? Math.min(100, (x.total / t.target) * 100) : 0);
  const amountLine = (k, x, t) => (x.total == null ? '<span class="muted">Unknown</span>' : esc(fmt(k, x.total))) + (t.target != null ? ' <small>/ ' + esc(fmt(k, t.target)) + '</small>' : '');
  const sheet = (o) => HT.openSheet({
    title: o.title, kind: 'sheet tall', html: o.html,
    footer: '<button type="button" class="btn" data-close>Cancel</button><button type="button" class="btn btn-primary" data-save>' + (o.saveLabel || 'Save') + '</button>',
    onMount: (wrap, close) => {
      if (o.onMount) o.onMount(wrap);
      wrap.addEventListener('click', (e) => { if (e.target.closest('[data-save]') && o.onSave(wrap) !== false) { HT.save(); close(); HT.render(); } });
    },
  });

  /* ---------- profile sheet ---------- */

  M.openProfile = () => {
    const p = ND().profile, w = M.weight();
    const opt = (v, l, cur) => '<option value="' + esc(v) + '"' + (String(v) === String(cur) ? ' selected' : '') + '>' + esc(l) + '</option>';
    const totalIn = p.heightCm != null ? Math.round(p.heightCm / 2.54) : null;
    const ft = totalIn != null ? Math.floor(totalIn / 12) : '', inch = totalIn != null ? totalIn - Math.floor(totalIn / 12) * 12 : '';
    const html =
      '<label class="field"><span class="label">Sex</span><select id="mp-sex">' + SEX.map((s) => opt(s[0], s[1], p.sex)).join('') + '</select></label>' +
      '<p class="hint gap-bottom">Some reference values differ by sex, so they stay blank until this is set. Pregnancy and breastfeeding values aren\'t included.</p>' +
      '<div class="row2"><label class="field"><span class="label">Age</span><input id="mp-age" type="number" inputmode="numeric" min="1" max="120" value="' + (p.age != null ? p.age : '') + '"></label>' +
      '<label class="field"><span class="label">Birth date <em>optional</em></span><input id="mp-birth" type="date" max="' + HT.today() + '" value="' + esc(p.birth) + '"></label></div>' +
      '<p class="hint gap-bottom">With a birth date your age (and age group) updates on its own.</p>' +
      '<label class="field"><span class="label">Height in</span><select id="mp-hu">' + opt('ftin', 'feet and inches', p.hUnit) + opt('cm', 'centimetres', p.hUnit) + '</select></label>' +
      '<div class="row2" id="mp-h-ftin"' + (p.hUnit === 'cm' ? ' hidden' : '') + '><label class="field"><span class="label">Feet</span><input id="mp-ft" type="number" inputmode="numeric" min="3" max="8" value="' + ft + '"></label>' +
      '<label class="field"><span class="label">Inches</span><input id="mp-in" type="number" inputmode="decimal" min="0" max="11.9" step="any" value="' + inch + '"></label></div>' +
      '<div id="mp-h-cm"' + (p.hUnit === 'cm' ? '' : ' hidden') + '><label class="field"><span class="label">Centimetres</span><input id="mp-cm" type="number" inputmode="decimal" min="90" max="250" step="any" value="' + (p.heightCm != null ? p.heightCm : '') + '"></label></div>' +
      '<div class="frow gap-bottom"><span>Body weight</span><b>' + (w ? esc(HT.weight.fmt(w.kg)) + ' <small>' + esc(shortDate(w.date)) + '</small>' : '<a class="linkish" href="#/weight" data-close>Log a weigh-in</a>') + '</b></div>' +
      '<p class="hint gap-bottom">Taken from your latest weigh-in in the Weight log. Used only for calories and protein.</p>' +
      '<label class="field"><span class="label">Activity level</span><select id="mp-act">' + opt('', 'Not set', p.activity) + ACT.map((a) => opt(a[0], a[1] + ' — ' + a[2], p.activity)).join('') + '</select></label>' +
      '<label class="field"><span class="label">Goal</span><select id="mp-goal">' + GOALS.map((g) => opt(g[0], g[1], p.goal)).join('') + '</select></label>' +
      '<p class="hint">Goal, height, weight and activity change the calorie and protein targets only. Vitamin and mineral targets come from your age group and sex.</p>';
    sheet({
      title: 'Your profile', html,
      onMount: (wrap) => wrap.addEventListener('change', (e) => {
        if (e.target.id !== 'mp-hu') return;
        const cm = e.target.value === 'cm';
        HT.$('#mp-h-ftin', wrap).hidden = cm; HT.$('#mp-h-cm', wrap).hidden = !cm;
      }),
      onSave: (wrap) => {
        const v = (id) => HT.$(id, wrap).value.trim();
        const next = { sex: v('#mp-sex'), hUnit: v('#mp-hu'), activity: v('#mp-act'), goal: v('#mp-goal'), birth: v('#mp-birth'), age: null, heightCm: null };
        if (v('#mp-age') !== '') {
          const a = num(v('#mp-age'));
          if (a == null || a < 1 || a > 120 || a !== Math.round(a)) { HT.toast('Age must be a whole number from 1 to 120'); return false; }
          next.age = a;
        }
        if (next.birth && (!HT.isDateKey(next.birth) || next.birth >= HT.today())) { HT.toast('Birth date must be in the past'); return false; }
        if (next.hUnit === 'cm') {
          if (v('#mp-cm') !== '') { const c = num(v('#mp-cm')); if (c == null || c < 90 || c > 250) { HT.toast('Height must be 90–250 cm'); return false; } next.heightCm = c; }
        } else if (v('#mp-ft') !== '' || v('#mp-in') !== '') {
          const f = num(v('#mp-ft') || '0'), i = num(v('#mp-in') || '0');
          if (f == null || i == null || f < 3 || f > 8 || i < 0 || i >= 12) { HT.toast('Enter feet (3–8) and inches (0–11)'); return false; }
          next.heightCm = Math.round((f * 12 + i) * 2.54 * 10) / 10;
        }
        ND().profile = M.normProfile(next);
        HT.toast('Profile saved');
      },
    });
  };

  /* ---------- Nutrition targets screen ---------- */

  const TGT_MACROS = ['kcal', 'protein', 'carbs', 'fat', 'fibre', 'sugar'];
  const typeTag = (type) => (type ? '<span class="mt-type">' + esc(type) + '</span>' : '');
  const recLine = (k, d) => {
    if (k === 'sugar') return 'No reference value — set your own limit if you want one.';
    if (d.target == null) return 'Recommended: needs your ' + esc(needsText(d.needs)) + '.';
    return 'Recommended: <b>' + esc(fmt(k, d.target)) + '</b>' + (UNIT_NOTE[k] ? ' <small>(' + UNIT_NOTE[k] + ')</small>' : '') + ' ' + typeTag(d.type) + (d.cat ? ' · ' + esc(d.cat) : '');
  };
  const ulLine = (k, d) => {
    if (TGT_MACROS.includes(k)) return '';
    if (d.ul == null) return '<div class="mt-l">Upper limit: ' + (d.needs.includes('age') || d.needs.includes('under14') ? 'needs your ' + esc(needsText(d.needs.filter((n) => n !== 'sex'))) : 'none established') + '</div>';
    return '<div class="mt-l">Upper limit: <b>' + esc(fmt(k, d.ul)) + '</b> ' + typeTag(d.ulType) + (d.ulBasis === 'supp' || d.ulBasis === 'preformed' ? ' · counts supplements only, not food' : '') + '</div>';
  };
  const mtHead = (k, defs) => {
    const d = defs[k] || { type: '', target: null, ul: null, needs: [] };
    const ct = ND().targets[k], cu = ND().limits[k];
    const custom = ct != null || cu != null;
    return '<div class="mt-n">' + esc(k === 'sugar' ? 'Sugars (limit)' : label(k)) + (custom ? ' <span class="tag">custom</span>' : '') + '</div>' +
      '<div class="mt-l">' + recLine(k, d) + '</div>' + ulLine(k, d) +
      (custom && !ND().useCustom ? '<div class="mt-l mt-off">Your values are saved but switched off.</div>' : '') +
      (d.source && k !== 'sugar' ? '<div class="mt-l mt-src">' + esc(d.source) + '</div>' : '');
  };
  const mtRow = (k, defs) => {
    const d = defs[k] || { target: null, ul: null };
    const ct = ND().targets[k], cu = ND().limits[k];
    const u = unitOf(k);
    const inT = '<label class="mt-f"><span>' + (k === 'sugar' ? 'Daily limit' : 'Your target') + ' (' + esc(u) + ')</span><input type="number" inputmode="decimal" min="0" step="any" data-mt="t" value="' + (ct != null ? ct : '') + '" placeholder="' + (d.target != null && k !== 'sugar' ? esc(String(d.target)) : 'None') + '" aria-label="' + esc(label(k)) + ' target"></label>';
    const inU = TGT_MACROS.includes(k) ? '' : '<label class="mt-f"><span>Your upper limit (' + esc(u) + ')</span><input type="number" inputmode="decimal" min="0" step="any" data-mt="u" value="' + (cu != null ? cu : '') + '" placeholder="' + (d.ul != null ? esc(String(d.ul)) : 'None') + '" aria-label="' + esc(label(k)) + ' upper limit"></label>';
    return '<div class="mt-row" data-k="' + k + '"><div class="mt-h">' + mtHead(k, defs) + '</div><div class="mt-in">' + inT + inU + '</div></div>';
  };

  M.targetsView = () => {
    const p = ND().profile, defs = M.defaults(), w = M.weight(), age = M.age();
    const anyCustom = Object.keys(ND().targets).some((k) => ND().targets[k] != null) || Object.keys(ND().limits).length > 0;
    const act = ACT.find((a) => a[0] === p.activity), goal = GOALS.find((g) => g[0] === p.goal);
    let html = N.head('targets') + '<div class="widget-h"><h2 class="section-title">Nutrition targets</h2><a class="linkish" href="#/nutrition/micros">Vitamins & minerals</a></div>' +
      '<section class="panel-card"><div class="card-head"><h3>Your profile</h3><button type="button" class="btn btn-sm" data-action="mi-profile">Edit</button></div>' +
      '<div class="frow"><span>Sex</span><b>' + (p.sex ? (p.sex === 'm' ? 'Male' : 'Female') : '<span class="muted">Not set</span>') + '</b></div>' +
      '<div class="frow"><span>Age</span><b>' + (age != null ? age + (p.birth ? ' <small>from birth date</small>' : '') : '<span class="muted">Not set</span>') + '</b></div>' +
      '<div class="frow"><span>Height</span><b>' + esc(fmtHeight(p.heightCm, p.hUnit)) + '</b></div>' +
      '<div class="frow"><span>Body weight</span><b>' + (w ? esc(HT.weight.fmt(w.kg)) + ' <small>' + esc(shortDate(w.date)) + '</small>' : '<a class="linkish" href="#/weight">Log a weigh-in</a>') + '</b></div>' +
      '<div class="frow"><span>Activity</span><b>' + (act ? esc(act[1]) : '<span class="muted">Not set</span>') + '</b></div>' +
      '<div class="frow"><span>Goal</span><b>' + esc(goal ? goal[1] : 'Maintenance') + '</b></div>' +
      (!p.sex || age == null ? '<p class="hint">Add your sex and age to see recommended amounts for your age group. Height, weight and activity are used for calories and protein only.</p>' : '') + '</section>' +
      '<section class="panel-card"><div class="switch-row"><div><div class="sw-title">Use my custom values</div><div class="hint">Off: every comparison uses the recommended values, but your custom numbers stay saved.</div></div>' +
      '<label class="switch"><input type="checkbox" id="mi-usecustom"' + (ND().useCustom ? ' checked' : '') + '><span></span></label></div>' +
      (anyCustom ? '<button type="button" class="btn wide gap-top" data-action="mi-restore">Restore recommended defaults</button>' : '') +
      '<p class="hint gap-top">Type a value to replace a recommendation; clear it to go back. Changing a target only changes the comparisons — what you logged stays exactly the same.</p></section>' +
      '<details class="panel-card nmore mt-legend"><summary>What RDA, AI, UL and the other labels mean</summary>' + TYPE_INFO.map((t) => '<div class="frow"><span><b>' + t[0] + '</b> · ' + esc(t[1]) + '<br><small class="muted">' + esc(t[2]) + '</small></span></div>').join('') + '</details>';
    const group = (title, keys) => '<h2 class="section-title">' + title + '</h2><section class="panel-card tight mt-list">' + keys.map((k) => mtRow(k, defs)).join('') + '</section>';
    html += group('Energy and macronutrients', TGT_MACROS) + group('Vitamins', VITAMINS) + group('Minerals and electrolytes', MINERALS);
    html += '<p class="hint center gap-top">Reference values: ' + esc(SRC) + '. General guidance for healthy people — not a substitute for advice from a doctor or dietitian.</p>';
    return html;
  };

  /* Saves one target / limit as soon as it's changed, then refreshes just that row's text. */
  document.addEventListener('change', (e) => {
    const inp = e.target;
    if (inp.id === 'mi-usecustom') { ND().useCustom = inp.checked; HT.save(); HT.toast(inp.checked ? 'Using your custom values' : 'Using recommended values'); HT.render(); return; }
    if (inp.dataset && inp.dataset.mt) {
      const row = inp.closest('.mt-row'), k = row.dataset.k, kind = inp.dataset.mt;
      const raw = inp.value.trim();
      const store = kind === 't' ? ND().targets : ND().limits;
      if (raw === '') {
        if (['kcal', 'protein', 'carbs', 'fat', 'fibre', 'sugar'].includes(k) && kind === 't') store[k] = null; else delete store[k];
      } else {
        const v = pos(raw);
        if (v == null || v > 1e6) { HT.toast('Enter a number above 0, or leave it blank'); inp.value = store[k] != null ? store[k] : ''; return; }
        const defs = M.defaults(), basis = (defs[k] || {}).ulBasis;
        // A supplement-only limit (magnesium, vitamin E…) can sit below the total-intake target, so only compare like with like.
        const comparable = basis !== 'supp' && basis !== 'preformed';
        const other = !comparable ? null : kind === 't' ? (ND().limits[k] != null ? ND().limits[k] : (defs[k] || {}).ul) : (ND().targets[k] != null ? ND().targets[k] : (defs[k] || {}).target);
        if (kind === 'u' && other != null && v < other) { HT.toast('The upper limit can\'t be below the target (' + fmt(k, other) + ')'); inp.value = store[k] != null ? store[k] : ''; return; }
        if (kind === 't' && k !== 'sugar' && other != null && v > other) { HT.toast('The target can\'t be above the upper limit (' + fmt(k, other) + ')'); inp.value = store[k] != null ? store[k] : ''; return; }
        store[k] = v;
      }
      HT.save();
      HT.$('.mt-h', row).innerHTML = mtHead(k, M.defaults());
      HT.toast('Saved');
    }
    if (inp.id === 'mi-hk') { M.vs.hk = inp.value; M.vs.sel = null; HT.render(); }
    if (inp.id === 'mi-from' || inp.id === 'mi-to') {
      M.vs[inp.id === 'mi-from' ? 'from' : 'to'] = HT.isDateKey(inp.value) ? inp.value : '';
      if (M.vs.from && M.vs.to && M.vs.from > M.vs.to) { const t = M.vs.from; M.vs.from = M.vs.to; M.vs.to = t; }
      M.vs.sel = null;
      HT.render();
    }
  });
  // Remember which nutrient rows are expanded across re-renders.
  document.addEventListener('toggle', (e) => { const d = e.target; if (d.classList && d.classList.contains('mi-row')) M.vs.open[d.dataset.k] = d.open; }, true);

  /* ---------- Vitamins & minerals: day view ---------- */

  const srcRow = (k, s, total) => '<li data-id="' + esc(s.id) + '"><button type="button" class="linkrow mi-src-b" data-action="' + (s.kind === 'food' ? 'n-edit' : 'h-rt-edit') + '">' +
    '<span class="mi-src-n">' + esc(s.name) + ' <span class="tag' + (s.kind === 'supp' ? ' supp' : '') + '">' + (s.kind === 'supp' ? 'Supplement' : 'Food') + '</span></span>' +
    '<span class="mi-src-v">' + esc(fmt(k, s.v)) + (total ? ' <small>' + pctText((s.v / total) * 100) + '</small>' : '') + '</span></button></li>';

  const nutrientRow = (k, x, t) => {
    const s = M.status(x, t), tag = statusTag(s, t), p = x.total != null && t.target ? (x.total / t.target) * 100 : null;
    const rem = x.total != null && t.target != null ? t.target - x.total : null;
    const ulAmt = t.ulBasis === 'supp' || t.ulBasis === 'preformed' ? x.suppUL : x.total;
    const sub = s === 'unknown' ? 'Not listed by anything you logged' : p != null ? pctText(p) + ' of target' + (rem > 0 ? ' · ' + fmt(k, rem) + ' to go' : '') : 'No target set';
    const body = '<div class="mi-body">' +
      '<div class="frow"><span>Consumed</span><b>' + (x.total == null ? 'Unknown' : esc(fmt(k, x.total))) + '</b></div>' +
      (x.total != null ? '<div class="frow sub"><span>From food</span><b>' + (x.food == null ? 'Unknown' : esc(fmt(k, x.food))) + '</b></div><div class="frow sub"><span>From supplements</span><b>' + esc(fmt(k, x.supp)) + '</b></div>' : '') +
      '<div class="frow"><span>Daily target</span><b>' + (t.target != null ? esc(fmt(k, t.target)) + ' ' + typeTag(t.type) : '<span class="muted">' + (t.def.needs && t.def.needs.length ? 'Needs your ' + esc(needsText(t.def.needs)) : 'None') + '</span>') + '</b></div>' +
      (p != null ? '<div class="frow"><span>Progress</span><b>' + pctText(p) + '</b></div>' : '') +
      (rem != null ? '<div class="frow"><span>Remaining</span><b>' + (rem > 0 ? esc(fmt(k, rem)) : 'Target reached') + '</b></div>' : '') +
      '<div class="frow"><span>Upper limit</span><b>' + (t.ul != null ? esc(fmt(k, t.ul)) + ' ' + typeTag(t.ulType) : '<span class="muted">None established</span>') + '</b></div>' +
      (t.ul != null && (t.ulBasis === 'supp' || t.ulBasis === 'preformed') && x.total != null ? '<div class="frow sub"><span>Counted toward it</span><b>' + esc(fmt(k, ulAmt)) + '</b></div>' : '') +
      '<div class="frow"><span>Status</span><b><span class="tag ' + tag[1] + '">' + esc(tag[0]) + '</span></b></div>' +
      (x.src.length ? '<h4 class="mi-h4">Where it came from</h4><ul class="mi-src">' + x.src.map((src) => srcRow(k, src, x.total)).join('') + '</ul>' : '') +
      (x.foodUnknown ? '<p class="hint">' + plural(x.foodUnknown, 'food') + ' you logged ' + (x.foodUnknown === 1 ? 'doesn\'t' : 'don\'t') + ' list ' + esc(label(k).toLowerCase()) + ' — counted as unknown, not zero' + (x.total != null ? ', so the real total may be higher' : '') + '.</p>' : '') +
      (x.suppNoFacts ? '<p class="hint">' + plural(x.suppNoFacts, 'supplement') + ' taken ' + (x.suppNoFacts === 1 ? 'has' : 'have') + ' no supplement facts entered. Add them in Health → Supplements.</p>' : '') +
      (t.ul != null ? '<p class="hint">' + esc(ulNote(k, t)) + '</p>' : '') +
      (UNIT_NOTE[k] ? '<p class="hint">Measured in ' + UNIT_NOTE[k] + '.</p>' : '') +
      (t.def.source && !t.customT ? '<p class="hint">' + esc(t.def.source) + (t.def.cat ? ' · ' + esc(t.def.cat) : '') + '</p>' : '') + '</div>';
    return '<details class="mi-row" data-k="' + k + '"' + (M.vs.open[k] ? ' open' : '') + '><summary><div class="mi-top"><span class="mi-name">' + esc(label(k)) + '</span><span class="mi-val">' + amountLine(k, x, t) + '</span></div>' +
      '<div class="mi-bar ' + tag[1] + '"><i style="width:' + barW(x, t) + '%"></i></div>' +
      '<div class="mi-sub"><span>' + esc(sub) + '</span><span class="tag ' + tag[1] + '">' + esc(tag[0]) + '</span></div></summary>' + body + '</details>';
  };

  const dayNav = (key) => {
    const today = HT.today();
    return '<div class="hday"><button type="button" class="icon-btn" data-action="n-day" data-d="-1" aria-label="Previous day">' + icon.back + '</button>' +
      '<div class="hday-l"><b>' + (key === today ? 'Today' : esc(longDate(key))) + '</b>' + (key === today ? '<span>' + esc(longDate(key)) + '</span>' : '<button type="button" class="linkish" data-action="n-day" data-d="0">Back to today</button>') + '</div>' +
      '<button type="button" class="icon-btn" data-action="n-day" data-d="1" aria-label="Next day"' + (key >= today ? ' disabled' : '') + '>' + icon.next + '</button></div>';
  };
  const counts = (day, defs) => {
    const c = { within: 0, below: 0, over: 0, unknown: 0, notarget: 0 };
    M.KEYS.forEach((k) => { c[M.status(day.n[k], M.target(k, defs))]++; });
    return c;
  };
  const setupCard = (defs) => {
    const p = ND().profile, age = M.age();
    if (p.sex && age != null && age >= 14) return '';
    const why = age != null && age < 14 ? 'The reference values in this app cover ages 14 and up.' : 'Add your sex and age so each nutrient is compared with the reference value for your age group.';
    return '<section class="panel-card mi-setup"><div><b>Finish your profile</b><p class="muted">' + why + '</p></div><button type="button" class="btn btn-sm" data-action="mi-profile">Set up</button></section>';
  };
  const DISCLAIMER = '<p class="hint">These alerts are information to discuss with a doctor, dietitian or pharmacist — not a diagnosis. The app never suggests changing a supplement dose.</p>';
  const alertsCard = (alerts) => {
    if (!alerts.length) return '';
    const cls = { over: 'a-over', low: 'a-low', overlap: 'a-overlap' };
    return '<section class="panel-card mi-alerts"><h3>Alerts</h3><ul>' + alerts.map((a) => '<li class="' + cls[a.lvl] + '">' + esc(a.text) + '</li>').join('') + '</ul>' + DISCLAIMER + '</section>';
  };

  function dayView() {
    const key = N.vs.day || HT.today();
    const defs = M.defaults(), day = M.day(key);
    let html = dayNav(key) + setupCard(defs);
    if (!day.logged) {
      return html + '<section class="empty"><h2>Nothing logged on this day</h2><p>Log food in the diary, or mark supplements as taken, and the vitamin and mineral totals appear here. Nothing is filled in or estimated.</p>' +
        '<div class="btn-row center"><button type="button" class="btn btn-primary" data-action="n-add">' + icon.plus + '<span>Add food</span></button><a class="btn" href="#/health/supplements">Supplements</a></div></section>';
    }
    const c = counts(day, defs);
    html += '<div class="st-grid st-g4 mi-counts">' +
      [['Target met', c.within, 's-within'], ['Below target', c.below, 's-below'], ['Above a limit', c.over, c.over ? 's-over' : ''], ['No data', c.unknown, '']].map((x) => '<div class="st-cell"><div class="st-l">' + x[0] + '</div><div class="st-v ' + x[2] + '">' + x[1] + '</div></div>').join('') + '</div>' +
      '<p class="hint mi-sum">From ' + (day.foods === 1 ? '1 food entry' : day.foods + ' food entries') + ' and ' + plural(day.supps, 'supplement') + ' taken. Tap a nutrient to see where it came from.</p>';
    html += alertsCard(M.alerts(key, defs));
    const list = (keys) => '<section class="panel-card tight mi-list">' + keys.map((k) => nutrientRow(k, day.n[k], M.target(k, defs))).join('') + '</section>';
    html += '<div class="widget-h"><h2 class="section-title">Vitamins</h2><a class="linkish" href="#/nutrition/targets">Targets</a></div>' + list(VITAMINS) +
      '<h2 class="section-title">Minerals and electrolytes</h2>' + list(MINERALS);
    html += '<p class="hint center gap-top">Totals add food and supplements, each counted once. Foods that don\'t list a nutrient count as unknown, not zero. Reference values: ' + esc(SRC) + '.</p>';
    return html;
  }

  /* ---------- history ---------- */

  const RANGES = [['7', '7D', 7], ['30', '30D', 30], ['90', '90D', 90], ['365', '1Y', 365], ['custom', 'Custom', 0]];
  const AGGS = [['day', 'Daily'], ['week', 'Weekly avg'], ['month', 'Monthly avg']];
  M.rangeDates = () => {
    const today = HT.today();
    if (M.vs.range === 'custom') {
      const from = M.vs.from || HT.addDays(today, -29), to = M.vs.to && M.vs.to < today ? M.vs.to : today;
      return { from: from > to ? to : from, to };
    }
    const r = RANGES.find((x) => x[0] === M.vs.range) || RANGES[1];
    return { from: HT.addDays(today, -r[2] + 1), to: today };
  };
  /* Points for the chart: one per day, week or month, each the average over logged days that list the nutrient. */
  M.series = (k, days, agg) => {
    const groups = {};
    days.forEach((d) => {
      const x = d.n[k];
      if (!x || x.total == null) return;
      const g = agg === 'week' ? HT.weekStart(d.date) : agg === 'month' ? d.date.slice(0, 7) + '-01' : d.date;
      (groups[g] = groups[g] || []).push(x.total);
    });
    return Object.keys(groups).sort().map((g) => ({ key: g, v: r4(groups[g].reduce((a, b) => a + b, 0) / groups[g].length), n: groups[g].length }));
  };
  const periodLabel = (key, agg) => (agg === 'month' ? HT.parseKey(key).toLocaleDateString(undefined, { month: 'short', year: 'numeric' }) : agg === 'week' ? 'Week of ' + shortDate(key) : shortDate(key));

  function historyView() {
    const { from, to } = M.rangeDates();
    const defs = M.defaults(), days = M.range(from, to);
    const k = M.vs.hk, t = M.target(k, defs);
    let html = '<div class="chips gap-bottom" role="group" aria-label="Date range">' + RANGES.map((r) => '<button type="button" class="chip" data-action="mi-range" data-v="' + r[0] + '" aria-pressed="' + (M.vs.range === r[0]) + '">' + r[1] + '</button>').join('') + '</div>';
    if (M.vs.range === 'custom') html += '<div class="row2 gap-bottom"><label class="field"><span class="label">From</span><input id="mi-from" type="date" max="' + HT.today() + '" value="' + from + '"></label><label class="field"><span class="label">To</span><input id="mi-to" type="date" max="' + HT.today() + '" value="' + to + '"></label></div>';
    html += '<p class="hint gap-bottom">' + esc(longDate(from)) + ' – ' + esc(longDate(to)) + ' · ' + plural(days.length, 'logged day') + '. Days with nothing logged are left out, not counted as zero.</p>';
    if (!days.length) return html + '<section class="empty"><h2>No food or supplements logged in this period</h2><p>Pick a longer range, or log food to start building a history.</p></section>';
    html += '<section class="panel-card"><div class="card-head"><h3>Trend</h3></div>' +
      '<label class="field"><span class="label">Nutrient</span><select id="mi-hk">' + '<optgroup label="Vitamins">' + VITAMINS.map((x) => '<option value="' + x + '"' + (x === k ? ' selected' : '') + '>' + esc(label(x)) + '</option>').join('') + '</optgroup>' +
        '<optgroup label="Minerals and electrolytes">' + MINERALS.map((x) => '<option value="' + x + '"' + (x === k ? ' selected' : '') + '>' + esc(label(x)) + '</option>').join('') + '</optgroup>' +
        '<optgroup label="Other"><option value="fibre"' + (k === 'fibre' ? ' selected' : '') + '>Fibre</option></optgroup></select></label>' +
      '<div class="segmented gap-bottom">' + AGGS.map((a) => '<button type="button" data-action="mi-agg" data-v="' + a[0] + '" aria-pressed="' + (M.vs.agg === a[0]) + '">' + a[1] + '</button>').join('') + '</div>' +
      '<div id="mi-chart" class="mi-chart"></div></section>';
    // Per-period table for the chosen nutrient.
    const pts = M.series(k, days, M.vs.agg);
    if (pts.length) {
      html += '<section class="panel-card"><h3>' + esc(label(k)) + ' by ' + (M.vs.agg === 'day' ? 'day' : M.vs.agg === 'week' ? 'week' : 'month') + '</h3><div class="ntable-wrap"><table class="nweeks"><thead><tr><th>' + (M.vs.agg === 'day' ? 'Day' : 'Period') + '</th><th>' + (M.vs.agg === 'day' ? 'Total' : 'Avg / day') + '</th><th>% of target</th><th>Status</th></tr></thead><tbody>' +
        pts.slice().reverse().slice(0, 60).map((p) => {
          const s = M.status({ total: p.v, suppUL: p.v }, Object.assign({}, t, { ulBasis: t.ulBasis === 'supp' || t.ulBasis === 'preformed' ? 'none' : t.ulBasis, ul: t.ulBasis === 'supp' || t.ulBasis === 'preformed' ? null : t.ul })), tag = statusTag(s, t);
          return '<tr><th>' + esc(periodLabel(p.key, M.vs.agg)) + (M.vs.agg !== 'day' ? ' <small class="muted">' + plural(p.n, 'day') + '</small>' : '') + '</th><td>' + esc(fmt(k, p.v)) + '</td><td>' + (t.target ? pctText((p.v / t.target) * 100) : '—') + '</td><td><span class="tag ' + tag[1] + '">' + esc(tag[0]) + '</span></td></tr>';
        }).join('') + '</tbody></table></div>' +
        (t.ulBasis === 'supp' || t.ulBasis === 'preformed' ? '<p class="hint">This nutrient\'s upper limit applies to supplements only, so it\'s checked per day in the summary below, not against these totals.</p>' : '') + '</section>';
    }
    // Summary across all nutrients.
    const rows = DAY_KEYS.map((x) => {
      const tt = M.target(x, defs), known = days.filter((d) => d.n[x].total != null);
      const st = known.map((d) => M.status(d.n[x], tt));
      const avg = known.length ? known.reduce((a, d) => a + d.n[x].total, 0) / known.length : null;
      return { k: x, t: tt, known: known.length, avg, below: st.filter((s) => s === 'below').length, over: st.filter((s) => s === 'over').length };
    });
    const short = rows.filter((r) => r.t.target != null && r.known >= 3 && r.below / r.known >= 0.7);
    const over = rows.filter((r) => r.over >= 2 && r.over / r.known >= 0.2);
    html += '<section class="panel-card"><h3>Often below target</h3>' + (short.length ? short.map((r) => '<div class="frow"><span>' + esc(label(r.k)) + '</span><b>' + r.below + ' of ' + plural(r.known, 'day') + ' · avg ' + pctText((r.avg / r.t.target) * 100) + '</b></div>').join('')
      : '<p class="muted">' + (days.length < 3 ? 'Log at least three days to see patterns.' : 'Nothing was below target on 70% or more of the days that list it.') + '</p>') + '</section>' +
      '<section class="panel-card"><h3>Often above a limit</h3>' + (over.length ? over.map((r) => '<div class="frow"><span>' + esc(label(r.k)) + '</span><b>' + r.over + ' of ' + plural(r.known, 'day') + '</b></div>').join('') + DISCLAIMER
      : '<p class="muted">No nutrient went above its upper limit on more than one day in this period.</p>') + '</section>';
    html += '<section class="panel-card"><h3>Averages for this period</h3><div class="ntable-wrap"><table class="nweeks"><thead><tr><th>Nutrient</th><th>Avg / day</th><th>% of target</th><th>Days below</th><th>Days over limit</th><th>Days with data</th></tr></thead><tbody>' +
      rows.map((r) => '<tr><th>' + esc(label(r.k)) + '</th><td>' + (r.avg != null ? esc(fmt(r.k, r.avg)) : '—') + '</td><td>' + (r.avg != null && r.t.target ? pctText((r.avg / r.t.target) * 100) : '—') + '</td><td>' + (r.known && r.t.target != null ? r.below : '—') + '</td><td>' + (r.known && r.t.ul != null ? r.over : '—') + '</td><td>' + r.known + '</td></tr>').join('') +
      '</tbody></table></div><p class="hint">Averages use only the logged days that list each nutrient. "Days with data" shows how many that is.</p></section>';
    return html;
  }

  M.drawChart = () => {
    const box = HT.$('#mi-chart');
    if (!box) return;
    const { from, to } = M.rangeDates();
    const k = M.vs.hk, t = M.target(k, M.defaults());
    const pts = M.series(k, M.range(from, to), M.vs.agg);
    if (!pts.length) { box.innerHTML = '<p class="note">No logged food or supplements in this period list ' + esc(label(k).toLowerCase()) + '.</p>'; return; }
    const AX = 48;
    const cw = Math.max(120, box.clientWidth - AX);
    const bw = Math.max(10, Math.min(36, cw / pts.length - 4));
    const Wd = Math.max(cw, pts.length * (bw + 4) + 8);
    const Hh = window.innerWidth >= 900 ? 260 : 200, padT = 12, padB = 26;
    const ulLine = t.ulBasis === 'total' || t.ulBasis === 'cdrr' ? t.ul : null;
    let hi = Math.max.apply(null, pts.map((p) => p.v).concat([t.target || 0, ulLine || 0]));
    hi = hi > 0 ? hi * 1.12 : 1;
    const Y = (v) => padT + (Hh - padT - padB) * (1 - v / hi);
    const base = Hh - padB;
    let grid = '', axis = '';
    for (let i = 0; i < 4; i++) {
      const v = (hi * i) / 3, y = Y(v);
      grid += '<line class="wc-grid" x1="0" x2="' + Wd + '" y1="' + y.toFixed(1) + '" y2="' + y.toFixed(1) + '"/>';
      axis += '<span style="top:' + y.toFixed(1) + 'px">' + (v >= 1000 ? Math.round(v / 100) / 10 + 'k' : v >= 10 ? Math.round(v) : Math.round(v * 10) / 10) + '</span>';
    }
    const sel = M.vs.sel != null && pts[M.vs.sel] ? M.vs.sel : pts.length - 1;
    const step = (Wd - 8) / pts.length;
    const bars = pts.map((p, i) => {
      const x = 4 + i * step + (step - bw) / 2, y = Y(p.v);
      const s = t.target == null ? '' : ulLine != null && p.v > ulLine ? ' s-over' : p.v >= t.target ? ' s-within' : ' s-below';
      return '<rect class="mi-cbar' + s + (i === sel ? ' sel' : '') + '" x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + Math.max(1, base - y).toFixed(1) + '" rx="2"/>' +
        '<rect class="wc-hit" data-i="' + i + '" x="' + (4 + i * step).toFixed(1) + '" y="0" width="' + step.toFixed(1) + '" height="' + Hh + '"/>';
    }).join('');
    let labels = '', lastX = -1e9;
    pts.forEach((p, i) => {
      const x = 4 + i * step + step / 2;
      if (x - lastX < 58) return;
      lastX = x;
      labels += '<text class="wc-x" x="' + x.toFixed(1) + '" y="' + (Hh - 7) + '" text-anchor="middle">' + esc(M.vs.agg === 'month' ? HT.parseKey(p.key).toLocaleDateString(undefined, { month: 'short' }) : shortDate(p.key)) + '</text>';
    });
    const lines = (t.target ? '<line class="wc-goal" x1="0" x2="' + Wd + '" y1="' + Y(t.target).toFixed(1) + '" y2="' + Y(t.target).toFixed(1) + '"/>' : '') +
      (ulLine != null ? '<line class="mi-ul" x1="0" x2="' + Wd + '" y1="' + Y(ulLine).toFixed(1) + '" y2="' + Y(ulLine).toFixed(1) + '"/>' : '');
    const readout = (i) => { const p = pts[i]; return '<b>' + esc(fmt(k, p.v)) + '</b> · ' + esc(M.vs.agg === 'day' ? longDate(p.key) : periodLabel(p.key, M.vs.agg) + ' · avg of ' + plural(p.n, 'day')) + (t.target ? ' · ' + pctText((p.v / t.target) * 100) + ' of target' : ''); };
    box.innerHTML = '<div class="wc-read" id="mi-read" aria-live="polite">' + readout(sel) + '</div><div class="wc-wrap" style="height:' + Hh + 'px"><div class="wc-axis" style="width:' + AX + 'px">' + axis + '</div>' +
      '<div class="wc-scroll"><svg width="' + Wd + '" height="' + Hh + '" viewBox="0 0 ' + Wd + ' ' + Hh + '" role="img" aria-label="' + esc(label(k)) + ' (' + esc(unitOf(k)) + '), ' + plural(pts.length, 'point') + '">' + grid + lines + bars + labels + '</svg></div></div>' +
      '<div class="legend"><span>' + esc(unitOf(k)) + (M.vs.agg === 'day' ? ' per day' : ' per day, averaged') + '</span>' + (t.target ? '<span><i class="lg mi-lg-t"></i>Target ' + esc(fmt(k, t.target)) + '</span>' : '') +
      (ulLine != null ? '<span><i class="lg mi-lg-u"></i>' + esc(t.ulType === 'CDRR' ? 'CDRR' : 'Upper limit') + ' ' + esc(fmt(k, ulLine)) + '</span>' : '') + (Wd > cw ? '<span>Scroll sideways for more</span>' : '') + '</div>';
    const scroller = HT.$('.wc-scroll', box);
    scroller.scrollLeft = scroller.scrollWidth;
    const pick = (e) => {
      const hit = e.target.closest && e.target.closest('.wc-hit');
      if (!hit) return;
      const i = +hit.dataset.i;
      M.vs.sel = i;
      HT.$$('.mi-cbar', box).forEach((b, n) => b.classList.toggle('sel', n === i));
      HT.$('#mi-read', box).innerHTML = readout(i);
    };
    scroller.addEventListener('click', pick);
    scroller.addEventListener('pointerover', pick);
  };
  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { if (HT.route && HT.route.name === 'nutrition' && M.vs.mode === 'history') M.drawChart(); }, 150);
  });

  M.view = () => {
    let html = N.head('micros') + '<div class="segmented gap-bottom">' + [['day', 'Day'], ['history', 'History']].map((m) => '<button type="button" data-action="mi-mode" data-v="' + m[0] + '" aria-pressed="' + (M.vs.mode === m[0]) + '">' + m[1] + '</button>').join('') + '</div>';
    if (M.vs.mode === 'history') { html += historyView(); requestAnimationFrame(M.drawChart); }
    else html += dayView();
    return html;
  };

  /* ---------- diary + Health overview cards ---------- */

  const KEY_SET = ['vitd', 'calcium', 'magnesium', 'iron', 'potassium', 'zinc', 'vitc', 'b12'];
  const waterMetric = () => (HD() ? HD().metrics.find((m) => m.kind === 'water' && m.enabled) : null);
  M.diaryExtras = (key) => {
    const defs = M.defaults(), day = M.day(key), H = HT.health;
    let html = '<section class="panel-card"><div class="card-head"><h3>Vitamins & minerals</h3><a class="btn btn-sm" href="#/nutrition/micros">All 28</a></div>';
    if (!day.logged) html += '<p class="muted">Log food or mark supplements as taken to see vitamins and minerals.</p>';
    else {
      const c = counts(day, defs);
      html += '<div class="mi-keys">' + KEY_SET.map((k) => {
        const x = day.n[k], t = M.target(k, defs), s = M.status(x, t), tag = statusTag(s, t);
        return '<a class="mi-key" href="#/nutrition/micros"><span class="mi-key-n">' + esc(label(k).replace(/ \(.*\)$/, '')) + '</span><span class="mi-key-v">' + (x.total == null ? '—' : t.target ? pctText((x.total / t.target) * 100) : esc(fmt(k, x.total))) + '</span>' +
          '<span class="mi-bar ' + tag[1] + '"><i style="width:' + barW(x, t) + '%"></i></span></a>';
      }).join('') + '</div>' +
        '<p class="hint">' + c.within + ' met · ' + c.below + ' below target · ' + c.over + ' above a limit · ' + c.unknown + ' no data' +
        (c.notarget ? ' · ' + c.notarget + ' without a target yet — <button type="button" class="linkish" data-action="mi-profile">set up your profile</button>' : '') + '</p>';
      const over = M.alerts(key, defs).filter((a) => a.lvl === 'over');
      if (over.length) html += '<p class="mi-warn">' + esc(over[0].text) + (over.length > 1 ? ' <a class="linkish" href="#/nutrition/micros">+' + (over.length - 1) + ' more</a>' : '') + '</p>';
    }
    html += '</section>';
    // Water and supplements for the same day, from the Health logs.
    if (!H) return html;
    const wm = waterMetric();
    const due = HD().routines.filter((x) => x.status === 'active' && (H.routineDue(x, key) || H.intakeOf(x, key) || x.schedule.mode === 'asneeded'));
    if (!wm && !due.length) return html;
    html += '<section class="panel-card"><div class="card-head"><h3>Water & supplements</h3><a class="btn btn-sm" href="#/health/supplements">Manage</a></div>';
    if (wm) {
      const v = H.metricValue(wm, key) || 0, tg = H.metricTarget(wm);
      html += '<div class="wline"><span>💧 ' + esc(H.units.fmtWater(v)) + (tg ? ' <small class="muted">of ' + esc(H.units.fmtWater(tg)) + '</small>' : '') + '</span><button type="button" class="btn btn-sm" data-action="mi-water">+' + esc(H.units.fmtWater(wm.step || 250)) + '</button></div>' +
        (tg ? '<div class="fbar gap-top"><i style="width:' + Math.min(100, (v / tg) * 100) + '%"></i></div>' : '');
    }
    if (due.length) {
      html += '<div class="chips gap-top">' + due.map((x) => {
        const on = H.intakeOf(x, key) === 'taken';
        return '<span data-id="' + x.id + '" data-date="' + key + '"><button type="button" class="chip' + (on ? ' on' : '') + '" data-action="h-sp-set" data-s="taken" aria-pressed="' + on + '">' + (on ? icon.check + ' ' : '') + esc(x.name) + '</button></span>';
      }).join('') + '</div><p class="hint">Tap a supplement to mark it taken' + (due.some((x) => !x.facts) ? '. Add supplement facts to count its vitamins and minerals' : '') + '.</p>';
    }
    return html + '</section>';
  };
  HT.actions['mi-water'] = () => {
    const H = HT.health, wm = waterMetric();
    if (!H || !wm) return;
    const key = N.vs.day || HT.today();
    H.setMetric(wm, key, (H.metricValue(wm, key) || 0) + (wm.step || 250));
    HT.toast('Water logged');
    HT.render();
  };

  M.healthCard = () => {
    const key = HT.today(), tot = N.dayTotal(key), t = N.targets(), n = tot.n, defs = M.defaults(), day = M.day(key);
    const c = day.logged ? counts(day, defs) : null;
    return '<section class="panel-card"><div class="card-head"><h3>Nutrition today</h3><a class="btn btn-sm" href="#/nutrition">Open</a></div>' +
      (tot.count || day.logged ? '<div class="frow"><span>Calories</span><b>' + esc(N.fmtN('kcal', n.kcal || 0)) + (t.kcal ? ' <small>/ ' + esc(N.fmtN('kcal', t.kcal)) + '</small>' : '') + '</b></div>' +
        '<div class="frow"><span>Protein</span><b>' + esc(N.fmtN('protein', n.protein || 0)) + (t.protein ? ' <small>/ ' + esc(N.fmtN('protein', t.protein)) + '</small>' : '') + '</b></div>' +
        (c ? '<div class="frow"><span>Vitamins & minerals</span><b><a class="linkish" href="#/nutrition/micros">' + c.within + ' of 28 met' + (c.over ? ' · ' + c.over + ' above a limit' : '') + '</a></b></div>' : '')
        : '<p class="muted">Nothing logged yet today.</p>') +
      '<div class="btn-row gap-top"><button type="button" class="btn" data-action="n-add">' + icon.plus + '<span>Log food</span></button><a class="btn" href="#/nutrition/micros">Vitamins & minerals</a></div></section>';
  };

  /* ---------- actions ---------- */

  HT.actions['mi-profile'] = () => M.openProfile();
  HT.actions['mi-mode'] = (el) => { M.vs.mode = el.dataset.v; HT.render(); };
  HT.actions['mi-range'] = (el) => { M.vs.range = el.dataset.v; M.vs.sel = null; HT.render(); };
  HT.actions['mi-agg'] = (el) => { M.vs.agg = el.dataset.v; M.vs.sel = null; HT.render(); };
  HT.actions['mi-restore'] = async () => {
    const ok = await HT.confirm({ title: 'Restore recommended defaults?', message: 'Clear every custom target and limit and go back to the recommended values for your profile? What you logged isn\'t changed.', confirmLabel: 'Restore' });
    if (!ok) return;
    const t = ND().targets;
    Object.keys(t).forEach((k) => { if (['kcal', 'protein', 'carbs', 'fat', 'fibre', 'sugar', 'sodium'].includes(k)) t[k] = null; else delete t[k]; });
    ND().limits = {};
    HT.save();
    HT.toast('Recommended values restored');
    HT.render();
  };
})();
