// App (9).jsx — Day-grouped Menu + Duty Roster + Fixed 10-Scout Roster + Robust localStorage
import React, { useEffect, useMemo, useRef, useState } from "react";

// --- Firebase (anonymous) ---
import { initializeApp, getApps } from "firebase/app";
import { getAuth, onAuthStateChanged, signInAnonymously } from "firebase/auth";
import {
  getFirestore,
  collection,
  doc,
  addDoc,
  setDoc,
  onSnapshot,
  serverTimestamp,
  query,
  orderBy,
  deleteDoc,
} from "firebase/firestore";

// ---------- tiny guards ----------
const arr = (x) => (Array.isArray(x) ? x : []);
const obj = (x) => (x && typeof x === "object" ? x : {});
const getMealType = (r) => String(r?.mealType || "dinner").trim().toLowerCase();
const uid = () => Math.random().toString(36).slice(2, 10);

// ---------- helpers ----------
const ensureTen = (list) =>
  Array.from({ length: 10 }, (_, i) =>
    (list && typeof list[i] === "string" && list[i].trim()) ? list[i].trim() : `Scout ${i + 1}`
  );

// ---------- Firebase Config via Vite env ----------
const firebaseCfg = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};
function getFirebase() {
  if (getApps().length === 0) initializeApp(firebaseCfg);
  return { auth: getAuth(), db: getFirestore() };
}

// ---------- LS helpers ----------
const saveLS = (k, v) => {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {
    try {
      sessionStorage.setItem(k, JSON.stringify(v));
    } catch {}
  }
};
const loadLS = (k, d) => {
  for (const store of [localStorage, sessionStorage]) {
    try {
      const raw = store.getItem(k);
      if (raw != null) {
        const v = JSON.parse(raw);
        if (v != null) return v;
      }
    } catch {}
  }
  return d;
};

// ---------- normalize ----------
const normalizeRecipe = (r = {}) => {
  const clean = { ...r };
  clean.id = r?.id || (crypto?.randomUUID?.() || String(Date.now()));
  clean.name = String(r?.name || "").trim();
  clean.mealType = getMealType(r);
  clean.course = String(r?.course || "").trim().toLowerCase();

  clean.ingredients = arr(r?.ingredients);
  clean.steps = arr(r?.steps);
  clean.tags = obj(r?.tags);
  clean.diet = obj(r?.diet);

  // Dessert -> show in dinner slots
  if (clean.mealType === "dessert") {
    clean.mealType = "dinner";
    if (!clean.course) clean.course = "dessert";
  }
  if (!["main", "side", "drink", "dessert"].includes(clean.course)) clean.course = "main";

  clean.serves = Number(r?.serves) || 8;
  return clean;
};

// ---------- seed (trim for brevity) ----------
const SEED = [
  normalizeRecipe({
    name: "Dutch Oven Chicken & Veg Pot Pie",
    mealType: "dinner",
    course: "main",
    serves: 8,
    tags: { dutchOven: true, car: true },
    ingredients: [
      { item: "chicken thighs", qtyPerPerson: 0.25, unit: "lb" },
      { item: "mixed veg (frozen)", qtyPerPerson: 0.5, unit: "cup" },
      { item: "gravy mix", qtyPerPerson: 0.25, unit: "packet" },
      { item: "biscuit dough", qtyPerPerson: 1, unit: "biscuit" },
    ],
    steps: ["Brown chicken", "Add veg + gravy", "Top w/ biscuits, bake 20–25m"],
  }),
  normalizeRecipe({
    name: "Campfire Corn",
    mealType: "dinner",
    course: "side",
    tags: { car: true, canoe: true },
    ingredients: [{ item: "corn on the cob", qtyPerPerson: 1, unit: "ear" }],
    steps: ["Wrap in foil w/ butter + salt", "Roast over coals ~12–15m"],
  }),
  normalizeRecipe({
    name: "Lemonade",
    mealType: "dinner",
    course: "drink",
    tags: { backpacking: true, car: true, canoe: true },
    ingredients: [{ item: "lemonade mix", qtyPerPerson: 0.5, unit: "scoop" }],
    steps: ["Mix with water per instructions"],
  }),
  normalizeRecipe({
    name: "Dutch Oven Cobbler",
    mealType: "dinner",
    course: "dessert",
    tags: { dutchOven: true, car: true },
    ingredients: [
      { item: "canned pie filling", qtyPerPerson: 0.4, unit: "cup" },
      { item: "cake mix", qtyPerPerson: 0.1, unit: "box" },
      { item: "butter", qtyPerPerson: 0.5, unit: "tbsp" },
    ],
    steps: ["Layer filling, dry mix, butter pats", "Bake in DO until bubbling"],
  }),
  normalizeRecipe({
    name: "Oatmeal Packs",
    mealType: "breakfast",
    course: "main",
    tags: { backpacking: true, car: true, canoe: true },
    ingredients: [
      { item: "instant oatmeal", qtyPerPerson: 1.5, unit: "packet" },
      { item: "dried fruit", qtyPerPerson: 0.25, unit: "cup" },
    ],
    steps: ["Boil water", "Mix & serve"],
  }),
  normalizeRecipe({
    name: "Banana",
    mealType: "breakfast",
    course: "side",
    tags: { backpacking: true, car: true, canoe: true },
    ingredients: [{ item: "banana", qtyPerPerson: 1, unit: "ea" }],
    steps: ["Serve with oatmeal"],
  }),
  normalizeRecipe({
    name: "Hot Cocoa",
    mealType: "breakfast",
    course: "drink",
    tags: { backpacking: true, car: true, canoe: true },
    ingredients: [{ item: "cocoa mix", qtyPerPerson: 1, unit: "packet" }],
    steps: ["Add to hot water & stir"],
  }),
  normalizeRecipe({
    name: "PB&J + Fruit",
    mealType: "lunch",
    course: "main",
    tags: { backpacking: true, car: true, canoe: true },
    ingredients: [
      { item: "bread", qtyPerPerson: 2, unit: "slice" },
      { item: "peanut butter", qtyPerPerson: 2, unit: "tbsp" },
      { item: "jelly", qtyPerPerson: 1, unit: "tbsp" },
    ],
    steps: ["Assemble sandwiches"],
  }),
  normalizeRecipe({
    name: "Chips",
    mealType: "lunch",
    course: "side",
    tags: { car: true, canoe: true },
    ingredients: [{ item: "chips", qtyPerPerson: 1, unit: "bag (snack)" }],
    steps: ["Serve with sandwiches"],
  }),
  normalizeRecipe({
    name: "Water",
    mealType: "lunch",
    course: "drink",
    tags: { backpacking: true, car: true, canoe: true },
    ingredients: [{ item: "water", qtyPerPerson: 16, unit: "oz" }],
    steps: ["Hydrate!"],
  }),
];

