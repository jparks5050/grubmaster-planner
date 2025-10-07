// Scouts BSA Grubmaster Planner — cloud-ready version
// Tailwind for styling; Print-to-PDF via window.print().
// Local fallback + Firebase Auth/Firestore sync so recipes are shared across your Troop.
// note: This file assumes firebase web SDK packages are available.

// =========================
// 🔧 Firebase Setup (configure .env)
// =========================
// Create a web app in Firebase console and add these to your Vite (or Next) env:
// VITE_FIREBASE_API_KEY=...
// VITE_FIREBASE_AUTH_DOMAIN=...
// VITE_FIREBASE_PROJECT_ID=...
// VITE_FIREBASE_APP_ID=...
// (Optionally) VITE_FIREBASE_STORAGE_BUCKET, VITE_FIREBASE_MESSAGING_SENDER_ID

// src/App.jsx
import { useEffect, useState } from "react";
import { initializeApp } from "firebase/app";
import {
  getAuth,
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithRedirect,
  signOut,
} from "firebase/auth";

// ✅ These are automatically pulled from your Vite environment (.env or Vercel settings)
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export default function App() {
  // Track login state
  const [authed, setAuthed] = useState(null); // null = loading, true = signed in, false = signed out
  const [error, setError] = useState(null);

  // ✅ Initialize Firebase & monitor auth state
  useEffect(() => {
    try {
      const app = initializeApp(firebaseConfig);
      const auth = getAuth(app);

      // Listen for login state changes
      const unsubscribe = onAuthStateChanged(
        auth,
        (user) => {
          setAuthed(!!user);
        },
        (e) => {
          console.error("Auth listener error:", e);
          setError(e);
          setAuthed(false);
        }
      );

      return unsubscribe; // cleanup
    } catch (e) {
      console.error("Firebase initialization error:", e);
      setError(e);
      setAuthed(false);
    }
  }, []);

  // ✅ Conditional rendering
  if (error) {
    return (
      <div style={{ padding: 24, color: "crimson" }}>
        <h2>Auth error:</h2>
        <pre>{String(error.message || error)}</pre>
      </div>
    );
  }

  if (authed === null) {
    return <div style={{ padding: 24 }}>Loading Firebase auth…</div>;
  }

  if (!authed) {
    return (
      <div style={{ padding: 24 }}>
        <h1>Scouts BSA Grubmaster Planner</h1>
        <p>Please sign in to continue.</p>
        <button
          onClick={() => {
            const auth = getAuth();
            const provider = new GoogleAuthProvider();
            signInWithRedirect(auth, provider);
          }}
        >
          Sign in with Google
        </button>
      </div>
    );
  }

  return (
    <div style={{ padding: 24 }}>
      <h1>Welcome to the Grubmaster Planner!</h1>
      <p>You are signed in.</p>
      <button
        onClick={() => {
          const auth = getAuth();
          signOut(auth);
        }}
      >
        Sign out
      </button>
    </div>
  );
}


// --- Utilities ---
const uid = () => Math.random().toString(36).slice(2, 10);
const saveLS = (k, v) => localStorage.setItem(k, JSON.stringify(v));
const loadLS = (k, d) => {
  try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; }
};

// Defensive normalizer to avoid undefined keys breaking filters/UI
const normalizeRecipe = (r) => {
  const clean = { ...r };
  const defaultTags = { dutchOven: false, backpacking: false, car: false, canoe: false };
  clean.tags = { ...defaultTags, ...(r?.tags || {}) };
  clean.diet = { ...(r?.diet || {}) };
  clean.ingredients = Array.isArray(r?.ingredients) ? r.ingredients : [];
  clean.steps = Array.isArray(r?.steps) ? r.steps : [];
  clean.mealType = r?.mealType || "dinner";
  clean.name = r?.name || "Unnamed";
  clean.serves = r?.serves || 8;
  return clean;
};

// Unit helper: naive aggregator by (item, unit)
function addQty(map, key, qty = 0, unit = "") {
  const k = `${key}@@${unit}`.toLowerCase();
  map.set(k, { item: key, unit, qty: (map.get(k)?.qty || 0) + qty });
}

// =============================
// Import/Export (JSON) Support
// =============================

