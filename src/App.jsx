// src/App.jsx
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
} from "firebase/firestore";

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

// ---------- Small utils ----------
const uid = () => Math.random().toString(36).slice(2, 10);
const saveLS = (k, v) => localStorage.setItem(k, JSON.stringify(v));
const loadLS = (k, d) => {
  try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; }
};

// Normalize recipe and keep missing keys truly missing (no forced defaults for dutchOven/diet)
const normalizeRecipe = (r) => {
  const clean = { ...r };
  clean.tags = { ...(r?.tags || {}) };
  clean.diet = { ...(r?.diet || {}) };
  clean.ingredients = Array.isArray(r?.ingredients) ? r.ingredients : [];
  clean.steps = Array.isArray(r?.steps) ? r.steps : [];
  clean.mealType = r?.mealType || "dinner";   // breakfast | lunch | dinner
  clean.course = r?.course || "main";         // main | side | drink | dessert
  clean.name = r?.name || "Unnamed";
  clean.serves = r?.serves || 8;
  clean.id = r?.id || uid();
  return clean;
};

function addQty(map, key, qty = 0, unit = "") {
  const k = `${key}@@${unit}`.toLowerCase();
  map.set(k, { item: key, unit, qty: (map.get(k)?.qty || 0) + qty });
}

// ---------- Seed data (sample courses) ----------
const SEED_RECIPES_RAW = [
  // DINNER
  {
    id: uid(), name: "Chicken Pot Pie (DO)", mealType: "dinner", course: "main",
    tags: { dutchOven: true, car: true }, diet: { alphaGalSafe: true },
    ingredients: [
      { item: "boneless chicken thigh", qtyPerPerson: 0.25, unit: "lb" },
      { item: "frozen mixed vegetables", qtyPerPerson: 0.5, unit: "cup" },
      { item: "potatoes (diced)", qtyPerPerson: 0.3, unit: "lb" },
      { item: "gravy mix (chicken)", qtyPerPerson: 0.3, unit: "packet" },
      { item: "biscuit dough", qtyPerPerson: 1, unit: "biscuit" }
    ],
    steps: ["Brown chicken", "Add veg + gravy per packet", "Top w/ biscuits and bake in DO"]
  },
  {
    id: uid(), name: "Campfire Corn", mealType: "dinner", course: "side",
    tags: { car: true, canoe: true },
    ingredients: [{ item: "corn on the cob", qtyPerPerson: 1, unit: "ear" }],
    steps: ["Wrap corn in foil with butter/salt", "Roast over coals ~12–15 min"]
  },
  {
    id: uid(), name: "Lemonade", mealType: "dinner", course: "drink",
    tags: { car: true, canoe: true, backpacking: true },
    ingredients: [{ item: "lemonade mix", qtyPerPerson: 0.5, unit: "scoop" }],
    steps: ["Mix with water per instructions"]
  },
  {
    id: uid(), name: "Dutch Oven Cobbler", mealType: "dinner", course: "dessert",
    tags: { dutchOven: true, car: true },
    ingredients: [
      { item: "canned pie filling", qtyPerPerson: 0.4, unit: "cup" },
      { item: "cake mix", qtyPerPerson: 0.1, unit: "box" },
      { item: "butter", qtyPerPerson: 0.5, unit: "tbsp" },
    ],
    steps: ["Layer filling, dry mix, butter pats", "Bake in DO until bubbling + top browned"]
  },

  // LUNCH
  {
    id: uid(), name: "Chicken Caesar Wraps", mealType: "lunch", course: "main",
    tags: { car: true, canoe: true }, diet: { alphaGalSafe: true },
    ingredients: [
      { item: "tortilla (10\")", qtyPerPerson: 1, unit: "ea" },
      { item: "cooked chicken (diced)", qtyPerPerson: 0.25, unit: "lb" },
      { item: "romaine", qtyPerPerson: 1, unit: "cup" },
      { item: "Caesar dressing", qtyPerPerson: 1, unit: "tbsp" }
    ],
    steps: ["Assemble wraps"]
  },
  {
    id: uid(), name: "Chips", mealType: "lunch", course: "side",
    tags: { car: true, canoe: true },
    ingredients: [{ item: "chips", qtyPerPerson: 1, unit: "bag (snack)" }],
    steps: ["Serve with wraps"]
  },
  {
    id: uid(), name: "Water", mealType: "lunch", course: "drink",
    tags: { car: true, canoe: true, backpacking: true },
    ingredients: [{ item: "water", qtyPerPerson: 16, unit: "oz" }],
    steps: ["Hydrate!"]
  },

  // BREAKFAST
  {
    id: uid(), name: "Oatmeal Pack", mealType: "breakfast", course: "main",
    tags: { backpacking: true, car: true, canoe: true }, diet: { vegetarian: true, dairyFree: true },
    ingredients: [{ item: "instant oatmeal packet", qtyPerPerson: 1.5, unit: "packet" }],
    steps: ["Add hot water per packet", "Wait 2–3 min"]
  },
  {
    id: uid(), name: "Banana", mealType: "breakfast", course: "side",
    tags: { backpacking: true, car: true, canoe: true },
    ingredients: [{ item: "banana", qtyPerPerson: 1, unit: "ea" }],
    steps: ["Serve with oatmeal"]
  },
  {
    id: uid(), name: "Hot Cocoa", mealType: "breakfast", course: "drink",
    tags: { backpacking: true, car: true, canoe: true },
    ingredients: [{ item: "cocoa mix", qtyPerPerson: 1, unit: "packet" }],
    steps: ["Add to hot water and stir"]
  },
];
const SEED_RECIPES = SEED_RECIPES_RAW.map(normalizeRecipe);