// ---------- small presentational ----------
const Pill = ({ children }) => <span className="gm-pill">{children}</span>;

// ---------- Recipe Form ----------
function RecipeForm({ initial, onCancel, onSave, dietsList }) {
  const [draft, setDraft] = useState(
    initial ||
      normalizeRecipe({
        id: uid(),
        name: "",
        mealType: "dinner",
        course: "main",
        serves: 8,
        tags: {},
        diet: {},
        ingredients: [{ item: "", qtyPerPerson: 1, unit: "ea" }],
        steps: [""],
      })
  );

  const updateIng = (i, patch) =>
    setDraft((d) => {
      const a = [...d.ingredients];
      a[i] = { ...a[i], ...patch };
      return { ...d, ingredients: a };
    });

  const updateStep = (i, val) =>
    setDraft((d) => {
      const a = [...d.steps];
      a[i] = val;
      return { ...d, steps: a };
    });

  const addIng = () =>
    setDraft((d) => ({
      ...d,
      ingredients: [...d.ingredients, { item: "", qtyPerPerson: 1, unit: "ea" }],
    }));

  const addStep = () => setDraft((d) => ({ ...d, steps: [...d.steps, ""] }));

  const submit = () => {
    if (!draft.name.trim()) return alert("Recipe name is required");
    onSave(normalizeRecipe(draft));
  };

  return (
    <div className="gm-card gm-panel">
      <h2 className="gm-h2">{initial ? "Edit Recipe" : "Add Recipe"}</h2>
      <div className="gm-stack">
        <input
          className="gm-input"
          placeholder="Recipe name"
          value={draft.name}
          onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
        />

        <div className="gm-grid-3">
          <div>
            <label className="gm-label">Meal</label>
            <select
              className="gm-select"
              value={draft.mealType}
              onChange={(e) => setDraft((d) => ({ ...d, mealType: e.target.value }))}
            >
              <option value="breakfast">Breakfast</option>
              <option value="lunch">Lunch</option>
              <option value="dinner">Dinner</option>
            </select>
          </div>
          <div>
            <label className="gm-label">Course</label>
            <select
              className="gm-select"
              value={draft.course}
              onChange={(e) => setDraft((d) => ({ ...d, course: e.target.value }))}
            >
              <option value="main">Main</option>
              <option value="side">Side</option>
              <option value="drink">Drink</option>
              <option value="dessert">Dessert</option>
            </select>
          </div>
          <div>
            <label className="gm-label">Serves</label>
            <input
              type="number"
              className="gm-input"
              value={draft.serves}
              onChange={(e) =>
                setDraft((d) => ({ ...d, serves: Math.max(1, Number(e.target.value) || 1) }))
              }
            />
          </div>
        </div>

        <div className="gm-grid-2">
          <div>
            <label className="gm-label">Tags</label>
            <div className="gm-chips">
              {["backpacking", "car", "canoe", "dutchOven"].map((k) => (
                <label key={k} className="gm-chip">
                  <input
                    type="checkbox"
                    checked={!!draft.tags[k]}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, tags: { ...d.tags, [k]: e.target.checked } }))
                    }
                  />
                  {k === "dutchOven" ? "Dutch oven" : k.charAt(0).toUpperCase() + k.slice(1)}
                </label>
              ))}
            </div>
          </div>
          <div>
            <label className="gm-label">Diet suitability</label>
            <div className="gm-chips">
              {dietsList.map((dk) => (
                <label key={dk.key} className="gm-chip">
                  <input
                    type="checkbox"
                    checked={!!draft.diet[dk.key]}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, diet: { ...d.diet, [dk.key]: e.target.checked } }))
                    }
                  />
                  {dk.label.split(" (")[0]}
                </label>
              ))}
            </div>
          </div>
        </div>

        <div>
          <div className="gm-label gm-bold">Ingredients (per person)</div>
          {draft.ingredients.map((ing, i) => (
            <div key={i} className="gm-grid-5">
              <input
                className="gm-input"
                placeholder="item"
                value={ing.item}
                onChange={(e) => updateIng(i, { item: e.target.value })}
              />
              <input
                type="number"
                step="0.05"
                className="gm-input"
                placeholder="qty"
                value={ing.qtyPerPerson}
                onChange={(e) => updateIng(i, { qtyPerPerson: Number(e.target.value) || 0 })}
              />
              <input
                className="gm-input"
                placeholder="unit"
                value={ing.unit}
                onChange={(e) => updateIng(i, { unit: e.target.value })}
              />
              <div className="gm-col-span-2" />
            </div>
          ))}
          <button onClick={addIng} className="gm-btn">+ Ingredient</button>
        </div>

        <div>
          <div className="gm-label gm-bold">Steps</div>
          {draft.steps.map((st, i) => (
            <input
              key={i}
              className="gm-input gm-mt1"
              placeholder={`Step ${i + 1}`}
              value={st}
              onChange={(e) => updateStep(i, e.target.value)}
            />
          ))}
          <button onClick={addStep} className="gm-btn">+ Step</button>
        </div>

        <div className="gm-row-end">
          <button onClick={onCancel} className="gm-btn">Cancel</button>
          <button onClick={submit} className="gm-btn gm-btn-primary">Save</button>
        </div>
      </div>
    </div>
  );
}

