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
  deleteDoc,
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

// ---------------------------
// Utilities & Local Storage
// ---------------------------
const uid = () => Math.random().toString(36).slice(2, 10);
const saveLS = (k, v) => localStorage.setItem(k, JSON.stringify(v));
const loadLS = (k, d) => {
  try {
    const v = JSON.parse(localStorage.getItem(k));
    return v ?? d;
  } catch {
    return d;
  }
};

// Normalize to keep UI safe (no defaulting diet/tags to include dutchOven)
const normalizeRecipe = (r) => {
  const clean = { ...r };
  clean.tags = { ...(r?.tags || {}) }; // leave absent keys absent
  clean.diet = { ...(r?.diet || {}) };
  clean.ingredients = Array.isArray(r?.ingredients) ? r.ingredients : [];
  clean.steps = Array.isArray(r?.steps) ? r.steps : [];
  clean.mealType = r?.mealType || "dinner";
  clean.course = r?.course || "main"; // main | side | drink | dessert
  clean.name = r?.name || "Unnamed";
  clean.serves = r?.serves || 8;
  clean.id = r?.id || uid();
  return clean;
};

// ---------- Seed data (simple, course-aware) ----------
const SEED = [
  normalizeRecipe({
    id: uid(),
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
    steps: ["Brown chicken", "Add veg + gravy", "Top with biscuits, bake 20–25m"],
  }),
  normalizeRecipe({
    id: uid(),
    name: "Campfire Corn",
    mealType: "dinner",
    course: "side",
    tags: { car: true, canoe: true },
    ingredients: [{ item: "corn on the cob", qtyPerPerson: 1, unit: "ear" }],
    steps: ["Wrap in foil w/ butter + salt", "Roast over coals ~12–15m"],
  }),
  normalizeRecipe({
    id: uid(),
    name: "Lemonade",
    mealType: "dinner",
    course: "drink",
    tags: { backpacking: true, car: true, canoe: true },
    ingredients: [{ item: "lemonade mix", qtyPerPerson: 0.5, unit: "scoop" }],
    steps: ["Mix with water per instructions"],
  }),
  normalizeRecipe({
    id: uid(),
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
    id: uid(),
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
    id: uid(),
    name: "Banana",
    mealType: "breakfast",
    course: "side",
    tags: { backpacking: true, car: true, canoe: true },
    ingredients: [{ item: "banana", qtyPerPerson: 1, unit: "ea" }],
    steps: ["Serve with oatmeal"],
  }),
  normalizeRecipe({
    id: uid(),
    name: "Hot Cocoa",
    mealType: "breakfast",
    course: "drink",
    tags: { backpacking: true, car: true, canoe: true },
    ingredients: [{ item: "cocoa mix", qtyPerPerson: 1, unit: "packet" }],
    steps: ["Add to hot water & stir"],
  }),
  normalizeRecipe({
    id: uid(),
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
    id: uid(),
    name: "Chips",
    mealType: "lunch",
    course: "side",
    tags: { car: true, canoe: true },
    ingredients: [{ item: "chips", qtyPerPerson: 1, unit: "bag (snack)" }],
    steps: ["Serve with sandwiches"],
  }),
  normalizeRecipe({
    id: uid(),
    name: "Water",
    mealType: "lunch",
    course: "drink",
    tags: { backpacking: true, car: true, canoe: true },
    ingredients: [{ item: "water", qtyPerPerson: 16, unit: "oz" }],
    steps: ["Hydrate!"],
  }),
];

// ------------------------------------
// Small Presentational Helper
// ------------------------------------
const Pill = ({ children }) => (
  <span className="px-2 py-0.5 rounded-full text-xs bg-gray-100 border">{children}</span>
);