// ---------- Small UI helpers ----------
const Pill = ({ children }) => (
  <span className="px-2 py-0.5 rounded-full text-xs bg-gray-100 border">{children}</span>
);

// ---------- Export / Import ----------
const downloadJSON = (filename, data) => {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
};

const buildRecipesExport = (recipes, meta = {}) => ({
  $schema: "https://example.com/schemas/grubmaster/recipes-v1.json",
  exporter: {
    app: "Scouts BSA Grubmaster Planner",
    version: "2.0.0",
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

// ======================================================
// Main App
// ======================================================
export default function App() {
  // Firebase singletons
  const { auth, db } = useMemo(() => getFirebase(), []);

  // Boot/auth
  const [phase, setPhase] = useState("boot"); // boot | signed-in | error
  const [err, setErr] = useState(null);
  const [user, setUser] = useState(null);
  const authed = !!user;

  useEffect(() => {
    const unsub = onAuthStateChanged(
      auth,
      (u) => { setUser(u || null); setPhase("signed-in"); },
      (e) => { console.error("[Auth] error", e); setErr(e); setPhase("error"); }
    );
    if (!auth.currentUser) {
      signInAnonymously(auth).catch((e) => { console.error("Anon sign-in failed", e); setErr(e); setPhase("error"); });
    }
    return () => unsub();
  }, [auth]);

  // Troop (enables Firestore sync)
  const [troopId, setTroopId] = useState(loadLS("gm_troop_id", ""));
  useEffect(() => saveLS("gm_troop_id", troopId), [troopId]);

  const paths = useMemo(() => {
    if (!db || !troopId) return {};
    const recipesCol = collection(db, "troops", troopId, "recipes");
    const settingsDoc = doc(db, "troops", troopId, "meta", "settings");
    const userDoc = user ? doc(db, "troops", troopId, "users", user.uid) : null;
    return { recipesCol, settingsDoc, userDoc };
  }, [db, troopId, user]);

  // Core UI state
  const [scouts, setScouts] = useState(8);
  const [meals, setMeals] = useState({ breakfast: 1, lunch: 1, dinner: 1 });

  const CAMP_TYPES = [
    { key: "backpacking", label: "Backpacking" },
    { key: "car", label: "Car camping" },
    { key: "canoe", label: "Canoe/float" },
  ];
  const [campType, setCampType] = useState("car");

  // ⬇️ As requested: DO NOT default any food restrictions
  const DIETS = [
    { key: "alphaGalSafe", label: "Alpha-gal safe (no mammal products)" },
    { key: "vegetarian", label: "Vegetarian" },
    { key: "vegan", label: "Vegan" },
    { key: "glutenFree", label: "Gluten-free" },
    { key: "nutFree", label: "Nut-free" },
    { key: "dairyFree", label: "Dairy-free" },
  ];
  const [diet, setDiet] = useState({}); // <- no defaults checked

  // ⬇️ Do not “preselect” dutch oven anywhere (filters use tags strictly; draft doesn’t default dutchOven)
  // Recipes/names/favorites
  const [recipes, setRecipes] = useState(() => {
    const ls = loadLS("gm_recipes", SEED_RECIPES);
    return Array.isArray(ls) ? ls.map(normalizeRecipe) : SEED_RECIPES;
  });
  const [names, setNames] = useState(loadLS("gm_names", ["Patrol A", "Patrol B", "Patrol C"]));
  const [favorites, setFavorites] = useState(loadLS("gm_favorites", []));

  useEffect(() => saveLS("gm_recipes", recipes), [recipes]);
  useEffect(() => saveLS("gm_names", names), [names]);
  useEffect(() => saveLS("gm_favorites", favorites), [favorites]);

  const [syncInfo, setSyncInfo] = useState({ status: "local-only", last: null });

  // Cloud subscriptions (when possible)
  useEffect(() => {
    if (!authed || !troopId || !paths.recipesCol) {
      setSyncInfo((s) => ({ ...s, status: "local-only" }));
      return;
    }
    const subs = [];

    subs.push(
      onSnapshot(query(paths.recipesCol, orderBy("createdAt", "asc")), (snap) => {
        const arr = snap.docs.map((d) => normalizeRecipe({ id: d.id, ...d.data() }));
        if (arr.length) setRecipes(arr);
        setSyncInfo({ status: "online", last: new Date().toISOString() });
      })
    );

    if (paths.settingsDoc) {
      subs.push(
        onSnapshot(paths.settingsDoc, (d) => {
          const data = d.data();
          if (Array.isArray(data?.names)) setNames(data.names);
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

  // Save names to cloud when changed
  useEffect(() => {
    const save = async () => {
      if (!authed || !troopId || !paths.settingsDoc) return;
      await setDoc(paths.settingsDoc, { names }, { merge: true });
      setSyncInfo({ status: "online", last: new Date().toISOString() });
    };
    save();
  }, [names, authed, troopId, paths.settingsDoc]);

  // Filters
  const filteredRecipes = useMemo(() => {
    return recipes.filter((r) => {
      const t = r.tags || {};
      if (campType === "backpacking" && !t.backpacking) return false;
      if (campType === "car" && !(t.car || t.backpacking || t.canoe)) return false;
      if (campType === "canoe" && !(t.canoe || t.car || t.backpacking)) return false;

      // diet (none selected by default)
      for (const k of Object.keys(diet)) if (diet[k] && !r.diet?.[k]) return false;
      return true;
    });
  }, [recipes, campType, diet]);

  // -----------------------------
  // Auto Menu with Courses
  // For each meal occurrence: main + side + drink (+ dessert if dinner)
  // -----------------------------
  const COURSE_ORDER = ["main", "side", "drink"]; // always included
  const [menu, setMenu] = useState([]); // [{ id, mealType, course, recipeId }]
  useEffect(() => {
    const need = [];
    ["breakfast", "lunch", "dinner"].forEach((mt) => {
      for (let i = 0; i < (meals[mt] || 0); i++) {
        const courses = [...COURSE_ORDER];
        if (mt === "dinner") courses.push("dessert");
        courses.forEach((course) => need.push({ mt, course }));
      }
    });

    const byMealCourse = (mt, course) =>
      filteredRecipes.filter((r) => r.mealType === mt && r.course === course);

    const chosen = [];
    const favIds = new Set(favorites);
    const used = new Set();

    for (const slot of need) {
      const pool = byMealCourse(slot.mt, slot.course).sort(
        (a, b) => Number(favIds.has(b.id)) - Number(favIds.has(a.id))
      );
      const pick = pool.find((r) => !used.has(`${slot.mt}:${slot.course}:${r.id}`)) || pool[0];
      if (pick) {
        used.add(`${slot.mt}:${slot.course}:${pick.id}`);
        chosen.push({ id: uid(), mealType: slot.mt, course: slot.course, recipeId: pick.id });
      } else {
        // placeholder (no recipe found)
        chosen.push({ id: uid(), mealType: slot.mt, course: slot.course, recipeId: null });
      }
    }

    setMenu(chosen);
  }, [filteredRecipes, meals, favorites]);

  // Shopping list (from all picked menu recipes)
  const shopping = useMemo(() => {
    const map = new Map();
    const selected = menu
      .map((m) => recipes.find((r) => r.id === m.recipeId))
      .filter(Boolean);
    selected.forEach((r) => {
      r.ingredients.forEach((ing) => {
        addQty(map, ing.item, (ing.qtyPerPerson || 0) * scouts, ing.unit || "");
      });
    });
    addQty(map, "paper towels", Math.ceil(scouts / 4), "roll");
    addQty(map, "trash bags", 2, "ea");
    return Array.from(map.values()).sort((a, b) => a.item.localeCompare(b.item));
  }, [menu, recipes, scouts]);

  // Duty roster
  const roles = ["Grubmaster", "Asst. Grubmaster", "Fireman", "Quartermaster", "Cleanup"];
  const duty = useMemo(() => {
    const mealsFlat = menu
      .filter((m) => m.course === "main") // roster per meal occurrence; use "main" entries as rows
      .map((m, idx) => ({ ...m, idx }));
    return mealsFlat.map((m, i) => {
      const assignment = {};
      roles.forEach((role, rIdx) => {
        const who = names[(i + rIdx) % names.length] || `Patrol ${rIdx + 1}`;
        assignment[role] = who;
      });
      return { ...m, assignment };
    });
  }, [menu, names]);

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
    const payload = buildRecipesExport(recipes, { troopId: troopId || "local", user: user?.uid || "anon" });
    downloadJSON(`recipes-export-${new Date().toISOString()}.json`, payload);
  };

  const handleImportJSONClick = () => importInputRef.current?.click();

  const handleImportJSON = async (file) => {
    if (!file) return;
    setImportBusy(true); setImportMsg("");
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const arr = Array.isArray(data?.recipes) ? data.recipes : Array.isArray(data) ? data : null;
      if (!arr) throw new Error("Invalid file: expected { recipes: [...] } or an array.");
      const incoming = arr.map(normalizeRecipe);

      // Local upsert
      setRecipes((prev) => {
        const map = new Map(prev.map((r) => [r.id, r]));
        incoming.forEach((r) => map.set(r.id, r));
        return Array.from(map.values());
      });

      // Best-effort cloud upsert
      if (authed && troopId && paths.recipesCol) {
        await Promise.all(
          incoming.map((r) =>
            setDoc(doc(paths.recipesCol, r.id), { ...r, updatedAt: serverTimestamp() }, { merge: true })
          )
        );
      }

      setImportMsg(`Imported ${incoming.length} recipe(s).`);
    } catch (e) {
      setImportMsg(`Import failed: ${e?.message || e}`);
    } finally {
      setImportBusy(false);
      if (importInputRef.current) importInputRef.current.value = "";
    }
  };

  // Add recipe (no default dutch oven or diet selections)
  const [draft, setDraft] = useState({
    name: "",
    mealType: "dinner",
    course: "main",
    serves: 8,
    tags: {},   // <- empty: no dutchOven default
    diet: {},   // <- empty: no restrictions default
    ingredients: [{ item: "", qtyPerPerson: 1, unit: "ea" }],
    steps: [""],
  });

  const addIngredientRow = () =>
    setDraft((d) => ({ ...d, ingredients: [...d.ingredients, { item: "", qtyPerPerson: 1, unit: "ea" }] }));
  const addStepRow = () => setDraft((d) => ({ ...d, steps: [...d.steps, ""] }));

  const saveRecipe = async () => {
    if (!draft.name.trim()) return alert("Recipe name required");
    const newR = normalizeRecipe({ ...draft, id: uid() });

    if (authed && troopId && paths.recipesCol) {
      await addDoc(paths.recipesCol, { ...newR, createdAt: serverTimestamp(), createdBy: user?.uid || "anon" });
      setSyncInfo({ status: "online", last: new Date().toISOString() });
    } else {
      setRecipes((r) => [newR, ...r]);
    }

    setDraft({
      name: "",
      mealType: "dinner",
      course: "main",
      serves: 8,
      tags: {},
      diet: {},
      ingredients: [{ item: "", qtyPerPerson: 1, unit: "ea" }],
      steps: [""],
    });
  };

  const setFavoritesCloud = async (arr) => {
    if (!authed || !troopId || !paths.userDoc) return;
    await setDoc(paths.userDoc, { favorites: arr }, { merge: true });
    setSyncInfo({ status: "online", last: new Date().toISOString() });
  };
  const toggleFavorite = async (id) => {
    setFavorites((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [id, ...prev];
      setFavoritesCloud(next);
      return next;
    });
  };

  // Boot/Error
  if (phase === "boot") {
    return <div className="min-h-screen flex items-center justify-center text-slate-700">Initializing…</div>;
  }
  if (phase === "error") {
    return (
      <div className="min-h-screen p-6 text-slate-800">
        <h1 className="text-xl font-semibold mb-2">⚠️ Firebase error</h1>
        <pre className="p-3 bg-slate-100 rounded border overflow-auto">{String(err?.message || err)}</pre>
        <p className="mt-2 text-sm">Check Vercel env vars and enable Anonymous Sign-in in Firebase Auth.</p>
      </div>
    );
  }

  // UI
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white text-slate-900">
      <header className="sticky top-0 z-10 backdrop-blur bg-white/70 border-b">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <h1 className="text-xl font-bold">Scouts BSA Grubmaster Planner</h1>

          <div className="flex items-center gap-2 text-sm">
            <div className="hidden md:flex items-center gap-2 px-2 py-1 rounded border bg-white">
              <span>Troop ID:</span>
              <input
                className="w-28 border rounded px-2 py-1"
                placeholder="e.g. 194"
                value={troopId}
                onChange={(e) => setTroopId(e.target.value.trim())}
              />
            </div>

            <span className="px-2 py-1 rounded border bg-white">
              {authed ? "Connected (anonymous)" : "Connecting…"}
            </span>

            <button
              onClick={handlePrint}
              className="px-3 py-1.5 rounded-lg bg-slate-900 text-white hover:bg-slate-800"
            >
              Export PDF
            </button>
            <button onClick={handleExportJSON} className="px-3 py-1.5 rounded-lg border">
              Export JSON
            </button>
            <button onClick={handleImportJSONClick} className="px-3 py-1.5 rounded-lg border">
              Import JSON
            </button>
            <input
              ref={importInputRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => handleImportJSON(e.target.files?.[0] || null)}
            />
          </div>
        </div>

        <div className="max-w-6xl mx-auto px-4 pb-2 text-xs text-slate-600">
          <span className="mr-2">Sync:</span>
          <span
            className={
              syncInfo.status === "online"
                ? "text-emerald-700"
                : syncInfo.status === "local-only"
                ? "text-amber-700"
                : "text-slate-500"
            }
          >
            {syncInfo.status} {syncInfo.last ? `• ${new Date(syncInfo.last).toLocaleTimeString()}` : ""}
          </span>
          {!troopId && <span className="ml-3 text-amber-700">Enter a Troop ID to share recipes across your troop.</span>}
          {importBusy && <span className="ml-3">Importing…</span>}
          {importMsg && <span className="ml-3">{importMsg}</span>}
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6 grid md:grid-cols-3 gap-6">
        {/* Left column: Inputs */}
        <section className="md:col-span-1 space-y-6">
          <div className="p-4 bg-white rounded-2xl shadow">
            <h2 className="text-lg font-semibold mb-3">Trip Setup</h2>

            <label className="block text-sm mb-1">Number of Scouts</label>
            <input
              type="number" min={1} value={scouts}
              onChange={(e) => setScouts(Math.max(1, Number(e.target.value) || 1))}
              className="w-full border rounded-lg px-3 py-2 mb-3"
            />

            <div className="grid grid-cols-3 gap-3">
              {["breakfast", "lunch", "dinner"].map((mt) => (
                <div key={mt}>
                  <label className="block text-sm capitalize">{mt}</label>
                  <input
                    type="number" min={0} value={meals[mt]}
                    onChange={(e) =>
                      setMeals((m) => ({ ...m, [mt]: Math.max(0, Number(e.target.value) || 0) }))
                    }
                    className="w-full border rounded-lg px-3 py-2"
                  />
                </div>
              ))}
            </div>

            <label className="block text-sm mt-3">Camp Type</label>
            <select
              value={campType}
              onChange={(e) => setCampType(e.target.value)}
              className="w-full border rounded-lg px-3 py-2"
            >
              {CAMP_TYPES.map((ct) => (
                <option key={ct.key} value={ct.key}>{ct.label}</option>
              ))}
            </select>

            <div className="mt-3">
              <div className="text-sm font-medium mb-1">Dietary Restrictions</div>
              <div className="grid grid-cols-1 gap-2">
                {DIETS.map((d) => (
                  <label key={d.key} className="inline-flex items-center gap-2">
                    <input
                      type="checkbox" checked={!!diet[d.key]}
                      onChange={(e) => setDiet((prev) => ({ ...prev, [d.key]: e.target.checked }))}
                    />
                    <span>{d.label}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          <div className="p-4 bg-white rounded-2xl shadow">
            <h2 className="text-lg font-semibold mb-3">Troop & Roster</h2>
            <label className="text-sm">Troop ID</label>
            <input
              className="w-full border rounded-lg px-3 py-2"
              placeholder="e.g. 194"
              value={troopId}
              onChange={(e) => setTroopId(e.target.value.trim())}
            />
            <p className="text-xs text-slate-500 mt-1">All anonymous-auth users with this Troop ID will share recipes.</p>
            <h3 className="text-sm font-medium mt-3">Patrols / Names (shared)</h3>
            <textarea
              className="w-full border rounded-lg px-3 py-2" rows={4}
              value={names.join("\n")}
              onChange={(e) =>
                setNames(
                  e.target.value.split(/\n+/).map((s) => s.trim()).filter(Boolean)
                )
              }
            />
            <p className="text-xs text-slate-500 mt-1">One line per name or patrol. Saved troop-wide when Troop ID is set.</p>
          </div>

          <div className="p-4 bg-white rounded-2xl shadow">
            <h2 className="text-lg font-semibold mb-3">Add Recipe</h2>
            <div className="grid grid-cols-1 gap-2">
              <input
                placeholder="Recipe name" className="border rounded-lg px-3 py-2"
                value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
              />

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-sm">Meal</label>
                  <select
                    className="w-full border rounded-lg px-3 py-2"
                    value={draft.mealType}
                    onChange={(e) => setDraft((d) => ({ ...d, mealType: e.target.value }))}
                  >
                    <option value="breakfast">Breakfast</option>
                    <option value="lunch">Lunch</option>
                    <option value="dinner">Dinner</option>
                  </select>
                </div>
                <div>
                  <label className="text-sm">Course</label>
                  <select
                    className="w-full border rounded-lg px-3 py-2"
                    value={draft.course}
                    onChange={(e) => setDraft((d) => ({ ...d, course: e.target.value }))}
                  >
                    <option value="main">Main</option>
                    <option value="side">Side</option>
                    <option value="drink">Drink</option>
                    <option value="dessert">Dessert</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-sm">Serves</label>
                  <input
                    type="number" className="w-full border rounded-lg px-3 py-2"
                    value={draft.serves}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, serves: Math.max(1, Number(e.target.value) || 1) }))
                    }
                  />
                </div>
                <div>
                  <label className="text-sm">Tags</label>
                  <div className="flex gap-2 items-center text-sm">
                    <label className="inline-flex items-center gap-1">
                      <input
                        type="checkbox" checked={!!draft.tags.backpacking}
                        onChange={(e) => setDraft((d) => ({ ...d, tags: { ...d.tags, backpacking: e.target.checked } }))}
                      />Backpacking
                    </label>
                    <label className="inline-flex items-center gap-1">
                      <input
                        type="checkbox" checked={!!draft.tags.car}
                        onChange={(e) => setDraft((d) => ({ ...d, tags: { ...d.tags, car: e.target.checked } }))}
                      />Car
                    </label>
                    <label className="inline-flex items-center gap-1">
                      <input
                        type="checkbox" checked={!!draft.tags.dutchOven}
                        onChange={(e) => setDraft((d) => ({ ...d, tags: { ...d.tags, dutchOven: e.target.checked } }))}
                      />Dutch
                    </label>
                    <label className="inline-flex items-center gap-1">
                      <input
                        type="checkbox" checked={!!draft.tags.canoe}
                        onChange={(e) => setDraft((d) => ({ ...d, tags: { ...d.tags, canoe: e.target.checked } }))}
                      />Canoe
                    </label>
                  </div>
                </div>
              </div>

              <div>
                <div className="text-sm">Diet suitability</div>
                <div className="flex flex-wrap gap-3 text-sm mt-1">
                  {DIETS.map((dk) => (
                    <label key={dk.key} className="inline-flex items-center gap-1">
                      <input
                        type="checkbox" checked={!!draft.diet[dk.key]}
                        onChange={(e) => setDraft((d) => ({ ...d, diet: { ...d.diet, [dk.key]: e.target.checked } }))}
                      />
                      {dk.label.split(" (")[0]}
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <div className="text-sm font-medium">Ingredients (per person)</div>
                {draft.ingredients.map((ing, i) => (
                  <div key={i} className="grid grid-cols-5 gap-2 mt-1">
                    <input
                      className="col-span-3 border rounded-lg px-2 py-1"
                      placeholder="item" value={ing.item}
                      onChange={(e) =>
                        setDraft((d) => {
                          const a = [...d.ingredients]; a[i] = { ...a[i], item: e.target.value };
                          return { ...d, ingredients: a };
                        })
                      }
                    />
                    <input
                      type="number" step="0.05" className="border rounded-lg px-2 py-1"
                      placeholder="qty" value={ing.qtyPerPerson}
                      onChange={(e) =>
                        setDraft((d) => {
                          const a = [...d.ingredients]; a[i] = { ...a[i], qtyPerPerson: Number(e.target.value) || 0 };
                          return { ...d, ingredients: a };
                        })
                      }
                    />
                    <input
                      className="border rounded-lg px-2 py-1" placeholder="unit" value={ing.unit}
                      onChange={(e) =>
                        setDraft((d) => {
                          const a = [...d.ingredients]; a[i] = { ...a[i], unit: e.target.value };
                          return { ...d, ingredients: a };
                        })
                      }
                    />
                  </div>
                ))}
                <button onClick={addIngredientRow} className="mt-2 text-sm px-2 py-1 rounded border">+ Ingredient</button>
              </div>

              <div>
                <div className="text-sm font-medium">Steps</div>
                {draft.steps.map((st, i) => (
                  <input
                    key={i} className="w-full border rounded-lg px-2 py-1 mt-1"
                    placeholder={`Step ${i + 1}`} value={st}
                    onChange={(e) =>
                      setDraft((d) => {
                        const a = [...d.steps]; a[i] = e.target.value;
                        return { ...d, steps: a };
                      })
                    }
                  />
                ))}
                <button onClick={addStepRow} className="mt-2 text-sm px-2 py-1 rounded border">+ Step</button>
              </div>

              <div className="flex items-center justify-between">
                <div className="text-xs text-slate-500">
                  {troopId ? "Saving to troop cloud when connected." : "No Troop ID set: saving locally only."}
                </div>
                <button
                  onClick={saveRecipe}
                  className={`px-3 py-1.5 rounded-lg text-white ${troopId ? "bg-emerald-600 hover:bg-emerald-700" : "bg-slate-400"}`}
                  title={troopId ? "" : "Tip: set a Troop ID to sync to cloud"}
                >
                  Save Recipe
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* Right column: Planner */}
        <section className="md:col-span-2 space-y-6">
          {/* Menu */}
          <div className="p-4 bg-white rounded-2xl shadow">
            <h2 className="text-lg font-semibold mb-3">Menu (auto-generated by course)</h2>
            {["breakfast", "lunch", "dinner"].map((mt) => {
              const courses = mt === "dinner" ? [...COURSE_ORDER, "dessert"] : COURSE_ORDER;
              const rows = menu.filter((m) => m.mealType === mt);
              if (rows.length === 0) return null;

              // Group each “occurrence” of the meal into course slots in order
              const perOccurrence = [];
              for (let i = 0; i < (meals[mt] || 0); i++) {
                const slice = courses.map((course) =>
                  rows.find((r, idx) => r.course === course && Math.floor(idx / courses.length) === i)
                );
                perOccurrence.push(slice);
              }

              return (
                <div key={mt} className="mb-5">
                  <div className="text-base font-semibold capitalize mb-2">{mt}</div>
                  <div className="grid md:grid-cols-2 gap-3">
                    {perOccurrence.map((occ, occIdx) => (
                      <div key={occIdx} className="border rounded-xl p-3 space-y-2">
                        {occ.map((slot, j) => {
                          const course = courses[j];
                          const r = slot?.recipeId ? recipes.find((x) => x.id === slot.recipeId) : null;
                          const fav = r ? favorites.includes(r.id) : false;
                          return (
                            <div key={j} className="border rounded-lg p-2">
                              <div className="flex items-center justify-between">
                                <div className="text-xs uppercase tracking-wide text-slate-500">{course}</div>
                                {!!r && (
                                  <button
                                    className={`text-xs px-2 py-0.5 rounded-full border ${fav ? "bg-yellow-100 border-yellow-300" : ""}`}
                                    onClick={() => toggleFavorite(r.id)}
                                  >
                                    {fav ? "★ Fav" : "☆ Fav"}
                                  </button>
                                )}
                              </div>
                              <div className="text-sm font-semibold mt-1">{r?.name || "—"}</div>
                              {r && (
                                <div className="flex gap-2 flex-wrap mt-1 text-xs">
                                  {r.tags?.dutchOven && <Pill>DO</Pill>}
                                  {r.tags?.backpacking && <Pill>Backpacking</Pill>}
                                  {r.tags?.car && <Pill>Car</Pill>}
                                  {r.tags?.canoe && <Pill>Canoe</Pill>}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Library */}
          <div className="p-4 bg-white rounded-2xl shadow">
            <h2 className="text-lg font-semibold mb-3">
              Recipes Library ({filteredRecipes.length} shown)
            </h2>
            <div className="grid md:grid-cols-2 gap-3 max-h-96 overflow-y-auto pr-1">
              {filteredRecipes.map((r) => (
                <div key={r.id} className="border rounded-xl p-3">
                  <div className="flex items-center justify-between">
                    <div className="font-semibold">{r.name}</div>
                    <button className="text-xs px-2 py-0.5 rounded-full border" onClick={() => toggleFavorite(r.id)}>
                      {favorites.includes(r.id) ? "★ Fav" : "☆ Fav"}
                    </button>
                  </div>
                  <div className="text-xs uppercase tracking-wide text-slate-500">
                    {r.mealType} • {r.course}
                  </div>
                  <div className="mt-1 flex gap-2 flex-wrap">
                    {r.tags?.dutchOven && <Pill>DO</Pill>}
                    {r.tags?.backpacking && <Pill>Backpacking</Pill>}
                    {r.tags?.car && <Pill>Car</Pill>}
                    {r.tags?.canoe && <Pill>Canoe</Pill>}
                  </div>
                  <details className="text-sm mt-2">
                    <summary className="cursor-pointer">Details</summary>
                    <div className="mt-1">
                      <div className="font-medium">Ingredients (per person)</div>
                      <ul className="list-disc ml-5">
                        {r.ingredients.map((ing, i) => (
                          <li key={i}>
                            {ing.item}: {ing.qtyPerPerson} {ing.unit}
                          </li>
                        ))}
                      </ul>
                      <div className="font-medium mt-1">Steps</div>
                      <ol className="list-decimal ml-5">
                        {r.steps.map((s, i) => (
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
          <div className="p-4 bg-white rounded-2xl shadow">
            <h2 className="text-lg font-semibold mb-3">Shopping List</h2>
            <div className="grid md:grid-cols-2 gap-3">
              {shopping.map((it, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input type="checkbox" className="w-4 h-4" />
                  <span>{it.item}</span>
                  <span className="ml-auto text-sm text-slate-600">
                    {Number(it.qty.toFixed(2))} {it.unit}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Duty Roster */}
          <div className="p-4 bg-white rounded-2xl shadow">
            <h2 className="text-lg font-semibold mb-3">Duty Roster</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th className="border px-2 py-1 text-left">Meal</th>
                    <th className="border px-2 py-1 text-left">Main</th>
                    {roles.map((r) => (
                      <th key={r} className="border px-2 py-1 text-left">{r}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {duty.map((d) => {
                    const r = recipes.find((x) => x.id === d.recipeId);
                    return (
                      <tr key={d.id}>
                        <td className="border px-2 py-1 cap">{d.mealType}</td>
                        <td className="border px-2 py-1">{r?.name || "—"}</td>
                        {roles.map((role) => (
                          <td key={role} className="border px-2 py-1">
                            {d.assignment[role]}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </main>

      {/* Print content */}
      <div className="hidden" ref={printRef}>
        <h1>Troop Meal Plan by Course</h1>
        <div className="muted">
          Scouts: {scouts} • Diet: {Object.keys(diet).filter((k) => diet[k]).join(", ") || "None"}
        </div>

        <h2>Menu</h2>
        <table>
          <thead>
            <tr>
              <th>Meal</th><th>Course</th><th>Recipe</th>
            </tr>
          </thead>
        <tbody>
          {menu.map((m) => {
            const r = recipes.find((x) => x.id === m.recipeId);
            return (
              <tr key={m.id}>
                <td className="cap">{m.mealType}</td>
                <td className="cap">{m.course}</td>
                <td>{r?.name || "—"}</td>
              </tr>
            );
          })}
        </tbody>
        </table>

        <h2>Duty Roster</h2>
        <table>
          <thead>
            <tr>
              <th>Meal</th><th>Main</th>
              {roles.map((r) => (<th key={r}>{r}</th>))}
            </tr>
          </thead>
          <tbody>
            {duty.map((d) => {
              const r = recipes.find((x) => x.id === d.recipeId);
              return (
                <tr key={d.id}>
                  <td className="cap">{d.mealType}</td>
                  <td>{r?.name || "—"}</td>
                  {roles.map((role) => (<td key={role}>{d.assignment[role]}</td>))}
                </tr>
              );
            })}
          </tbody>
        </table>

        <h2>Shopping List</h2>
        <table>
          <thead><tr><th>Item</th><th>Qty</th><th>Unit</th></tr></thead>
          <tbody>
            {shopping.map((it, i) => (
              <tr key={i}><td>{it.item}</td><td>{Number(it.qty.toFixed(2))}</td><td>{it.unit}</td></tr>
            ))}
          </tbody>
        </table>
      </div>

      <footer className="max-w-6xl mx-auto px-4 pb-10 text-center text-xs text-slate-500">
        Local fallback; cloud sync when Troop ID is set • Print via Export button
      </footer>
    </div>
  );
}