// ---------- Export / Import ----------
const downloadJSON = (filename, data) => {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

const buildRecipesExport = (recipes, meta = {}) => ({
  $schema: "https://example.com/schemas/grubmaster/recipes-v1.json",
  exporter: {
    app: "Scouts BSA Grubmaster Planner",
    version: "2.2.0",
    exportedAt: new Date().toISOString(),
    ...meta,
  },
  recipes: (recipes || []).map((r) => ({
    id: r.id || uid(),
    name: r.name || "Unnamed",
    mealType: r.mealType || "dinner",
    course: r.course || "main",
    serves: r.serves || 8,
    tags: r.tags || {},
    diet: r.diet || {},
    ingredients: Array.isArray(r.ingredients) ? r.ingredients : [],
    steps: Array.isArray(r.steps) ? r.steps : [],
  })),
});

// ------------------------------------
// Main App
// ------------------------------------
export default function App({ initialTroopId = "", embed = false } = {}) {
  const { auth, db } = useMemo(() => getFirebase(), []);

  // Wix-safe, minimal CSS (scoped to this tree)
  const baseCss = `
  .gm-root{min-height:100vh;background:linear-gradient(#f8fafc,#fff);color:#0f172a}
  .gm-header{position:sticky;top:0;z-index:10;background:#fff;border-bottom:1px solid #e5e7eb;backdrop-filter:saturate(180%) blur(8px)}
  .gm-container{max-width:1120px;margin:0 auto;padding:12px 16px}
  .gm-row{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
  .gm-grid{display:grid;grid-template-columns:1fr;gap:24px}
  @media (min-width:900px){.gm-grid{grid-template-columns:1fr 2fr}}
  .gm-card{background:#fff;border:1px solid #e5e7eb;border-radius:16px;box-shadow:0 1px 3px rgba(0,0,0,.06);padding:16px;min-height:180px}
  .gm-panel{display:flex;flex-direction:column}
  .gm-scroll{max-height:420px;overflow:auto}
  .gm-h2{font-size:1.1rem;font-weight:600;margin:0 0 10px}
  .gm-label{font-size:.9rem;color:#334155;margin-bottom:4px;display:block}
  .gm-bold{font-weight:600}
  .gm-input,.gm-select,.gm-textarea{width:100%;border:1px solid #cbd5e1;border-radius:10px;padding:8px 10px;font:inherit}
  .gm-textarea{min-height:96px}
  .gm-btn{border:1px solid #cbd5e1;border-radius:10px;background:#fff;padding:8px 12px;font-size:.9rem;cursor:pointer}
  .gm-btn-primary{background:#0f172a;color:#fff;border-color:#0f172a}
  .gm-row-end{display:flex;gap:8px;justify-content:flex-end;align-items:center}
  .gm-stack{display:grid;gap:10px}
  .gm-grid-2{display:grid;grid-template-columns:1fr;gap:10px}
  @media (min-width:700px){.gm-grid-2{grid-template-columns:1fr 1fr}}
  .gm-grid-3{display:grid;grid-template-columns:1fr;gap:10px}
  @media (min-width:700px){.gm-grid-3{grid-template-columns:repeat(3,1fr)}}
  .gm-grid-5{display:grid;grid-template-columns:2fr 1fr 1fr 1fr 1fr;gap:8px}
  .gm-col-span-2{grid-column:span 2}
  .gm-box{border:1px solid #e5e7eb;border-radius:12px;padding:12px}
  .gm-subtle{color:#64748b;font-size:.8rem}
  .gm-meal{letter-spacing:.05em;text-transform:uppercase;color:#64748b;font-size:.75rem;margin:6px 0}
  .gm-pill{display:inline-block;padding:2px 8px;border:1px solid #e5e7eb;border-radius:999px;background:#f8fafc;font-size:.75rem}
  table{border-collapse:collapse;width:100%}
  th,td{border:1px solid #94a3b8;padding:6px 8px;text-align:left;font-size:.9rem}
  `;

  // Boot/auth
  const [phase, setPhase] = useState("boot"); // boot | signed-in | error
  const [err, setErr] = useState(null);
  const [user, setUser] = useState(null);
  const authed = !!user;

  useEffect(() => {
    const unsub = onAuthStateChanged(
      auth,
      (u) => {
        setUser(u || null);
        setPhase("signed-in");
      },
      (e) => {
        console.error("[Auth] error", e);
        setErr(e);
        setPhase("error");
      }
    );
    if (!auth.currentUser) {
      signInAnonymously(auth).catch((e) => {
        console.error("Anon sign-in failed", e);
        setErr(e);
        setPhase("error");
      });
    }
    return () => unsub();
  }, [auth]);

  // Troop (enables Firestore sync)
  const [troopId, setTroopId] = useState(loadLS("gm_troop_id", initialTroopId || ""));
  useEffect(() => saveLS("gm_troop_id", troopId), [troopId]);

  const paths = useMemo(() => {
    if (!db || !troopId) return {};
    const recipesCol = collection(db, "troops", troopId, "recipes");
    const settingsDoc = doc(db, "troops", troopId, "meta", "settings");
    const userDoc = user ? doc(db, "troops", troopId, "users", user.uid) : null;
    return { recipesCol, settingsDoc, userDoc };
  }, [db, troopId, user]);

  // Trip setup (trimmed whitespace by keeping spacing tight)
  const [scouts, setScouts] = useState(loadLS("gm_scouts", 10));
  useEffect(() => saveLS("gm_scouts", scouts), [scouts]);

  const [meals, setMeals] = useState(loadLS("gm_meals", { breakfast: 2, lunch: 2, dinner: 2 }));
  useEffect(() => saveLS("gm_meals", meals), [meals]);

  const [campType, setCampType] = useState(loadLS("gm_campType", "car"));
  useEffect(() => saveLS("gm_campType", campType), [campType]);

  const [includeDutchOven, setIncludeDutchOven] = useState(loadLS("gm_includeDO", false));
  useEffect(() => saveLS("gm_includeDO", includeDutchOven), [includeDutchOven]);

  const DIETS = [
    { key: "alphaGalSafe", label: "Alpha-gal safe (no mammal products)" },
    { key: "vegetarian", label: "Vegetarian" },
    { key: "vegan", label: "Vegan" },
    { key: "glutenFree", label: "Gluten-free" },
    { key: "nutFree", label: "Nut-free" },
    { key: "dairyFree", label: "Dairy-free" },
  ];
  const [diet, setDiet] = useState(loadLS("gm_diet", {}));
  useEffect(() => saveLS("gm_diet", diet), [diet]);

  // Data
  const [recipes, setRecipes] = useState(() => {
    const ls = loadLS("gm_recipes", SEED);
    return Array.isArray(ls) ? ls.map(normalizeRecipe) : SEED;
  });
  const [favorites, setFavorites] = useState(loadLS("gm_favorites", []));
  const [names, setNames] = useState(
    ensureTen(loadLS("gm_names", Array.from({ length: 10 }, (_, i) => `Scout ${i + 1}`)))
  );

  useEffect(() => saveLS("gm_recipes", recipes), [recipes]);
  useEffect(() => saveLS("gm_favorites", favorites), [favorites]);
  useEffect(() => saveLS("gm_names", ensureTen(names)), [names]);

  const [syncInfo, setSyncInfo] = useState({ status: "local-only", last: null });

  // Cloud subscriptions (if Troop ID is set)
  useEffect(() => {
    if (!authed || !troopId || !paths.recipesCol) {
      setSyncInfo((s) => ({ ...s, status: "local-only" }));
      return;
    }
    const subs = [];
    subs.push(
      onSnapshot(query(paths.recipesCol, orderBy("createdAt", "asc")), (snap) => {
        const a = snap.docs.map((d) => normalizeRecipe({ id: d.id, ...d.data() }));
        if (a.length) setRecipes(a);
        setSyncInfo({ status: "online", last: new Date().toISOString() });
      })
    );
    if (paths.settingsDoc) {
      subs.push(
        onSnapshot(paths.settingsDoc, (d) => {
          const data = d.data();
          if (Array.isArray(data?.names)) setNames(ensureTen(data.names));
        })
      );
    }
    if (paths.userDoc) {
      subs.push(
        onSnapshot(paths.userDoc, (d) => {
          const data = d.data();
          if (Array.isArray(data?.favorites)) setFavorites(data.favorites);
        })
      );
    }
    return () => subs.forEach((u) => u && u());
  }, [authed, troopId, paths.recipesCol, paths.settingsDoc, paths.userDoc]);

  // Save names to cloud when changed (no lock-out; always 10)
  useEffect(() => {
    const save = async () => {
      if (!authed || !troopId || !paths.settingsDoc) return;
      await setDoc(paths.settingsDoc, { names: ensureTen(names) }, { merge: true });
      setSyncInfo({ status: "online", last: new Date().toISOString() });
    };
    save();
  }, [names, authed, troopId, paths.settingsDoc]);

  // Filter recipes by trip constraints
  const filteredRecipes = useMemo(() => {
    const list = Array.isArray(recipes) ? recipes : [];
    const d = obj(diet);
    return list.filter((r) => {
      const t = obj(r?.tags);
      const noTagTrue = !t.backpacking && !t.car && !t.canoe && !t.dutchOven; // allow untagged for car
      if (campType === "backpacking" && !t.backpacking) return false;
      if (campType === "car" && !(t.car || t.backpacking || t.canoe || noTagTrue)) return false;
      if (campType === "canoe" && !(t.canoe || t.car || t.backpacking)) return false;
      if (!includeDutchOven && t.dutchOven) return false;
      for (const k of Object.keys(d)) if (d[k] && !r.diet?.[k]) return false;
      return true;
    });
  }, [recipes, campType, includeDutchOven, diet]);

  // Menu (auto + editable) grouped by day
  const COURSES_BASE = ["main", "side", "drink"];
  const [menu, setMenu] = useState(loadLS("gm_menu", []));
  useEffect(() => saveLS("gm_menu", menu), [menu]);

  const dayCount = useMemo(
    () => Math.max(meals.breakfast || 0, meals.lunch || 0, meals.dinner || 0),
    [meals]
  );

  const neededSlots = useMemo(() => {
    const list = [];
    for (let d = 0; d < dayCount; d++) {
      if ((meals.breakfast || 0) > d) {
        COURSES_BASE.forEach((c) => list.push({ dayIndex: d, mealType: "breakfast", course: c }));
      }
      if ((meals.lunch || 0) > d) {
        COURSES_BASE.forEach((c) => list.push({ dayIndex: d, mealType: "lunch", course: c }));
      }
      if ((meals.dinner || 0) > d) {
        COURSES_BASE.forEach((c) => list.push({ dayIndex: d, mealType: "dinner", course: c }));
        list.push({ dayIndex: d, mealType: "dinner", course: "dessert" });
      }
    }
    return list;
  }, [dayCount, meals.breakfast, meals.lunch, meals.dinner]);

  // Auto-generate (preserve edits)
  useEffect(() => {
    const favs = new Set(favorites || []);
    const current = Array.isArray(menu) ? menu : [];
    const next = neededSlots.map((slot, idx) => {
      const existing = current[idx];
      if (
        existing &&
        existing.mealType === slot.mealType &&
        existing.course === slot.course &&
        existing.recipeId
      ) {
        return existing;
      }
      // prefer exact course; fallback to MAIN (except dessert)
      let pool = (filteredRecipes || []).filter(
        (r) =>
          r.mealType === slot.mealType &&
          ((r.course || "main") === (slot.course || "main"))
      );
      if (pool.length === 0 && slot.course !== "dessert") {
        pool = (filteredRecipes || []).filter(
          (r) => r.mealType === slot.mealType && (r.course || "main") === "main"
        );
      }
      pool.sort((a, b) => Number(favs.has(b.id)) - Number(favs.has(a.id)));
      const pick = pool[0];
      return { id: uid(), dayIndex: slot.dayIndex, mealType: slot.mealType, course: slot.course, recipeId: pick?.id || "" };
    });
    setMenu(next);
  }, [filteredRecipes, neededSlots, favorites]);

  const setMenuRecipe = (slotIndex, recipeId) => {
    setMenu((m) => {
      const a = Array.isArray(m) ? [...m] : [];
      if (!a[slotIndex]) return m;
      a[slotIndex] = { ...a[slotIndex], recipeId };
      return a;
    });
  };

  const menuByDay = useMemo(() => {
    const grouped = Array.from({ length: dayCount }, () => ({
      breakfast: [],
      lunch: [],
      dinner: [],
    }));
    (menu || []).forEach((s) => {
      const di = Number(s?.dayIndex);
      const mt = String(s?.mealType || "");
      if (
        Number.isInteger(di) &&
        di >= 0 &&
        di < grouped.length &&
        ["breakfast", "lunch", "dinner"].includes(mt)
      ) {
        grouped[di][mt].push(s);
      }
    });
    const order = { main: 0, side: 1, drink: 2, dessert: 3 };
    for (let d = 0; d < grouped.length; d++) {
      ["breakfast", "lunch", "dinner"].forEach((mt) => {
        grouped[d][mt].sort((a, b) => (order[a.course] ?? 9) - (order[b.course] ?? 9));
      });
    }
    return grouped;
  }, [menu, dayCount]);

  // Shopping list
  function addQty(map, key, qty = 0, unit = "") {
    const k = `${key}@@${unit}`.toLowerCase();
    map.set(k, { item: key, unit, qty: (map.get(k)?.qty || 0) + qty });
  }
  const shopping = useMemo(() => {
    const map = new Map();
    const chosen = (menu || [])
      .map((m) => (recipes || []).find((r) => r.id === m.recipeId))
      .filter(Boolean);
    chosen.forEach((r) => {
      (r.ingredients || []).forEach((ing) =>
        addQty(map, ing.item, (Number(ing.qtyPerPerson) || 0) * (Number(scouts) || 0), ing.unit || "")
      );
    });
    addQty(map, "paper towels", Math.ceil((Number(scouts) || 0) / 4), "roll");
    addQty(map, "trash bags", 2, "ea");
    return Array.from(map.values()).sort((a, b) => a.item.localeCompare(b.item));
  }, [menu, recipes, scouts]);

  // Edit / add / delete
  const [editingId, setEditingId] = useState(null);
  const startEdit = (id) => setEditingId(id);
  const cancelEdit = () => setEditingId(null);

  const saveEdited = async (rec) => {
    const clean = normalizeRecipe(rec);
    setRecipes((prev) => prev.map((r) => (r.id === clean.id ? clean : r)));
    if (authed && troopId && paths.recipesCol) {
      await setDoc(
        doc(paths.recipesCol, clean.id),
        { ...clean, updatedAt: serverTimestamp() },
        { merge: true }
      );
      setSyncInfo({ status: "online", last: new Date().toISOString() });
    }
    setEditingId(null);
  };

  const addNew = async (rec) => {
    const newR = normalizeRecipe({ ...rec, id: uid() });
    if (authed && troopId && paths.recipesCol) {
      await addDoc(paths.recipesCol, {
        ...newR,
        createdAt: serverTimestamp(),
        createdBy: user?.uid || "anon",
      });
      setSyncInfo({ status: "online", last: new Date().toISOString() });
    } else {
      setRecipes((prev) => [newR, ...prev]);
    }
  };

  const deleteRecipe = async (id) => {
    if (!confirm("Delete this recipe?")) return;
    setRecipes((prev) => prev.filter((r) => r.id !== id));
    setMenu((m) => (m || []).map((s) => (s.recipeId === id ? { ...s, recipeId: "" } : s)));
    if (authed && troopId && paths.recipesCol) {
      try {
        await deleteDoc(doc(paths.recipesCol, id));
      } catch (e) {
        console.warn("Cloud delete failed:", e);
      }
    }
  };

  const setFavoritesCloud = async (list) => {
    if (!authed || !troopId || !paths.userDoc) return;
    await setDoc(paths.userDoc, { favorites: list }, { merge: true });
    setSyncInfo({ status: "online", last: new Date().toISOString() });
  };
  const toggleFavorite = (id) => {
    setFavorites((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [id, ...prev];
      setFavoritesCloud(next);
      return next;
    });
  };

  // Print
  const printRef = useRef(null);
  const handlePrint = () => {
    const w = window.open("", "_blank");
    if (!w) return;
    const docW = w.document;
    docW.write(`<!doctype html><html><head><title>Grubmaster Plan</title>
      <style>
        body{font-family:ui-sans-serif,system-ui,Segoe UI,Roboto,Helvetica,Arial;padding:24px}
        h1{margin:0 0 8px}
        h2{margin:24px 0 8px}
        h3{margin:12px 0 6px}
        table{border-collapse:collapse;width:100%}
        th,td{border:1px solid #999;padding:6px 8px;text-align:left;font-size:12px}
        .muted{color:#555}
        .cap{text-transform:capitalize}
      </style></head><body>`);
    docW.write(printRef.current?.innerHTML || "");
    docW.write("</body></html>");
    docW.close();
    w.focus();
    w.print();
  };

  // Import/Export
  const importInputRef = useRef(null);
  const [importBusy, setImportBusy] = useState(false);
  const [importMsg, setImportMsg] = useState("");

  const handleExportJSON = () => {
    const payload = buildRecipesExport(recipes, {
      troopId: troopId || "local",
      user: user?.uid || "anon",
    });
    downloadJSON(`recipes-export-${new Date().toISOString()}.json`, payload);
  };
  const handleImportJSONClick = () => importInputRef.current?.click();
  const handleImportJSON = async (file) => {
    if (!file) return;
    setImportBusy(true);
    setImportMsg("");
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const list = Array.isArray(data?.recipes)
        ? data.recipes
        : Array.isArray(data)
        ? data
        : null;
      if (!list)
        throw new Error("Invalid file: expected { recipes: [...] } or an array.");
      const incoming = list.map(normalizeRecipe);
      // Merge into current, persist immediately
      const merged = (prev => {
        const map = new Map((prev || []).map((r) => [r.id, r]));
        incoming.forEach((r) => map.set(r.id, r));
        return Array.from(map.values());
      })(recipes);
      setRecipes(merged);
      saveLS("gm_recipes", merged); // persist right away
      if (authed && troopId && paths.recipesCol) {
        await Promise.all(
          incoming.map((r) =>
            setDoc(
              doc(paths.recipesCol, r.id),
              { ...r, updatedAt: serverTimestamp() },
              { merge: true }
            )
          )
        );
      }
      setMenu([]); // force auto-regenerate after import
      setImportMsg(`Imported ${incoming.length} recipe(s).`);
    } catch (e) {
      setImportMsg(`Import failed: ${e?.message || e}`);
    } finally {
      setImportBusy(false);
      if (importInputRef.current) importInputRef.current.value = "";
    }
  };

  // Reset local data cleanly
  const resetLocal = () => {
    if (!confirm("Reset local data (recipes, names, menu, settings)? This won't delete cloud data.")) return;
    const clearMatching = (store) => {
      try {
        const keys = [];
        for (let i = 0; i < store.length; i++) {
          const k = store.key(i);
          if (k && k.startsWith("gm_") && k !== "gm_recipes") keys.push(k); // keep recipes
        }
        keys.forEach((k) => store.removeItem(k));
      } catch {}
    };
    clearMatching(localStorage);
    clearMatching(sessionStorage);

    setTroopId("");
    setScouts(10);
    setMeals({ breakfast: 2, lunch: 2, dinner: 2 });
    setCampType("car");
    setIncludeDutchOven(false);
    setDiet({});
    setFavorites([]);
    setMenu([]);
    setNames(ensureTen());
    // DO NOT reset recipes here; they stay persisted
    setImportMsg("");
  };

  if (phase === "boot") {
    return (
      <div className="gm-root">
        <style>{baseCss}</style>
        <div className="gm-container" style={{ minHeight: "60vh", display: "grid", placeItems: "center" }}>
          Initializing…
        </div>
      </div>
    );
  }
  if (phase === "error") {
    return (
      <div className="gm-root">
        <style>{baseCss}</style>
        <div className="gm-container" style={{ padding: 24 }}>
          <h1 className="gm-h2">⚠️ Firebase error</h1>
          <pre style={{ padding: 12, background: "#f1f5f9", border: "1px solid #cbd5e1", borderRadius: 10, overflow: "auto" }}>
            {String(err?.message || err)}
          </pre>
          <p className="gm-subtle" style={{ marginTop: 8 }}>
            Check env vars and enable Anonymous Sign-in in Firebase Auth.
          </p>
        </div>
      </div>
    );
  }

  // ---------- UI ----------
  return (
    <div className="gm-root">
      <style>{baseCss}</style>

      {!embed && (
        <header className="gm-header">
          <div className="gm-container">
            <div className="gm-row">
              <h1 style={{ fontSize: "1.1rem", fontWeight: 700 }}>Scouts BSA Grubmaster Planner</h1>
              <div className="gm-row">
                <div className="gm-row" style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: "4px 8px", background: "#fff" }}>
                  <span className="gm-subtle">Troop ID:</span>
                  <input
                    className="gm-input"
                    style={{ width: 110 }}
                    placeholder="e.g. 194"
                    value={troopId}
                    onChange={(e) => setTroopId(e.target.value.trim())}
                  />
                </div>
                <span className="gm-btn">{authed ? "Connected (anonymous)" : "Connecting…"}</span>
                <button onClick={handlePrint} className="gm-btn gm-btn-primary">Export PDF</button>
                <button onClick={handleExportJSON} className="gm-btn">Export JSON</button>
                <button onClick={handleImportJSONClick} className="gm-btn">Import JSON</button>
                <button onClick={resetLocal} className="gm-btn" title="Clears all gm_* local data">Reset (local)</button>
                <input
                  ref={importInputRef}
                  type="file"
                  accept="application/json,.json"
                  style={{ display: "none" }}
                  onChange={(e) => handleImportJSON(e.target.files?.[0] || null)}
                />
              </div>
            </div>

            <div className="gm-subtle" style={{ padding: "4px 0 8px" }}>
              <span>Sync: </span>
              <span style={{ color: syncInfo.status === "online" ? "#047857" : syncInfo.status === "local-only" ? "#b45309" : "#475569" }}>
                {syncInfo.status} {syncInfo.last ? `• ${new Date(syncInfo.last).toLocaleTimeString()}` : ""}
              </span>
              {!troopId && <span style={{ marginLeft: 8, color: "#b45309" }}>Enter a Troop ID to share recipes across your troop.</span>}
              {importBusy && <span style={{ marginLeft: 8 }}>Importing…</span>}
              {importMsg && <span style={{ marginLeft: 8 }}>{importMsg}</span>}
            </div>
          </div>
        </header>
      )}

      <main className="gm-container gm-grid">
        {/* LEFT */}
        <section className="gm-stack">
          <div className="gm-card">
            <h2 className="gm-h2">Trip Setup</h2>

            <label className="gm-label">Number of Scouts</label>
            <input
              type="number"
              min={1}
              value={scouts}
              onChange={(e) => setScouts(Math.max(1, Number(e.target.value) || 1))}
              className="gm-input"
            />

            <div className="gm-grid-3" style={{ marginTop: 12 }}>
              {["breakfast", "lunch", "dinner"].map((mt) => (
                <div key={mt}>
                  <label className="gm-label" style={{ textTransform: "capitalize" }}>{mt}</label>
                  <input
                    type="number"
                    min={0}
                    value={meals[mt]}
                    onChange={(e) =>
                      setMeals((m) => ({
                        ...m,
                        [mt]: Math.max(0, Number(e.target.value) || 0),
                      }))
                    }
                    className="gm-input"
                  />
                </div>
              ))}
            </div>

            <label className="gm-label" style={{ marginTop: 12 }}>Camp Type</label>
            <select
              value={campType}
              onChange={(e) => setCampType(e.target.value)}
              className="gm-select"
            >
              {[
                { key: "backpacking", label: "Backpacking" },
                { key: "car", label: "Car camping" },
                { key: "canoe", label: "Canoe/float" },
              ].map((ct) => (
                <option key={ct.key} value={ct.key}>{ct.label}</option>
              ))}
            </select>

            <div style={{ marginTop: 12 }}>
              <div className="gm-label gm-bold">Dutch oven</div>
              <label style={{ marginRight: 12 }}>
                <input
                  type="radio"
                  name="dutch"
                  checked={!includeDutchOven}
                  onChange={() => setIncludeDutchOven(false)}
                />{" "}
                No
              </label>
              <label>
                <input
                  type="radio"
                  name="dutch"
                  checked={includeDutchOven}
                  onChange={() => setIncludeDutchOven(true)}
                />{" "}
                Yes (include Dutch oven recipes)
              </label>
              {campType === "backpacking" && includeDutchOven && (
                <div className="gm-subtle" style={{ marginTop: 4 }}>
                  Note: Dutch oven may be impractical for backpacking trips.
                </div>
              )}
            </div>

            <div style={{ marginTop: 12 }}>
              <div className="gm-label gm-bold">Dietary Restrictions</div>
              <div className="gm-stack">
                {DIETS.map((d) => (
                  <label key={d.key}>
                    <input
                      type="checkbox"
                      checked={!!diet[d.key]}
                      onChange={(e) =>
                        setDiet((prev) => ({ ...prev, [d.key]: e.target.checked }))
                      }
                    />{" "}
                    {d.label}
                  </label>
                ))}
              </div>
            </div>
          </div>

          {/* Add new or edit selected recipe */}
          {editingId ? (
            <RecipeForm
              key={"edit-" + editingId}
              initial={(recipes || []).find((r) => r.id === editingId)}
              onCancel={cancelEdit}
              onSave={saveEdited}
              dietsList={DIETS}
            />
          ) : (
            <RecipeForm onCancel={() => {}} onSave={addNew} dietsList={DIETS} />
          )}

          {/* Scouts 1–10 (always 10 editable inputs, no lock-out) */}
          <div className="gm-card">
            <h2 className="gm-h2">Scouts 1–10</h2>
            <div className="gm-grid-2">
              {ensureTen(names).map((n, i) => (
                <div key={i}>
                  <label className="gm-label">Scout {i + 1}</label>
                  <input
                    className="gm-input"
                    value={n}
                    onChange={(e) => {
                      const next = ensureTen(names);
                      next[i] = e.target.value;
                      setNames(ensureTen(next));
                    }}
                  />
                </div>
              ))}
            </div>
            <p className="gm-subtle" style={{ marginTop: 6 }}>
              Saved locally and troop-wide when Troop ID is set.
            </p>
          </div>
        </section>

        {/* RIGHT */}
        <section className="gm-stack">
          {/* Menu (by day) */}
          <div className="gm-card gm-panel">
            <h2 className="gm-h2">Menu (grouped by day)</h2>
            {dayCount === 0 && <div className="gm-subtle">Set meal counts on the left to create days.</div>}

            <div className="gm-stack gm-scroll">
              {menuByDay.map((day, dIdx) => (
                <div key={dIdx} className="gm-box">
                  <div className="gm-bold" style={{ marginBottom: 6 }}>Day {dIdx + 1}</div>

                  {["breakfast", "lunch", "dinner"].map(
                    (mt) =>
                      day[mt].length > 0 && (
                        <div key={mt} style={{ marginBottom: 10 }}>
                          <div className="gm-meal">{mt}</div>
                          <div className="gm-grid-2">
                            {day[mt].map((slot) => {
                              const options = (filteredRecipes || []).filter(
                                (r) =>
                                  r.mealType === slot.mealType &&
                                  (r.course || "main") === (slot.course || "main")
                              );
                              const slotIndex = (menu || []).findIndex((s) => s.id === slot.id);
                              const chosen = (recipes || []).find((r) => r.id === slot.recipeId);
                              return (
                                <div key={slot.id} className="gm-box">
                                  <div className="gm-subtle" style={{ marginBottom: 6, textTransform: "capitalize" }}>
                                    {slot.course}
                                  </div>
                                  <select
                                    className="gm-select"
                                    value={slot.recipeId}
                                    onChange={(e) => setMenuRecipe(slotIndex, e.target.value)}
                                  >
                                    <option value="">— Pick a recipe —</option>
                                    {options.map((r) => (
                                      <option key={r.id} value={r.id}>
                                        {r.name}{r.tags?.dutchOven ? " (DO)" : ""}
                                      </option>
                                    ))}
                                  </select>
                                  {chosen && (
                                    <div className="gm-subtle" style={{ marginTop: 6 }}>
                                      Serves {chosen.serves}. Scales to {scouts} scouts.
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Library */}
          <div className="gm-card gm-panel">
            <h2 className="gm-h2">
              Recipes Library {(filteredRecipes || []).length ? `(${filteredRecipes.length} shown)` : ""}
            </h2>
            <div className="gm-grid-2 gm-scroll" style={{ paddingRight: 6 }}>
              {(filteredRecipes || []).map((r) => (
                <div key={r.id} className="gm-box">
                  <div className="gm-row">
                    <div className="gm-bold">{r.name}</div>
                    <div className="gm-row">
                      <button className="gm-btn" onClick={() => toggleFavorite(r.id)}>
                        {favorites.includes(r.id) ? "★ Fav" : "☆ Fav"}
                      </button>
                      <button className="gm-btn" onClick={() => startEdit(r.id)}>Edit</button>
                      <button className="gm-btn" style={{ color: "#b91c1c", borderColor: "#ef4444" }} onClick={() => deleteRecipe(r.id)}>Delete</button>
                    </div>
                  </div>

                  <div className="gm-subtle" style={{ textTransform: "uppercase" }}>
                    {r.mealType} • {r.course}
                  </div>
                  <div style={{ marginTop: 6, display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {r.tags?.dutchOven && <Pill>DO</Pill>}
                    {r.tags?.backpacking && <Pill>Backpacking</Pill>}
                    {r.tags?.car && <Pill>Car</Pill>}
                    {r.tags?.canoe && <Pill>Canoe</Pill>}
                  </div>

                  <details style={{ marginTop: 8 }}>
                    <summary className="gm-bold" style={{ cursor: "pointer" }}>Details</summary>
                    <div style={{ marginTop: 6 }}>
                      <div className="gm-bold">Ingredients (per person)</div>
                      <ul style={{ marginLeft: 18 }}>
                        {(r.ingredients || []).map((ing, i) => (
                          <li key={i}>
                            {ing.item}: {ing.qtyPerPerson} {ing.unit}
                          </li>
                        ))}
                      </ul>
                      <div className="gm-bold" style={{ marginTop: 6 }}>Steps</div>
                      <ol style={{ marginLeft: 18 }}>
                        {(r.steps || []).map((s, i) => (
                          <li key={i}>{s}</li>
                        ))}
                      </ol>
                    </div>
                  </details>
                </div>
              ))}
            </div>
          </div>

          {/* Shopping List */}
          <div className="gm-card gm-panel">
            <h2 className="gm-h2">Shopping List</h2>
            <div className="gm-grid-2 gm-scroll">
              {shopping.map((it, i) => (
                <div key={i} className="gm-row">
                  <input type="checkbox" />
                  <span>{it.item}</span>
                  <span style={{ marginLeft: "auto" }} className="gm-subtle">
                    {Number(it.qty.toFixed(2))} {it.unit}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Duty Roster */}
          <div className="gm-card gm-panel">
            <h2 className="gm-h2">Duty Roster</h2>
            <div className="gm-scroll">
              <RosterTable
                names={ensureTen(names)}
                menu={menu}
                recipes={recipes}
                dayCount={dayCount}
              />
            </div>
          </div>
        </section>
      </main>

      {/* Print content */}
      <div style={{ display: "none" }} ref={printRef}>
        <h1>Troop Duty Roster + Meal Plan</h1>
        <div className="muted">
          Scouts: {scouts} · Camp: {["backpacking", "car", "canoe"].includes(campType) ? campType : "car"} ·
          Dutch oven: {includeDutchOven ? "Yes" : "No"} · Diet:{" "}
          {Object.keys(obj(diet)).filter((k) => diet[k]).join(", ") || "None"}
        </div>

        {menuByDay.map((day, dIdx) => (
          <div key={dIdx}>
            <h2>Day {dIdx + 1} Menu</h2>
            <table>
              <thead>
                <tr><th>Meal</th><th>Course</th><th>Recipe</th></tr>
              </thead>
              <tbody>
                {["breakfast", "lunch", "dinner"].flatMap((mt) =>
                  day[mt].map((m) => {
                    const r = (recipes || []).find((rr) => rr.id === m.recipeId);
                    return (
                      <tr key={m.id}>
                        <td style={{ textTransform: "capitalize" }}>{m.mealType}</td>
                        <td style={{ textTransform: "capitalize" }}>{m.course}</td>
                        <td>{r?.name || ""}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        ))}

        <h2>Duty Roster</h2>
        <RosterTable
          names={ensureTen(names)}
          menu={menu}
          recipes={recipes}
          printMode
          dayCount={dayCount}
        />

        <h2>Shopping List</h2>
        <table>
          <thead>
            <tr><th>Item</th><th>Qty</th><th>Unit</th></tr>
          </thead>
          <tbody>
            {shopping.map((it, i) => (
              <tr key={i}>
                <td>{it.item}</td>
                <td>{Number(it.qty.toFixed(2))}</td>
                <td>{it.unit}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <footer className="gm-container" style={{ paddingBottom: 24, textAlign: "center" }}>
        <span className="gm-subtle">Local fallback; cloud sync when Troop ID is set • Print via Export button</span>
      </footer>
    </div>
  );
}

// ---------------------------
// Duty roster helper
// ---------------------------
function RosterTable({ names = [], menu = [], recipes = [], printMode = false, dayCount = 0 }) {
  const roles = ["Grubmaster", "Asst. Grubmaster", "Fireman", "Quartermaster", "Cleanup"];

  const mains = React.useMemo(() => {
    const order = [];
    const byDay = {};
    (menu || []).forEach((s) => {
      if (s.course !== "main") return;
      const di = Number(s?.dayIndex);
      if (!Number.isInteger(di)) return;
      if (!byDay[di]) byDay[di] = [];
      byDay[di].push(s);
    });
    Object.keys(byDay)
      .map(Number)
      .sort((a, b) => a - b)
      .forEach((d) => {
        ["breakfast", "lunch", "dinner"].forEach((mt) => {
          (byDay[d] || [])
            .filter((x) => x.mealType === mt)
            .forEach((x) => order.push(x));
        });
      });
    return order;
  }, [menu]);

  const duty = mains.map((m, i) => {
    const assignment = {};
    roles.forEach((role, rIdx) => {
      const nlen = (names || []).length || 10;
      const who = (names || [])[((i + rIdx) % nlen)] || `Scout ${((i + rIdx) % nlen) + 1}`;
      assignment[role] = who;
    });
    return { ...m, assignment };
  });

  if (printMode) {
    return (
      <div>
        {[...new Set(duty.map((d) => d.dayIndex))].sort((a, b) => a - b).map((d) => (
          <div key={d}>
            <h3>Day {d + 1}</h3>
            <table>
              <thead>
                <tr>
                  <th>Meal</th>
                  <th>Main</th>
                  {roles.map((r) => <th key={r}>{r}</th>)}
                </tr>
              </thead>
              <tbody>
                {duty.filter((x) => x.dayIndex === d).map((x) => {
                  const r = (recipes || []).find((rr) => rr.id === x.recipeId);
                  return (
                    <tr key={x.id}>
                      <td style={{ textTransform: "capitalize" }}>{x.mealType}</td>
                      <td>{r?.name || "—"}</td>
                      {roles.map((role) => <td key={role}>{x.assignment[role]}</td>)}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="gm-stack">
      {Array.from({ length: dayCount }, (_, d) => d).map((d) => (
        <div key={d} className="gm-box">
          <div className="gm-bold" style={{ padding: "4px 6px" }}>Day {d + 1}</div>
          <div style={{ overflowX: "auto" }}>
            <table>
              <thead>
                <tr>
                  <th>Meal</th>
                  <th>Main</th>
                  {roles.map((r) => <th key={r}>{r}</th>)}
                </tr>
              </thead>
              <tbody>
                {duty.filter((x) => x.dayIndex === d).map((x) => {
                  const r = (recipes || []).find((rr) => rr.id === x.recipeId);
                  return (
                    <tr key={x.id}>
                      <td style={{ textTransform: "capitalize" }}>{x.mealType}</td>
                      <td>{r?.name || "—"}</td>
                      {roles.map((role) => <td key={role}>{x.assignment[role]}</td>)}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}