// ------------------------------------
// Recipe Form (Add/Edit)
// ------------------------------------
function RecipeForm({ initial, onCancel, onSave, dietsList }) {
  const [draft, setDraft] = useState(
    initial ||
      normalizeRecipe({
        id: uid(),
        name: "",
        mealType: "dinner",
        course: "main",
        serves: 8,
        tags: {}, // no dutch oven default
        diet: {}, // no restrictions default
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
    <div className="p-4 bg-white rounded-2xl shadow">
      <h2 className="text-lg font-semibold mb-3">{initial ? "Edit Recipe" : "Add Recipe"}</h2>
      <div className="grid grid-cols-1 gap-2">
        <input
          className="border rounded-lg px-3 py-2"
          placeholder="Recipe name"
          value={draft.name}
          onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
        />
        <div className="grid grid-cols-3 gap-2">
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
          <div>
            <label className="text-sm">Serves</label>
            <input
              type="number"
              className="w-full border rounded-lg px-3 py-2"
              value={draft.serves}
              onChange={(e) =>
                setDraft((d) => ({ ...d, serves: Math.max(1, Number(e.target.value) || 1) }))
              }
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-sm">Tags</label>
            <div className="flex gap-2 items-center text-sm mt-1 flex-wrap">
              {["backpacking", "car", "canoe", "dutchOven"].map((k) => (
                <label key={k} className="inline-flex items-center gap-1">
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
            <label className="text-sm">Diet suitability</label>
            <div className="flex gap-3 items-center text-sm mt-1 flex-wrap">
              {dietsList.map((dk) => (
                <label key={dk.key} className="inline-flex items-center gap-1">
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
          <div className="text-sm font-medium">Ingredients (per person)</div>
          {draft.ingredients.map((ing, i) => (
            <div key={i} className="grid grid-cols-5 gap-2 mt-1">
              <input
                className="col-span-3 border rounded-lg px-2 py-1"
                placeholder="item"
                value={ing.item}
                onChange={(e) => updateIng(i, { item: e.target.value })}
              />
              <input
                type="number"
                step="0.05"
                className="border rounded-lg px-2 py-1"
                placeholder="qty"
                value={ing.qtyPerPerson}
                onChange={(e) => updateIng(i, { qtyPerPerson: Number(e.target.value) || 0 })}
              />
              <input
                className="border rounded-lg px-2 py-1"
                placeholder="unit"
                value={ing.unit}
                onChange={(e) => updateIng(i, { unit: e.target.value })}
              />
            </div>
          ))}
          <button onClick={addIng} className="mt-2 text-sm px-2 py-1 rounded border">
            + Ingredient
          </button>
        </div>

        <div>
          <div className="text-sm font-medium">Steps</div>
          {draft.steps.map((st, i) => (
            <input
              key={i}
              className="w-full border rounded-lg px-2 py-1 mt-1"
              placeholder={`Step ${i + 1}`}
              value={st}
              onChange={(e) => updateStep(i, e.target.value)}
            />
          ))}
          <button onClick={addStep} className="mt-2 text-sm px-2 py-1 rounded border">
            + Step
          </button>
        </div>

        <div className="flex items-center justify-end gap-2">
          <button onClick={onCancel} className="px-3 py-1.5 rounded-lg border">
            Cancel
          </button>
          <button onClick={submit} className="px-3 py-1.5 rounded-lg text-white bg-emerald-600">
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------- Export / Import helpers ----------
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

// ------------------------------------
// Main App
// ------------------------------------
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
  const [troopId, setTroopId] = useState(loadLS("gm_troop_id", ""));
  useEffect(() => saveLS("gm_troop_id", troopId), [troopId]);

  const paths = useMemo(() => {
    if (!db || !troopId) return {};
    const recipesCol = collection(db, "troops", troopId, "recipes");
    const settingsDoc = doc(db, "troops", troopId, "meta", "settings");
    const userDoc = user ? doc(db, "troops", troopId, "users", user.uid) : null;
    return { recipesCol, settingsDoc, userDoc };
  }, [db, troopId, user]);

  // Trip setup
  const [scouts, setScouts] = useState(8);
  const [meals, setMeals] = useState({ breakfast: 2, lunch: 2, dinner: 2 });
  const [campType, setCampType] = useState("car");

  // Dutch oven filter (radio; default = No)
  const [includeDutchOven, setIncludeDutchOven] = useState(false);

  // Diets (no defaults selected)
  const DIETS = [
    { key: "alphaGalSafe", label: "Alpha-gal safe (no mammal products)" },
    { key: "vegetarian", label: "Vegetarian" },
    { key: "vegan", label: "Vegan" },
    { key: "glutenFree", label: "Gluten-free" },
    { key: "nutFree", label: "Nut-free" },
    { key: "dairyFree", label: "Dairy-free" },
  ];
  const [diet, setDiet] = useState({});

  // Data
  const [recipes, setRecipes] = useState(() => {
    const ls = loadLS("gm_recipes", SEED);
    return Array.isArray(ls) ? ls.map(normalizeRecipe) : SEED;
  });
  const [favorites, setFavorites] = useState(loadLS("gm_favorites", []));
  const [names, setNames] = useState(loadLS("gm_names", ["Patrol A", "Patrol B", "Patrol C"]));

  useEffect(() => saveLS("gm_recipes", recipes), [recipes]);
  useEffect(() => saveLS("gm_favorites", favorites), [favorites]);
  useEffect(() => saveLS("gm_names", names), [names]);

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

  // Filtering recipes by trip constraints
  const filteredRecipes = useMemo(() => {
    return recipes.filter((r) => {
      const t = r.tags || {};
      if (campType === "backpacking" && !t.backpacking) return false;
      if (campType === "car" && !(t.car || t.backpacking || t.canoe)) return false;
      if (campType === "canoe" && !(t.canoe || t.car || t.backpacking)) return false;

      // Dutch oven filter (exclude DO recipes unless allowed)
      if (!includeDutchOven && t.dutchOven) return false;

      // diet
      for (const k of Object.keys(diet)) if (diet[k] && !r.diet?.[k]) return false;
      return true;
    });
  }, [recipes, campType, includeDutchOven, diet]);

  // ------------- Menu (auto + editable) -------------
  // Our menu has slots: main, side, drink for all meals; dinner adds dessert
  // Menu item: { id, mealType, course: 'main'|'side'|'drink'|'dessert', recipeId }
  const COURSE_ORDER = ["main", "side", "drink"];
  const [menu, setMenu] = useState([]);

  // Build needed slots
  const neededSlots = useMemo(() => {
    const list = [];
    const addSlots = (mt, count) => {
      for (let i = 0; i < count; i++) {
        COURSE_ORDER.forEach((c) => list.push({ mealType: mt, course: c }));
        if (mt === "dinner") list.push({ mealType: mt, course: "dessert" });
      }
    };
    addSlots("breakfast", meals.breakfast || 0);
    addSlots("lunch", meals.lunch || 0);
    addSlots("dinner", meals.dinner || 0);
    return list;
  }, [meals]);

  // Auto-generate when filteredRecipes/meals change, but preserve user edits if present
  useEffect(() => {
    const next = neededSlots.map((slot, idx) => {
      const existing = menu[idx];
      if (existing && existing.mealType === slot.mealType && existing.course === slot.course) {
        return existing; // keep user edit
      }
      // pick by mealType+course; prefer favorites
      const favs = new Set(favorites);
      const pool = filteredRecipes
        .filter((r) => r.mealType === slot.mealType && r.course === slot.course)
        .sort((a, b) => Number(favs.has(b.id)) - Number(favs.has(a.id)));
      const pick = pool[0];
      return { id: uid(), mealType: slot.mealType, course: slot.course, recipeId: pick?.id || "" };
    });
    setMenu(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredRecipes, neededSlots.length, favorites.length]);

  // Menu editor: update a specific slot
  const setMenuRecipe = (slotIndex, recipeId) => {
    setMenu((m) => {
      const a = [...m];
      if (!a[slotIndex]) return m;
      a[slotIndex] = { ...a[slotIndex], recipeId };
      return a;
    });
  };

  // ------------ Shopping list from menu ------------
  function addQty(map, key, qty = 0, unit = "") {
    const k = `${key}@@${unit}`.toLowerCase();
    map.set(k, { item: key, unit, qty: (map.get(k)?.qty || 0) + qty });
  }
  const shopping = useMemo(() => {
    const map = new Map();
    const chosen = menu
      .map((m) => recipes.find((r) => r.id === m.recipeId))
      .filter(Boolean);
    chosen.forEach((r) => {
      r.ingredients.forEach((ing) => addQty(map, ing.item, (ing.qtyPerPerson || 0) * scouts, ing.unit || ""));
    });
    // add a couple staples
    addQty(map, "paper towels", Math.ceil(scouts / 4), "roll");
    addQty(map, "trash bags", 2, "ea");
    return Array.from(map.values()).sort((a, b) => a.item.localeCompare(b.item));
  }, [menu, recipes, scouts]);

  // ------------- Recipe Library actions (incl. cloud) -------------
  const [editingId, setEditingId] = useState(null);
  const startEdit = (id) => setEditingId(id);
  const cancelEdit = () => setEditingId(null);

  const saveEdited = async (rec) => {
    const clean = normalizeRecipe(rec);
    // local
    setRecipes((prev) => prev.map((r) => (r.id === clean.id ? clean : r)));
    // cloud (merge)
    if (authed && troopId && paths.recipesCol) {
      await setDoc(doc(paths.recipesCol, clean.id), { ...clean, updatedAt: serverTimestamp() }, { merge: true });
      setSyncInfo({ status: "online", last: new Date().toISOString() });
    }
    setEditingId(null);
  };

  const addNew = async (rec) => {
    const newR = normalizeRecipe({ ...rec, id: uid() });
    if (authed && troopId && paths.recipesCol) {
      await addDoc(paths.recipesCol, { ...newR, createdAt: serverTimestamp(), createdBy: user?.uid || "anon" });
      setSyncInfo({ status: "online", last: new Date().toISOString() });
    } else {
      setRecipes((prev) => [newR, ...prev]);
    }
  };

  const deleteRecipe = async (id) => {
    if (!confirm("Delete this recipe?")) return;
    setRecipes((prev) => prev.filter((r) => r.id !== id));
    setMenu((m) => m.map((s) => (s.recipeId === id ? { ...s, recipeId: "" } : s)));
    if (authed && troopId && paths.recipesCol) {
      try {
        await deleteDoc(doc(paths.recipesCol, id));
      } catch (e) {
        console.warn("Cloud delete failed (maybe imported seed):", e);
      }
    }
  };

  const setFavoritesCloud = async (arr) => {
    if (!authed || !troopId || !paths.userDoc) return;
    await setDoc(paths.userDoc, { favorites: arr }, { merge: true });
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
    setImportBusy(true);
    setImportMsg("");
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

  // Boot/Error
  if (phase === "boot") {
    return <div className="min-h-screen flex items-center justify-center text-slate-700">Initializing…</div>;
  }
  if (phase === "error") {
    return (
      <div className="min-h-screen p-6 text-slate-800">
        <h1 className="text-xl font-semibold mb-2">⚠️ Firebase error</h1>
        <pre className="p-3 bg-slate-100 rounded border overflow-auto">{String(err?.message || err)}</pre>
        <p className="mt-2 text-sm">Check env vars and enable Anonymous Sign-in in Firebase Auth.</p>
      </div>
    );
  }

  const campTypes = [
    { key: "backpacking", label: "Backpacking" },
    { key: "car", label: "Car camping" },
    { key: "canoe", label: "Canoe/float" },
  ];

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
        {/* LEFT: Trip Setup + Add/Edit Recipe */}
        <section className="md:col-span-1 space-y-6">
          <div className="p-4 bg-white rounded-2xl shadow">
            <h2 className="text-lg font-semibold mb-3">Trip Setup</h2>

            <label className="block text-sm mb-1">Number of Scouts</label>
            <input
              type="number"
              min={1}
              value={scouts}
              onChange={(e) => setScouts(Math.max(1, Number(e.target.value) || 1))}
              className="w-full border rounded-lg px-3 py-2 mb-3"
            />

            <div className="grid grid-cols-3 gap-3">
              {["breakfast", "lunch", "dinner"].map((mt) => (
                <div key={mt}>
                  <label className="block text-sm capitalize">{mt}</label>
                  <input
                    type="number"
                    min={0}
                    value={meals[mt]}
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
              {campTypes.map((ct) => (
                <option key={ct.key} value={ct.key}>
                  {ct.label}
                </option>
              ))}
            </select>

            <div className="mt-3">
              <div className="text-sm font-medium mb-1">Dutch oven</div>
              {/* Radio group (default No) */}
              <label className="inline-flex items-center gap-2 mr-4">
                <input
                  type="radio"
                  name="dutch"
                  checked={!includeDutchOven}
                  onChange={() => setIncludeDutchOven(false)}
                />
                No
              </label>
              <label className="inline-flex items-center gap-2">
                <input
                  type="radio"
                  name="dutch"
                  checked={includeDutchOven}
                  onChange={() => setIncludeDutchOven(true)}
                />
                Yes (include Dutch oven recipes)
              </label>
              {campType === "backpacking" && includeDutchOven && (
                <div className="text-xs text-amber-700 mt-1">
                  Note: Dutch oven may be impractical for backpacking trips.
                </div>
              )}
            </div>

            <div className="mt-3">
              <div className="text-sm font-medium mb-1">Dietary Restrictions</div>
              <div className="grid grid-cols-1 gap-2">
                {DIETS.map((d) => (
                  <label key={d.key} className="inline-flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={!!diet[d.key]}
                      onChange={(e) => setDiet((prev) => ({ ...prev, [d.key]: e.target.checked }))}
                    />
                    <span>{d.label}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          {/* Add new or edit selected recipe */}
          {editingId ? (
            <RecipeForm
              key={"edit-" + editingId}
              initial={recipes.find((r) => r.id === editingId)}
              onCancel={cancelEdit}
              onSave={saveEdited}
              dietsList={DIETS}
            />
          ) : (
            <RecipeForm onCancel={() => {}} onSave={addNew} dietsList={DIETS} />
          )}

          <div className="p-4 bg-white rounded-2xl shadow">
            <h2 className="text-lg font-semibold mb-3">Roster (shared)</h2>
            <textarea
              className="w-full border rounded-lg px-3 py-2"
              rows={4}
              value={names.join("\n")}
              onChange={(e) =>
                setNames(
                  e.target.value
                    .split(/\n+/)
                    .map((s) => s.trim())
                    .filter(Boolean)
                )
              }
            />
            <p className="text-xs text-slate-500 mt-1">
              One name per line. Saved troop-wide when Troop ID is set.
            </p>
          </div>
        </section>

        {/* RIGHT: Menu Editor + Library + Shopping + Duty */}
        <section className="md:col-span-2 space-y-6">
          {/* Menu (editable) */}
          <div className="p-4 bg-white rounded-2xl shadow">
            <h2 className="text-lg font-semibold mb-3">Menu (click any slot to change)</h2>

            {menu.length === 0 && (
              <div className="text-slate-500">No meals selected. Increase counts on the left.</div>
            )}

            <div className="space-y-4">
              {menu.map((slot, idx) => {
                const options = filteredRecipes.filter(
                  (r) => r.mealType === slot.mealType && r.course === slot.course
                );
                const chosen = recipes.find((r) => r.id === slot.recipeId);

                return (
                  <div
                    key={slot.id}
                    className="border rounded-xl p-3 flex flex-col md:flex-row md:items-center md:gap-3"
                  >
                    <div className="text-sm uppercase tracking-wide text-slate-500 w-40">
                      {slot.mealType} — {slot.course}
                    </div>
                    <div className="grow">
                      <select
                        className="w-full border rounded-lg px-3 py-2"
                        value={slot.recipeId}
                        onChange={(e) => setMenuRecipe(idx, e.target.value)}
                      >
                        <option value="">— Pick a recipe —</option>
                        {options.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.name}
                            {r.tags?.dutchOven ? " (Dutch oven)" : ""}
                          </option>
                        ))}
                      </select>
                      {chosen && (
                        <div className="mt-1 text-xs text-slate-600">
                          Serves {chosen.serves}. Ingredients scale to {scouts} scouts below.
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Library (with edit/delete/fav) */}
          <div className="p-4 bg-white rounded-2xl shadow">
            <h2 className="text-lg font-semibold mb-3">
              Recipes Library ({filteredRecipes.length} shown)
            </h2>
            <div className="grid md:grid-cols-2 gap-3 max-h-96 overflow-y-auto pr-1">
              {filteredRecipes.map((r) => (
                <div key={r.id} className="border rounded-xl p-3">
                  <div className="flex items-center justify-between">
                    <div className="font-semibold">{r.name}</div>
                    <div className="flex items-center gap-2">
                      <button
                        className="text-xs px-2 py-0.5 rounded-full border"
                        onClick={() => toggleFavorite(r.id)}
                      >
                        {favorites.includes(r.id) ? "★ Fav" : "☆ Fav"}
                      </button>
                      <button
                        className="text-xs px-2 py-0.5 rounded-full border"
                        onClick={() => startEdit(r.id)}
                      >
                        Edit
                      </button>
                      <button
                        className="text-xs px-2 py-0.5 rounded-full border text-red-700"
                        onClick={() => deleteRecipe(r.id)}
                      >
                        Delete
                      </button>
                    </div>
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

          {/* Duty Roster (rotate names per main course occurrence) */}
          <div className="p-4 bg-white rounded-2xl shadow">
            <h2 className="text-lg font-semibold mb-3">Duty Roster</h2>
            <RosterTable names={names} menu={menu} recipes={recipes} />
          </div>
        </section>
      </main>

      {/* Print content */}
      <div className="hidden" ref={printRef}>
        <h1>Troop Duty Roster + Meal Plan</h1>
        <div className="muted">
          Scouts: {scouts} · Camp: {campTypes.find((c) => c.key === campType)?.label} · Dutch oven:{" "}
          {includeDutchOven ? "Yes" : "No"} · Diet:{" "}
          {Object.keys(diet).filter((k) => diet[k]).join(", ") || "None"}
        </div>

        <h2>Menu</h2>
        <table>
          <thead>
            <tr>
              <th>Meal</th>
              <th>Course</th>
              <th>Recipe</th>
            </tr>
          </thead>
          <tbody>
            {menu.map((m) => {
              const r = recipes.find((rr) => rr.id === m.recipeId);
              return (
                <tr key={m.id}>
                  <td className="cap">{m.mealType}</td>
                  <td className="cap">{m.course}</td>
                  <td>{r?.name || ""}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <h2>Duty Roster</h2>
        <RosterTable names={names} menu={menu} recipes={recipes} printMode />
        <h2>Shopping List</h2>
        <table>
          <thead>
            <tr>
              <th>Item</th>
              <th>Qty</th>
              <th>Unit</th>
            </tr>
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

      <footer className="max-w-6xl mx-auto px-4 pb-10 text-center text-xs text-slate-500">
        Local fallback; cloud sync when Troop ID is set • Print via Export button
      </footer>
    </div>
  );
}

// ---------------------------
// Duty roster helper component
// ---------------------------
function RosterTable({ names, menu, recipes, printMode = false }) {
  const roles = ["Grubmaster", "Asst. Grubmaster", "Fireman", "Quartermaster", "Cleanup"];
  const mealsFlat = menu
    .filter((m) => m.course === "main")
    .map((m, idx) => ({ ...m, idx }));
  const duty = mealsFlat.map((m, i) => {
    const assignment = {};
    roles.forEach((role, rIdx) => {
      const who = names[(i + rIdx) % names.length] || `Patrol ${rIdx + 1}`;
      assignment[role] = who;
    });
    return { ...m, assignment };
  });

  if (printMode) {
    return (
      <table>
        <thead>
          <tr>
            <th>Meal</th>
            <th>Main</th>
            {roles.map((r) => (
              <th key={r}>{r}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {duty.map((d) => {
            const r = recipes.find((x) => x.id === d.recipeId);
            return (
              <tr key={d.id}>
                <td className="cap">{d.mealType}</td>
                <td>{r?.name || "—"}</td>
                {roles.map((role) => (
                  <td key={role}>{d.assignment[role]}</td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr>
            <th className="border px-2 py-1 text-left">Meal</th>
            <th className="border px-2 py-1 text-left">Main</th>
            {roles.map((r) => (
              <th key={r} className="border px-2 py-1 text-left">
                {r}
              </th>
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
  );
}