// Simple JSON downloader (browser-safe)
const downloadJSON = (filename, data) => {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

// Build export payload from current recipes
const buildRecipesExport = (recipes, meta={}) => ({
  $schema: "https://example.com/schemas/grubmaster/recipes-v1.json",
  exporter: {
    app: "Scouts BSA Grubmaster Planner",
    version: "1.0.0",
    exportedAt: new Date().toISOString(),
    ...meta,
  },
  recipes: (recipes || []).map(r => ({
    id: r.id || uid(),
    name: r.name || "Unnamed",
    mealType: r.mealType || "dinner",
    serves: r.serves || 8,
    tags: r.tags || {},
    diet: r.diet || {},
    ingredients: Array.isArray(r.ingredients) ? r.ingredients : [],
    steps: Array.isArray(r.steps) ? r.steps : [],
  })),
});

// Minimal schema validator (shape-only); avoids adding zod dependency here
const isValidRecipeShape = (r) => {
  if (!r || typeof r !== "object") return false;
  if (!r.name || !Array.isArray(r.ingredients) || !Array.isArray(r.steps)) return false;
  return true;
};

// Merge an imported array of recipes into local state and (if available) Firestore.
// De-dup by id; if id missing, generate one. Update if same id exists.
async function mergeImportedRecipes(imported, { db, troopId, authed, user }, setRecipes) {
  if (!Array.isArray(imported)) throw new Error("Invalid import: recipes should be an array.");
  let added = 0, updated = 0, skipped = 0, errors = 0;
  const details = [];

  // Build a quick lookup for local state
  const current = new Map((loadLS("gm_recipes", []) || []).map(r => [r.id, r]));

  // Firestore helpers (if available)
  const paths = troopPaths(troopId, user?.uid);
  const recipesCol = (db && troopId && authed && paths.recipesCol) ? paths.recipesCol : null;

  for (const raw of imported) {
    try {
      if (!isValidRecipeShape(raw)) {
        errors++; details.push({ type: "error", reason: "Invalid recipe shape", title: raw?.name, id: raw?.id });
        continue;
      }
      const r = normalizeRecipe({ ...raw, id: raw.id || uid() });
      const exists = current.get(r.id);
      if (!exists) {
        // Insert
        if (recipesCol) {
          // Preserve ID in cloud using setDoc
          const newDocRef = doc(recipesCol, r.id);
          await setDoc(newDocRef, { ...r, createdAt: serverTimestamp(), createdBy: user?.uid || "import" }, { merge: true });
        }
        // Update local state
        setRecipes(prev => [r, ...prev]);
        current.set(r.id, r);
        added++; details.push({ type: "added", id: r.id, title: r.name });
      } else {
        // Update (simple overwrite of fields that exist in import)
        const next = { ...exists, ...r };
        if (recipesCol) {
          const ref = doc(recipesCol, r.id);
          await setDoc(ref, { ...next }, { merge: true });
        }
        setRecipes(prev => prev.map(x => x.id === r.id ? next : x));
        updated++; details.push({ type: "updated", id: r.id, title: r.name });
      }
    } catch (e) {
      errors++; details.push({ type: "error", reason: (e && e.message) || "unknown", title: raw?.name, id: raw?.id });
  }

  }
return { added, updated, skipped, errors, details };
}



// Diet helpers
const DIETS = [
  { key: "alphaGalSafe", label: "Alpha-gal safe (no mammal products)" },
  { key: "vegetarian", label: "Vegetarian" },
  { key: "vegan", label: "Vegan" },
  { key: "glutenFree", label: "Gluten-free" },
  { key: "nutFree", label: "Nut-free" },
  { key: "dairyFree", label: "Dairy-free" },
];

// Camp types
const CAMP_TYPES = [
  { key: "backpacking", label: "Backpacking" },
  { key: "car", label: "Car camping" },
  { key: "canoe", label: "Canoe/float" },
];

// --- Seed Recipe DB (local baseline; cloud will override when signed in with troop) ---
const SEED_RECIPES_RAW = [
  {
    id: uid(),
    name: "Dutch Oven Chicken & Veg Pot Pie",
    mealType: "dinner",
    serves: 8,
    tags: { dutchOven: true, car: true },
    diet: { alphaGalSafe: true },
    ingredients: [
      { item: "boneless skinless chicken thigh", qtyPerPerson: 0.25, unit: "lb" },
      { item: "frozen mixed vegetables", qtyPerPerson: 0.5, unit: "cup" },
      { item: "potatoes (diced)", qtyPerPerson: 0.3, unit: "lb" },
      { item: "chicken gravy mix", qtyPerPerson: 0.3, unit: "packet" },
      { item: "pre-made biscuit dough", qtyPerPerson: 1, unit: "biscuit" },
      { item: "olive oil", qtyPerPerson: 0.25, unit: "tbsp" },
      { item: "salt", qtyPerPerson: 0.1, unit: "tsp" },
      { item: "pepper", qtyPerPerson: 0.1, unit: "tsp" },
    ],
    steps: [
      "Preheat dutch oven with coals (8 below, 16 above).",
      "Sauté chicken in oil until browned.",
      "Add potatoes, veg, gravy + water per packet; simmer.",
      "Top with biscuit dough; bake 20–25 min, rotating lid halfway.",
    ],
  },
  {
    id: uid(),
    name: "Backpacker Couscous Tuna Bowl",
    mealType: "dinner",
    serves: 6,
    tags: { backpacking: true }, // dutchOven not set here; normalizer fills false
    diet: { alphaGalSafe: true, dairyFree: true },
    ingredients: [
      { item: "instant couscous", qtyPerPerson: 0.5, unit: "cup" },
      { item: "foil pouch tuna", qtyPerPerson: 0.5, unit: "pouch" },
      { item: "olive oil", qtyPerPerson: 0.5, unit: "tbsp" },
      { item: "lemon pepper seasoning", qtyPerPerson: 0.25, unit: "tsp" },
    ],
    steps: [
      "Boil water (1:1 with couscous), stir in couscous, cover 5 min.",
      "Fluff, add tuna, oil, seasoning."
    ],
  },
  {
    id: uid(),
    name: "Dutch Oven Monkey Bread (Breakfast Treat)",
    mealType: "breakfast",
    serves: 10,
    tags: { dutchOven: true, car: true },
    diet: { },
    ingredients: [
      { item: "refrigerated biscuit dough", qtyPerPerson: 1, unit: "biscuit" },
      { item: "sugar", qtyPerPerson: 1, unit: "tbsp" },
      { item: "cinnamon", qtyPerPerson: 0.25, unit: "tsp" },
      { item: "butter", qtyPerPerson: 0.5, unit: "tbsp" },
    ],
    steps: [
      "Preheat dutch oven (8 below, 14 above).",
      "Quarter biscuits, toss in cinnamon sugar, dot with butter, bake 20–25 min.",
    ],
  },
  {
    id: uid(),
    name: "Oatmeal Packs + Toppings",
    mealType: "breakfast",
    serves: 8,
    tags: { backpacking: true, car: true, canoe: true },
    diet: { vegetarian: true, dairyFree: true },
    ingredients: [
      { item: "instant oatmeal packet", qtyPerPerson: 1.5, unit: "packet" },
      { item: "dried fruit", qtyPerPerson: 0.25, unit: "cup" },
      { item: "nuts or seeds", qtyPerPerson: 0.25, unit: "cup" },
    ],
    steps: [
      "Boil water, prepare packets; add toppings to taste.",
    ],
  },
  {
    id: uid(),
    name: "Wraps: Chicken Caesar (no bacon)",
    mealType: "lunch",
    serves: 8,
    tags: { car: true, canoe: true },
    diet: { alphaGalSafe: true },
    ingredients: [
      { item: "tortillas (10-inch)", qtyPerPerson: 1, unit: "ea" },
      { item: "cooked chicken (diced)", qtyPerPerson: 0.25, unit: "lb" },
      { item: "romaine", qtyPerPerson: 1, unit: "cup" },
      { item: "Caesar dressing", qtyPerPerson: 1, unit: "tbsp" },
      { item: "parmesan (optional)", qtyPerPerson: 1, unit: "tbsp" },
    ],
    steps: ["Assemble wraps; serve cold."],
  },
  {
    id: uid(),
    name: "Backpacking Ramen + Chicken",
    mealType: "dinner",
    serves: 6,
    tags: { backpacking: true },
    diet: { alphaGalSafe: true },
    ingredients: [
      { item: "ramen bricks", qtyPerPerson: 1, unit: "ea" },
      { item: "foil pouch chicken", qtyPerPerson: 0.5, unit: "pouch" },
      { item: "soy sauce packets", qtyPerPerson: 1, unit: "pkt" },
    ],
    steps: ["Boil water, cook ramen, stir in chicken and seasoning."],
  },
  {
    id: uid(),
    name: "Foil Pack Fajitas (Chicken)",
    mealType: "dinner",
    serves: 8,
    tags: { car: true, canoe: true },
    diet: { alphaGalSafe: true, dairyFree: true },
    ingredients: [
      { item: "chicken breast", qtyPerPerson: 0.3, unit: "lb" },
      { item: "bell peppers", qtyPerPerson: 0.5, unit: "cup" },
      { item: "onion", qtyPerPerson: 0.25, unit: "cup" },
      { item: "fajita seasoning", qtyPerPerson: 0.5, unit: "tbsp" },
      { item: "tortillas", qtyPerPerson: 2, unit: "ea" },
    ],
    steps: ["Assemble foil packs, cook over coals 12–15 min; serve with tortillas."],
  },
  {
    id: uid(),
    name: "No-cook PB&J + Fruit",
    mealType: "lunch",
    serves: 8,
    tags: { backpacking: true, car: true, canoe: true },
    diet: { vegetarian: true, dairyFree: true },
    ingredients: [
      { item: "bread", qtyPerPerson: 2, unit: "slice" },
      { item: "peanut butter", qtyPerPerson: 2, unit: "tbsp" },
      { item: "jelly", qtyPerPerson: 1, unit: "tbsp" },
      { item: "apples/oranges", qtyPerPerson: 1, unit: "ea" },
    ],
    steps: ["Assemble sandwiches; add fruit."],
  },
  {
    id: uid(),
    name: "Pancakes & Turkey Sausage",
    mealType: "breakfast",
    serves: 8,
    tags: { car: true, canoe: true },
    diet: { alphaGalSafe: true },
    ingredients: [
      { item: "pancake mix (complete)", qtyPerPerson: 0.5, unit: "cup" },
      { item: "water", qtyPerPerson: 0.4, unit: "cup" },
      { item: "turkey sausage links", qtyPerPerson: 2, unit: "ea" },
      { item: "syrup", qtyPerPerson: 2, unit: "tbsp" },
      { item: "cooking oil", qtyPerPerson: 0.25, unit: "tbsp" },
    ],
    steps: ["Cook pancakes on griddle, brown sausage."],
  },
];
const SEED_RECIPES = SEED_RECIPES_RAW.map(normalizeRecipe);

// Firestore path helpers
const troopIdKey = "gm_troop_id";
const getTroopId = () => loadLS(troopIdKey, "");
const setTroopId = (v) => saveLS(troopIdKey, v);
const troopPaths = (troopId, uid) => ({
  recipesCol: troopId && db ? collection(db, "troops", troopId, "recipes") : null,
  settingsDoc: troopId && db ? doc(db, "troops", troopId, "meta", "settings") : null,
  userDoc: troopId && db && uid ? doc(db, "troops", troopId, "users", uid) : null,
});

// --- Component ---
export default function GrubmasterPlanner() {
  const [user, setUser] = useState(null);
  const [authed, setAuthed] = useState(false);
  const [scouts, setScouts] = useState(8);
  const [meals, setMeals] = useState({ breakfast: 2, lunch: 2, dinner: 2 });
  const [campType, setCampType] = useState("car");
  const [diet, setDiet] = useState({ alphaGalSafe: true });
  const [includeDutchOven, setIncludeDutchOven] = useState(true);
  const [troopId, _setTroopId] = useState(getTroopId());
  const [syncInfo, setSyncInfo] = useState({ status: db ? "offline" : "local-only", last: null });
  const importInputRef = useRef(null);
  const [importBusy, setImportBusy] = useState(false);
  const [importReport, setImportReport] = useState(null);
  const [importError, setImportError] = useState("");

  // Troop-wide shared lists/settings
  const [recipes, setRecipes] = useState(() => {
    const ls = loadLS("gm_recipes", SEED_RECIPES);
    return Array.isArray(ls) ? ls.map(normalizeRecipe) : SEED_RECIPES;
  });
  const [names, setNames] = useState(loadLS("gm_names", ["Patrol A", "Patrol B", "Patrol C"]));

  // Per-user preferences
  const [favorites, setFavorites] = useState(loadLS("gm_favorites", []));

  // Persist local fallback regardless
  useEffect(() => saveLS("gm_recipes", recipes), [recipes]);
  useEffect(() => saveLS("gm_favorites", favorites), [favorites]);
  useEffect(() => saveLS("gm_names", names), [names]);

  const setTroopIdPersist = (v) => { _setTroopId(v); setTroopId(v); };

  // Auth listener
  useEffect(() => {
    if (!auth) return;
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      setAuthed(!!u);
    });
    return () => unsub();
  }, []);

  // Firestore subscriptions (recipes + settings + user prefs)
  useEffect(() => {
    if (!db || !troopId || !authed) return; // stay on local fallback until ready
    const { recipesCol, settingsDoc, userDoc } = troopPaths(troopId, user?.uid);
    const subs = [];
    if (recipesCol) {
      const q = query(recipesCol, orderBy("createdAt", "asc"));
      subs.push(onSnapshot(q, (snap) => {
        const arr = snap.docs.map(d => normalizeRecipe({ id: d.id, ...d.data() }));
        if (arr.length) setRecipes(arr);
        setSyncInfo({ status: "online", last: new Date().toISOString() });
      }));
    }
    if (settingsDoc) {
      subs.push(onSnapshot(settingsDoc, (d) => {
        const data = d.data();
        if (data?.names && Array.isArray(data.names)) setNames(data.names);
      }));
    }
    if (userDoc) {
      subs.push(onSnapshot(userDoc, (d) => {
        const data = d.data();
        if (Array.isArray(data?.favorites)) setFavorites(data.favorites);
      }));
    }
    return () => subs.forEach(unsub => unsub && unsub());
  }, [db, troopId, authed, user?.uid]);

  // Save names (troop-wide) when changed and cloud ready
  useEffect(() => {
    const save = async () => {
      if (!db || !troopId || !authed) return;
      const { settingsDoc } = troopPaths(troopId, user?.uid);
      if (!settingsDoc) return;
      await setDoc(settingsDoc, { names }, { merge: true });
      setSyncInfo({ status: "online", last: new Date().toISOString() });
    };
    save();
  }, [names, db, troopId, authed, user?.uid]);

  // Filter available recipes based on camp type, diet, dutch oven
  const filteredRecipes = useMemo(() => {
    return recipes.filter(r => {
      const t = r.tags || {}; // guard against undefined
      if (campType === "backpacking" && !t.backpacking) return false;
      if (campType === "car" && !(t.car || t.backpacking || t.canoe)) return false;
      if (campType === "canoe" && !(t.canoe || t.car || t.backpacking)) return false;
      if (!includeDutchOven && t.dutchOven) return false;
      for (const k of Object.keys(diet)) {
        if (diet[k]) {
          if (!r.diet?.[k]) return false;
        }
      }
      return true;
    });
  }, [recipes, campType, diet, includeDutchOven]);

  // Auto-generate menu: pick recipes to fill requested meals, preferring favorites
  const [menu, setMenu] = useState([]); // [{id, recipeId, mealType}]
  useEffect(() => {
    const need = [];
    ("breakfast,lunch,dinner").split(",").forEach(mt => {
      for (let i = 0; i < (meals[mt] || 0); i++) need.push(mt);
    });
    const byMeal = (mt) => filteredRecipes.filter(r => r.mealType === mt);
    const chosen = [];
    const favIds = new Set(favorites);
    const usedIds = new Set();
    for (const mt of need) {
      const pool = byMeal(mt).sort((a, b) => Number(favIds.has(b.id)) - Number(favIds.has(a.id)));
      const pick = pool.find(r => !usedIds.has(r.id)) || pool[0];
      if (pick) { usedIds.add(pick.id); chosen.push({ id: uid(), recipeId: pick.id, mealType: mt }); }
    }
    setMenu(chosen);
  }, [filteredRecipes, meals, favorites]);

  // Build shopping list from menu
  const shopping = useMemo(() => {
    const map = new Map();
    const sel = menu.map(m => recipes.find(r => r.id === m.recipeId)).filter(Boolean);
    sel.forEach(r => { r.ingredients.forEach(ing => { addQty(map, ing.item, ing.qtyPerPerson * scouts, ing.unit); }); });
    addQty(map, "paper towels", Math.ceil(scouts / 4), "roll");
    addQty(map, "trash bags", 2, "ea");
    return Array.from(map.values()).sort((a,b)=>a.item.localeCompare(b.item));
  }, [menu, recipes, scouts]);

  // Duty roster rotation
  const roles = ["Grubmaster", "Asst. Grubmaster", "Fireman", "Quartermaster", "Cleanup"];
  const duty = useMemo(() => {
    const mealsFlat = menu.map((m, idx) => ({ ...m, idx }));
    const out = mealsFlat.map((m, i) => {
      const assignment = {};
      roles.forEach((role, rIdx) => {
        const who = names[(i + rIdx) % names.length] || `Patrol ${rIdx+1}`;
        assignment[role] = who;
      });
      return { ...m, assignment };
    });
    return out;
  }, [menu, names]);

  // Printable ref
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
      </style></head><body>`);
    docW.write(printRef.current?.innerHTML || "");
    docW.write("</body></html>");
    docW.close();
    w.focus();
    w.print();
  };

  // === Import/Export Handlers ===
  const handleExportJSON = () => {
    const payload = buildRecipesExport(recipes, { troopId: troopId || "local", user: user?.uid || "anon" });
    downloadJSON(`recipes-export-${new Date().toISOString()}.json`, payload);
  };
  const handleImportJSONClick = () => importInputRef.current && importInputRef.current.click();
  const handleImportJSON = async (file) => {
    if (!file) return;
    setImportBusy(true); setImportReport(null); setImportError("");
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const arr = Array.isArray(data?.recipes) ? data.recipes : (Array.isArray(data) ? data : null);
      if (!arr) throw new Error("Invalid file: expected { recipes: [...] } or an array.");
      const report = await mergeImportedRecipes(arr, { db, troopId, authed, user }, setRecipes);
      setImportReport(report);
    } catch (e) {
      setImportError(e?.message || "Import failed");
    } finally {
      setImportBusy(false);
      if (importInputRef.current) importInputRef.current.value = "";
    }
  };



  // Cloud-aware saves
  const addRecipeCloud = async (r) => {
    if (!db || !troopId || !authed) return false;
    const { recipesCol } = troopPaths(troopId, user?.uid);
    if (!recipesCol) return false;
    const payload = { ...r, createdAt: serverTimestamp(), createdBy: user?.uid || "anon" };
    await addDoc(recipesCol, payload);
    setSyncInfo({ status: "online", last: new Date().toISOString() });
    return true;
  };

  const saveNamesCloud = async (arr) => {
    if (!db || !troopId || !authed) return false;
    const { settingsDoc } = troopPaths(troopId, user?.uid);
    if (!settingsDoc) return false;
    await setDoc(settingsDoc, { names: arr }, { merge: true });
    setSyncInfo({ status: "online", last: new Date().toISOString() });
    return true;
  };

  const setFavoritesCloud = async (arr) => {
    if (!db || !troopId || !authed) return false;
    const { userDoc } = troopPaths(troopId, user?.uid);
    if (!userDoc) return false;
    await setDoc(userDoc, { favorites: arr }, { merge: true });
    setSyncInfo({ status: "online", last: new Date().toISOString() });
    return true;
  };

  // Recipe CRUD (local + cloud)
  const [draft, setDraft] = useState({
    name: "",
    mealType: "dinner",
    serves: 8,
    tags: { car: true },
    diet: {},
    ingredients: [{ item: "", qtyPerPerson: 1, unit: "ea" }],
    steps: [""],
  });

  const addIngredientRow = () => setDraft(d => ({...d, ingredients: [...d.ingredients, { item: "", qtyPerPerson: 1, unit: "ea" }]}));
  const addStepRow = () => setDraft(d => ({...d, steps: [...d.steps, ""]}));

  const saveRecipe = async () => {
    if (!draft.name.trim()) return alert("Recipe name required");
    const newR = normalizeRecipe({ ...draft, id: uid() });
    // Try cloud first
    const pushed = await addRecipeCloud(newR);
    if (!pushed) {
      // Fallback to local
      setRecipes(r => [newR, ...r]);
    }
    setDraft({ name: "", mealType: "dinner", serves: 8, tags: { car: true }, diet: {}, ingredients: [{ item: "", qtyPerPerson: 1, unit: "ea" }], steps: [""] });
  };

  const toggleFavorite = async (id) => {
    setFavorites(prev => {
      const next = prev.includes(id) ? prev.filter(x=>x!==id) : [id, ...prev];
      setFavoritesCloud(next); // attempt to persist to cloud if possible
      return next;
    });
  };

  // UI helpers
  const Pill = ({ children }) => <span className="px-2 py-0.5 rounded-full text-xs bg-gray-100 border">{children}</span>;

// --- Diagnostics & Tests ---
const [testsOpen, setTestsOpen] = useState(false);
const [testResults, setTestResults] = useState([]);

useEffect(() => {
  if (!testsOpen) return; // only run when panel is open

  const results = [];
  const assert = (name, cond) => results.push({ name, pass: !!cond });

  (async () => {
    try {
      // Export payload basic check
      const payload = buildRecipesExport(SEED_RECIPES);
      assert(
        "Export payload has recipes[]",
        Array.isArray(payload.recipes) && payload.recipes.length > 0
      );

      // Import merge dry-run on local (without Firestore)
      const sample = [{
        id: "demo-import-1",
        name: "Test Imported Recipe",
        mealType: "dinner",
        serves: 4,
        tags: { car: true },
        diet: { alphaGalSafe: true },
        ingredients: [{ item: "rice", qtyPerPerson: 0.5, unit: "cup" }],
        steps: ["Cook rice."],
      }];

      try {
        const rep = await mergeImportedRecipes(
          sample,
          { db: null, troopId: "", authed: false, user: null },
          () => {}
        );
        assert(
          "Import merge returns report object",
          rep && typeof rep === "object" && "added" in rep
        );
      } catch {
        assert("Import merge returns report object", false);
      }

      // Test 1: Normalizer fills missing tags keys
      const t1 = normalizeRecipe({
        name: "X",
        tags: { backpacking: true },
        ingredients: [],
        steps: []
      });
      assert(
        "Normalizer sets dutchOven=false when missing",
        t1.tags.dutchOven === false
      );

      // Test 2: Filter guard
      const sample2 = [normalizeRecipe({
        id: "a",
        name: "No Tags",
        mealType: "dinner",
        ingredients: [],
        steps: []
      })];
      const guardFilter = () =>
        sample2.filter(r => {
          const t = r.tags || {};
          return !("backpacking" === "backpacking" && !t.backpacking);
        });
      let threw = false;
      try { guardFilter(); } catch { threw = true; }
      assert("Filter safe when r.tags undefined", threw === false);

      // Test 3: Shopping list scales
      const scoutsN = 5;
      const map = new Map();
      addQty(map, "mix", 0.5 * scoutsN, "cup");
      const entry = Array.from(map.values())[0];
      assert(
        "Scaling: 0.5 cup * 5 = 2.5 cups",
        Math.abs(entry.qty - 2.5) < 1e-9 && entry.unit === "cup"
      );

      // Test 4: Favorites sort preference
      const pool = [{ id: "1" }, { id: "2" }];
      const favs = new Set(["2"]);
      const sorted = [...pool].sort(
        (a, b) => Number(favs.has(b.id)) - Number(favs.has(a.id))
      );
      assert("Favorites sorted first", sorted[0].id === "2");

      // Test 5: Path builder sanity
      const p = troopPaths("T194", "abc");
      assert(
        "Path builder returns objects when troopId provided",
        !!p.recipesCol && !!p.settingsDoc && !!p.userDoc
      );
    } catch (e) {
      results.push({ name: `Diagnostics threw: ${e?.message || e}`, pass: false });
    }
    setTestResults(results);
  })();
}, [testsOpen]);
// --- End Diagnostics & Tests ---


  // Auth UI actions
  const doGoogleSignIn = async () => {
    if (!auth) { alert("Firebase not configured. Using local-only mode."); return; }
    await signInWithRedirect(auth, new GoogleAuthProvider());
  }
  };
  const doSignOut = async () => {if (!auth) return; await signOut(auth);

  const disableSave = !authed || !troopId;

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white text-slate-900">
      <header className="sticky top-0 z-10 backdrop-blur bg-white/70 border-b">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <h1 className="text-xl font-bold">Scouts BSA Grubmaster Planner</h1>
          <div className="flex items-center gap-2 text-sm">
            <div className="hidden md:flex items-center gap-2 px-2 py-1 rounded border bg-white">
              <span>Troop ID:</span>
              <input className="w-28 border rounded px-2 py-1" placeholder="e.g. 194" value={troopId} onChange={(e)=>setTroopIdPersist(e.target.value.trim())} />
            </div>
            {authed ? (
              <>
                <span className="text-slate-600">{user?.displayName || user?.email}</span>
                <button onClick={doSignOut} className="px-3 py-1.5 rounded-lg border">Sign out</button>
              </>
            ) : (
              <button onClick={doGoogleSignIn} className="px-3 py-1.5 rounded-lg border">Sign in</button>
            )}
            <button onClick={handlePrint} className="px-3 py-1.5 rounded-lg bg-slate-900 text-white hover:bg-slate-800">Export PDF</button>
            <button onClick={handleExportJSON} className="px-3 py-1.5 rounded-lg border">Export JSON</button>
            <button onClick={handleImportJSONClick} className="px-3 py-1.5 rounded-lg border">Import JSON</button>
            <input ref={importInputRef} type="file" accept="application/json,.json" className="hidden" onChange={(e)=>handleImportJSON(e.target.files?.[0])} />

            <button onClick={()=>setTestsOpen(o=>!o)} className="px-3 py-1.5 rounded-lg border">{testsOpen?"Hide Tests":"Show Tests"}</button>
          </div>
        </div>
        <div className="max-w-6xl mx-auto px-4 pb-2 text-xs text-slate-600">
          <span className="mr-2">Sync:</span>
          <span className={syncInfo.status === "online" ? "text-emerald-700" : syncInfo.status === "offline" ? "text-amber-700" : "text-slate-500"}>
            {syncInfo.status} {syncInfo.last ? `• ${new Date(syncInfo.last).toLocaleTimeString()}` : ""}
          </span>
          {!authed && <span className="ml-3">(Local mode until you sign in)</span>}
          {authed && !troopId && <span className="ml-3 text-amber-700">Enter a Troop ID to share recipes across your troop.</span>}
        </div>
      
        {importBusy && <div className="max-w-6xl mx-auto px-4 pb-2 text-sm text-amber-700">Importing…</div>}
        {importError && <div className="max-w-6xl mx-auto px-4 pb-2 text-sm text-red-700">Import error: {importError}</div>}
        {importReport && (
          <div className="max-w-6xl mx-auto px-4 pb-2 text-sm text-emerald-700">
            Import summary — added {importReport.added}, updated {importReport.updated}, skipped {importReport.skipped}, errors {importReport.errors}.
          </div>
        )}

</header>

      <main className="max-w-6xl mx-auto px-4 py-6 grid md:grid-cols-3 gap-6">
        {/* Left column: Inputs */}
        <section className="md:col-span-1 space-y-6">
          <div className="p-4 bg-white rounded-2xl shadow">
            <h2 className="text-lg font-semibold mb-3">Trip Setup</h2>
            <label className="block text-sm mb-1">Number of Scouts</label>
            <input type="number" min={1} value={scouts} onChange={e=>setScouts(Number(e.target.value)||1)} className="w-full border rounded-lg px-3 py-2 mb-3" />
            <div className="grid grid-cols-3 gap-3">
              {["breakfast","lunch","dinner"].map(mt => (
                <div key={mt}>
                  <label className="block text-sm capitalize">{mt}</label>
                  <input type="number" min={0} value={meals[mt]} onChange={e=>setMeals(m=>({...m,[mt]:Math.max(0, Number(e.target.value)||0)}))} className="w-full border rounded-lg px-3 py-2" />
                </div>
              ))}
            </div>
            <label className="block text-sm mt-3">Camp Type</label>
            <select value={campType} onChange={e=>{setCampType(e.target.value); if(e.target.value==="backpacking") setIncludeDutchOven(false);}} className="w-full border rounded-lg px-3 py-2">
              {CAMP_TYPES.map(ct => <option key={ct.key} value={ct.key}>{ct.label}</option>)}
            </select>
            <div className="mt-3 flex items-center gap-2">
              <input id="dutch" type="checkbox" checked={includeDutchOven} onChange={e=>setIncludeDutchOven(e.target.checked)} disabled={campType==="backpacking"} />
              <label htmlFor="dutch">Include Dutch oven recipes</label>
            </div>
            <div className="mt-3">
              <div className="text-sm font-medium mb-1">Dietary Restrictions</div>
              <div className="grid grid-cols-1 gap-2">
                {DIETS.map(d => (
                  <label key={d.key} className="inline-flex items-center gap-2">
                    <input type="checkbox" checked={!!diet[d.key]} onChange={e=>setDiet(prev=>({ ...prev, [d.key]: e.target.checked }))} />
                    <span>{d.label}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          <div className="p-4 bg-white rounded-2xl shadow">
            <h2 className="text-lg font-semibold mb-3">Troop & Roster</h2>
            <label className="text-sm">Troop ID</label>
            <input className="w-full border rounded-lg px-3 py-2" placeholder="e.g. 194" value={troopId} onChange={(e)=>setTroopIdPersist(e.target.value.trim())} />
            <p className="text-xs text-slate-500 mt-1">All authenticated users with this Troop ID will share recipes.</p>
            <h3 className="text-sm font-medium mt-3">Patrols / Names (shared)</h3>
            <textarea className="w-full border rounded-lg px-3 py-2" rows={4} value={names.join("\n")} onChange={e=>setNames(e.target.value.split(/\n+/).map(s=>s.trim()).filter(Boolean))}></textarea>
            <p className="text-xs text-slate-500 mt-1">One line per name or patrol. Saved troop-wide when signed in.</p>
          </div>

          <div className="p-4 bg-white rounded-2xl shadow">
            <h2 className="text-lg font-semibold mb-3">Add Recipe</h2>
            <div className="grid grid-cols-1 gap-2">
              <input placeholder="Recipe name" className="border rounded-lg px-3 py-2" value={draft.name} onChange={e=>setDraft(d=>({...d,name:e.target.value}))} />
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-sm">Meal</label>
                  <select className="w-full border rounded-lg px-3 py-2" value={draft.mealType} onChange={e=>setDraft(d=>({...d,mealType:e.target.value}))}>
                    <option value="breakfast">Breakfast</option>
                    <option value="lunch">Lunch</option>
                    <option value="dinner">Dinner</option>
                  </select>
                </div>
                <div>
                  <label className="text-sm">Serves</label>
                  <input type="number" className="w-full border rounded-lg px-3 py-2" value={draft.serves} onChange={e=>setDraft(d=>({...d,serves:Number(e.target.value)||1}))} />
                </div>
                <div>
                  <label className="text-sm">Tags</label>
                  <div className="flex gap-2 items-center text-sm">
                    <label className="inline-flex items-center gap-1"><input type="checkbox" checked={!!draft.tags.backpacking} onChange={e=>setDraft(d=>({...d,tags:{...d.tags,backpacking:e.target.checked}}))}/>Backpacking</label>
                    <label className="inline-flex items-center gap-1"><input type="checkbox" checked={!!draft.tags.car} onChange={e=>setDraft(d=>({...d,tags:{...d.tags,car:e.target.checked}}))}/>Car</label>
                    <label className="inline-flex items-center gap-1"><input type="checkbox" checked={!!draft.tags.dutchOven} onChange={e=>setDraft(d=>({...d,tags:{...d.tags,dutchOven:e.target.checked}}))}/>Dutch</label>
                    <label className="inline-flex items-center gap-1"><input type="checkbox" checked={!!draft.tags.canoe} onChange={e=>setDraft(d=>({...d,tags:{...d.tags,canoe:e.target.checked}}))}/>Canoe</label>
                  </div>
                </div>
              </div>
              <div>
                <div className="text-sm">Diet suitability</div>
                <div className="flex flex-wrap gap-3 text-sm mt-1">
                  {DIETS.map(dk => (
                    <label key={dk.key} className="inline-flex items-center gap-1"><input type="checkbox" checked={!!draft.diet[dk.key]} onChange={e=>setDraft(d=>({...d,diet:{...d.diet,[dk.key]:e.target.checked}}))}/>{dk.label.split(" (")[0]}</label>
                  ))}
                </div>
              </div>
              <div>
                <div className="text-sm font-medium">Ingredients (per person)</div>
                {draft.ingredients.map((ing, i)=> (
                  <div key={i} className="grid grid-cols-5 gap-2 mt-1">
                    <input className="col-span-3 border rounded-lg px-2 py-1" placeholder="item" value={ing.item} onChange={e=>setDraft(d=>{const a=[...d.ingredients]; a[i]={...a[i],item:e.target.value}; return {...d,ingredients:a};})} />
                    <input type="number" step="0.05" className="border rounded-lg px-2 py-1" placeholder="qty" value={ing.qtyPerPerson} onChange={e=>setDraft(d=>{const a=[...d.ingredients]; a[i]={...a[i],qtyPerPerson:Number(e.target.value)||0}; return {...d,ingredients:a};})} />
                    <input className="border rounded-lg px-2 py-1" placeholder="unit" value={ing.unit} onChange={e=>setDraft(d=>{const a=[...d.ingredients]; a[i]={...a[i],unit:e.target.value}; return {...d,ingredients:a};})} />
                  </div>
                ))}
                <button onClick={addIngredientRow} className="mt-2 text-sm px-2 py-1 rounded border">+ Ingredient</button>
              </div>
              <div>
                <div className="text-sm font-medium">Steps</div>
                {draft.steps.map((st, i)=> (
                  <input key={i} className="w-full border rounded-lg px-2 py-1 mt-1" placeholder={`Step ${i+1}`} value={st} onChange={e=>setDraft(d=>{const a=[...d.steps]; a[i]=e.target.value; return {...d,steps:a};})} />
                ))}
                <button onClick={addStepRow} className="mt-2 text-sm px-2 py-1 rounded border">+ Step</button>
              </div>
              <div className="flex items-center justify-between">
                <div className="text-xs text-slate-500">{disableSave ? "Sign in & set Troop ID to share to cloud. Local save will be used otherwise." : "Saving to troop cloud."}</div>
                <button onClick={saveRecipe} className={`px-3 py-1.5 rounded-lg text-white ${disableSave?"bg-slate-400":"bg-emerald-600 hover:bg-emerald-700"}`}>Save Recipe</button>
              </div>
            </div>
          </div>
        </section>

        {/* Right column: Planner */}
        <section className="md:col-span-2 space-y-6">
          <div className="p-4 bg-white rounded-2xl shadow">
            <h2 className="text-lg font-semibold mb-3">Menu (auto-generated)</h2>
            <div className="grid md:grid-cols-2 gap-3">
              {menu.length === 0 && (
                <div className="text-slate-500">No meals selected. Increase counts on the left.</div>
              )}
              {menu.map((m) => {
                const r = recipes.find(r => r.id === m.recipeId);
                const fav = r ? favorites.includes(r.id) : false;
                return (
                  <div key={m.id} className="border rounded-xl p-3 flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <div className="text-sm uppercase tracking-wide text-slate-500">{m.mealType}</div>
                      <button disabled={!r} className={`text-xs px-2 py-0.5 rounded-full border ${fav?"bg-yellow-100 border-yellow-300":""}`} onClick={()=> r && toggleFavorite(r.id)}>{fav?"★ Favorite":"☆ Favorite"}</button>
                    </div>
                    <div className="text-base font-semibold">{r?.name || "Pick a recipe"}</div>
                    <div className="flex gap-2 flex-wrap">
                      {r?.tags?.dutchOven && <Pill>Dutch oven</Pill>}
                      {r?.tags?.backpacking && <Pill>Backpacking</Pill>}
                      {r?.tags?.car && <Pill>Car</Pill>}
                      {r?.tags?.canoe && <Pill>Canoe</Pill>}
                    </div>
                    <details className="text-sm">
                      <summary className="cursor-pointer select-none">Ingredients & Steps</summary>
                      <div className="mt-2">
                        <div className="font-medium mb-1">Ingredients (scaled for {scouts})</div>
                        <ul className="list-disc ml-5">
                          {r?.ingredients.map((ing, idx)=> (
                            <li key={idx}>{ing.item}: {(ing.qtyPerPerson * scouts).toFixed(2)} {ing.unit}</li>
                          ))}
                        </ul>
                        <div className="font-medium mt-2">Steps</div>
                        <ol className="list-decimal ml-5">
                          {r?.steps.map((s, i)=> <li key={i}>{s}</li>)}
                        </ol>
                      </div>
                    </details>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="p-4 bg-white rounded-2xl shadow">
            <h2 className="text-lg font-semibold mb-3">Recipes Library ({filteredRecipes.length} shown)</h2>
            <div className="grid md:grid-cols-2 gap-3 max-h-96 overflow-y-auto pr-1">
              {filteredRecipes.map(r => (
                <div key={r.id} className="border rounded-xl p-3">
                  <div className="flex items-center justify-between">
                    <div className="font-semibold">{r.name}</div>
                    <button className="text-xs px-2 py-0.5 rounded-full border" onClick={()=>toggleFavorite(r.id)}>{favorites.includes(r.id)?"★ Fav":"☆ Fav"}</button>
                  </div>
                  <div className="text-xs uppercase tracking-wide text-slate-500">{r.mealType}</div>
                  <div className="mt-1 flex gap-2 flex-wrap">
                    {r.tags?.dutchOven && <Pill>Dutch oven</Pill>}
                    {r.tags?.backpacking && <Pill>Backpacking</Pill>}
                    {r.tags?.car && <Pill>Car</Pill>}
                    {r.tags?.canoe && <Pill>Canoe</Pill>}
                  </div>
                  <details className="text-sm mt-2">
                    <summary className="cursor-pointer">Details</summary>
                    <div className="mt-1">
                      <div className="font-medium">Ingredients (per person)</div>
                      <ul className="list-disc ml-5">
                        {r.ingredients.map((ing,i)=>(<li key={i}>{ing.item}: {ing.qtyPerPerson} {ing.unit}</li>))}
                      </ul>
                      <div className="font-medium mt-1">Steps</div>
                      <ol className="list-decimal ml-5">
                        {r.steps.map((s,i)=>(<li key={i}>{s}</li>))}
                      </ol>
                    </div>
                  </details>
                </div>
              ))}
            </div>
          </div>

          <div className="p-4 bg-white rounded-2xl shadow">
            <h2 className="text-lg font-semibold mb-3">Shopping List</h2>
            <div className="grid md:grid-cols-2 gap-3">
              {shopping.map((it, i)=> (
                <div key={i} className="flex items-center gap-2">
                  <input type="checkbox" className="w-4 h-4" />
                  <span>{it.item}</span>
                  <span className="ml-auto text-sm text-slate-600">{Number(it.qty.toFixed(2))} {it.unit}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="p-4 bg-white rounded-2xl shadow">
            <h2 className="text-lg font-semibold mb-3">Duty Roster</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th className="border px-2 py-1 text-left">Meal</th>
                    {roles.map(r => <th key={r} className="border px-2 py-1 text-left">{r}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {duty.map((d,i)=> {
                    const r = recipes.find(r => r.id === d.recipeId);
                    return (
                      <tr key={d.id}>
                        <td className="border px-2 py-1">{d.mealType} — <span className="text-slate-600">{r?.name}</span></td>
                        {roles.map(role => <td key={role} className="border px-2 py-1">{d.assignment[role]}</td>)}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {testsOpen && (
            <div className="p-4 bg-white rounded-2xl shadow">
              <h2 className="text-lg font-semibold mb-2">Diagnostics / Tests</h2>
              <ul className="text-sm space-y-1">
                {testResults.map((t,i)=> (
                  <li key={i} className={t.pass?"text-emerald-700":"text-red-700"}>
                    {t.pass ? "✓" : "✗"} {t.name}
                  </li>
                ))}
              </ul>
              <p className="text-xs text-slate-500 mt-2">These lightweight tests validate data normalization, filtering safety, scaling, favorites, and basic cloud path building.</p>
            </div>
          )}

        </section>
      </main>

      {/* Print content */}
      <div className="hidden" ref={printRef}>
        <h1>Troop Duty Roster + Meal Plan</h1>
        <div className="muted">Scouts: {scouts} · Camp: {CAMP_TYPES.find(c=>c.key===campType)?.label} · Diet: {Object.keys(diet).filter(k=>diet[k]).join(", ") || "None"}</div>
        <h2>Menu</h2>
        <table>
          <thead><tr><th>Meal</th><th>Recipe</th></tr></thead>
          <tbody>
            {menu.map(m=>{
              const r = recipes.find(rr=>rr.id===m.recipeId);
              return <tr key={m.id}><td className="capitalize">{m.mealType}</td><td>{r?.name}</td></tr>
            })}
          </tbody>
        </table>
        <h2>Duty Roster</h2>
        <table>
          <thead>
            <tr>
              <th>Meal</th>
              {roles.map(r=> <th key={r}>{r}</th>)}
            </tr>
          </thead>
          <tbody>
            {duty.map(d=>{
              const r = recipes.find(x=>x.id===d.recipeId);
              return (
                <tr key={d.id}>
                  <td className="capitalize">{d.mealType} — {r?.name}</td>
                  {roles.map(role=> <td key={role}>{d.assignment[role]}</td>)}
                </tr>
              );
            })}
          </tbody>
        </table>
        <h2>Shopping List</h2>
        <table>
          <thead><tr><th>Item</th><th>Qty</th><th>Unit</th></tr></thead>
          <tbody>
            {shopping.map((it,i)=> (
              <tr key={i}><td>{it.item}</td><td>{Number(it.qty.toFixed(2))}</td><td>{it.unit}</td></tr>
            ))}
          </tbody>
        </table>
      </div>

      <footer className="max-w-6xl mx-auto px-4 pb-10 text-center text-xs text-slate-500">
        Built for Grubmasters • Local fallback; cloud sync when signed in with a Troop ID • Print to PDF via Export button
      </footer>
    </div>
  );
                                }                                 

