import React, { useMemo, useEffect, useState, useRef } from "react";

/* =========================
   LocalStorage helpers
   ========================= */
const loadLS = (key, fallback) => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
};

const uid = () =>
  Math.random().toString(36).slice(2) + "-" + Date.now().toString(36);

/* =========================
   CSS (injected into page)
   ========================= */
const baseCss = `
:host, .gm-root { box-sizing: border-box; font-family: Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; color:#111; }
* { box-sizing: inherit; }
.gm-root { padding: 16px; }
.gm-grid { display: grid; grid-template-columns: repeat(12, 1fr); gap: 16px; align-items: start; }
.gm-col-12 { grid-column: span 12; }
.gm-col-6 { grid-column: span 6; }
.gm-col-4 { grid-column: span 4; }
.gm-col-3 { grid-column: span 3; }
@media (max-width: 1000px) {
  .gm-col-6, .gm-col-4, .gm-col-3 { grid-column: span 12; }
}

.gm-h1 { font-size: 20px; font-weight: 700; margin: 0 0 12px; }
.gm-h2 { font-size: 16px; font-weight: 700; margin: 0 0 10px; }

.gm-card { background: #fff; border: 1px solid #eee; border-radius: 10px; box-shadow: 0 1px 2px rgba(0,0,0,0.04); }
.gm-card-header { padding: 12px 14px; border-bottom: 1px solid #f2f2f2; display:flex; align-items:center; justify-content: space-between; }
.gm-card-title { font-weight: 700; }
.gm-card-body { padding: 12px 14px; }

.gm-row { display:flex; gap: 8px; align-items:center; margin-bottom: 8px; }
.gm-label { width: 110px; color:#555; font-size: 13px; }
.gm-input, .gm-select, .gm-textarea {
  width: 100%; border:1px solid #ddd; border-radius: 8px; padding: 8px 10px; font-size: 14px; background: #fff;
}
.gm-textarea { min-height: 70px; }

.gm-btn { border: 1px solid #ddd; background:#fafafa; padding: 8px 12px; border-radius: 8px; cursor: pointer; font-size: 14px; }
.gm-btn:hover { background:#f2f2f2; }
.gm-btn.primary { background:#2563eb; border-color:#2563eb; color:#fff; }
.gm-btn.primary:hover { background:#1e55c8; }
.gm-btn.danger { background:#ef4444; border-color:#ef4444; color:#fff; }
.gm-btn.danger:hover { background:#d83a3a; }
.gm-actions { display:flex; gap:8px; flex-wrap:wrap; }

.gm-table { width:100%; border-collapse: collapse; font-size: 14px; }
.gm-table th, .gm-table td { border-bottom:1px solid #f0f0f0; text-align:left; padding:8px 6px; }
.gm-table th { font-weight:700; color:#444; }

.gm-day { font-weight: 700; margin: 10px 0 6px; color:#333; }

 /* === Layout fixes (no squish) === */
.gm-card { min-height: 240px; align-self: start; }
.gm-scroll { max-height: 420px; overflow: auto; }
.gm-grid { align-items: start; }
.gm-card.tight .gm-card-body { margin-bottom: 0; padding-bottom: 8px; }

/* List styling */
.gm-chip { display:inline-block; padding:2px 8px; border-radius:999px; background:#f5f5f5; border:1px solid #eee; font-size:12px; color:#555; margin-right:6px; margin-bottom:4px; }

.small { font-size:12px; color:#666; }

/* Section subtitles */
.gm-subtle { color:#666; font-weight:600; font-size:12px; letter-spacing: .03em; text-transform:uppercase; }
`;

/* =========================
   Recipe normalization
   ========================= */
const normalizeRecipe = (r) => {
  const clean = { ...r };

  clean.id = r?.id || uid();
  clean.name = String(r?.name || "Unnamed Recipe");
  clean.tags = { ...(r?.tags || {}) };
  clean.diet = { ...(r?.diet || {}) };
  clean.ingredients = Array.isArray(r?.ingredients) ? r.ingredients : [];
  clean.steps = Array.isArray(r?.steps) ? r.steps : [];

  // Guard mealType; allow breakfast, lunch, dinner (dessert becomes dinner+dessert course)
  const nm = clean.name.toLowerCase();
  let mt = String(r?.mealType || "dinner").trim().toLowerCase();
  let course = String(r?.course || "").trim().toLowerCase();

  if (mt === "dessert") {
    mt = "dinner";
    course = "dessert";
  }
  if (!["breakfast", "lunch", "dinner"].includes(mt)) mt = "dinner";

  const has = (...k) => k.some((kw) => nm.includes(kw));
  const detectCourse = () =>
    has("cobbler","brownie","cookie","cake","pie","crisp","dump cake","monkey bread") ? "dessert" :
    has("lemonade","water","cocoa","hot cocoa","juice","milk","coffee","tea","drink") ? "drink" :
    has("chips","fruit","parfait","granola","yogurt","banana","salad","corn","veggie","veggies","side") ? "side" :
    "main";

  if (!["main", "side", "drink", "dessert"].includes(course)) {
    course = detectCourse();
  }

  clean.mealType = mt;
  clean.course = course;
  clean.serves = Number(r?.serves) || 8;

  return clean;
};

/* =========================
   Defaults
   ========================= */
const defaultRecipes = []; // you can seed if you like
const defaultNames = Array.from({ length: 10 }, (_, i) => `Scout ${i + 1}`);

const defaultTrip = {
  tripName: "",
  startDate: "", // YYYY-MM-DD
  numDays: 2,
  peopleCount: 8,
};

const MEALS = ["breakfast", "lunch", "dinner"];

/* =========================
   Helpers
   ========================= */
const fmtDateRange = (startISO, numDays) => {
  if (!startISO) return "";
  const start = new Date(startISO + "T00:00:00");
  if (isNaN(start)) return "";
  const end = new Date(start);
  end.setDate(start.getDate() + Math.max(0, (numDays || 1) - 1));
  const fmt = (d) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
      d.getDate()
    ).padStart(2, "0")}`;
  return numDays > 1 ? `${fmt(start)} → ${fmt(end)}` : fmt(start);
};

const buildDays = (startISO, numDays) => {
  if (!startISO) return [];
  const n = Math.max(1, Number(numDays) || 1);
  const arr = [];
  const d0 = new Date(startISO + "T00:00:00");
  if (isNaN(d0)) return [];
  for (let i = 0; i < n; i++) {
    const d = new Date(d0);
    d.setDate(d0.getDate() + i);
    arr.push(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
        2,
        "0"
      )}-${String(d.getDate()).padStart(2, "0")}`
    );
  }
  return arr;
};

// Simple menu model: array of { day, mealType, recipeId }
const buildDutyRoster = (days, names) => {
  const out = [];
  const crew = (names || []).map((s) => (s ?? "").trim()).filter(Boolean);
  if (!crew.length) return out;

  const cyc = (i) => crew[i % crew.length];

  days.forEach((day, dIdx) => {
    MEALS.forEach((meal, mIdx) => {
      const base = dIdx * MEALS.length + mIdx;
      out.push({
        day,
        meal,
        cook: cyc(base),
        cleanup: cyc(base + 1),
        fire: cyc(base + 2),
        water: cyc(base + 3),
      });
    });
  });
  return out;
};

/* =========================
   App
   ========================= */
export default function App() {
  // Inject CSS (once)
  const cssOnce = useRef(false);
  useEffect(() => {
    if (cssOnce.current) return;
    cssOnce.current = true;
    const style = document.createElement("style");
    style.setAttribute("data-gm-style", "1");
    style.textContent = baseCss;
    document.head.appendChild(style);
    return () => {
      try {
        document.head.removeChild(style);
      } catch {}
    };
  }, []);

  // Core state
  const [recipes, setRecipes] = useState(loadLS("gm_recipes", defaultRecipes));
  const [names, setNames] = useState(loadLS("gm_names", defaultNames));
  const [trip, setTrip] = useState(loadLS("gm_trip", defaultTrip));
  const [menu, setMenu] = useState(loadLS("gm_menu", [])); // [{day, mealType, recipeId}]
  const [importBusy, setImportBusy] = useState(false);
  const [importMsg, setImportMsg] = useState("");

  // Persist state (auto-save)
  useEffect(() => {
    try {
      localStorage.setItem("gm_recipes", JSON.stringify(recipes || []));
    } catch {}
  }, [recipes]);

  useEffect(() => {
    try {
      localStorage.setItem("gm_names", JSON.stringify(names || []));
    } catch {}
  }, [names]);

  useEffect(() => {
    try {
      localStorage.setItem("gm_trip", JSON.stringify(trip || defaultTrip));
    } catch {}
  }, [trip]);

  useEffect(() => {
    try {
      localStorage.setItem("gm_menu", JSON.stringify(menu || []));
    } catch {}
  }, [menu]);

  const days = useMemo(
    () => buildDays(trip?.startDate, trip?.numDays),
    [trip?.startDate, trip?.numDays]
  );

  /* ---------- Import JSON ---------- */
  const handleImportJSON = async (file) => {
    if (!file) return;
    setImportBusy(true);
    setImportMsg("");
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const arr = Array.isArray(data?.recipes)
        ? data.recipes
        : Array.isArray(data)
        ? data
        : null;
      if (!arr)
        throw new Error(
          "Invalid file: expected { recipes: [...] } or an array."
        );
      const incoming = arr.map(normalizeRecipe);

      // Merge by id
      const merged = (() => {
        const map = new Map((recipes || []).map((r) => [r.id, r]));
        incoming.forEach((r) => map.set(r.id, r));
        return Array.from(map.values());
      })();

      setRecipes(merged);

      // Persist immediately in case Wix preview delays effects
      try {
        localStorage.setItem("gm_recipes", JSON.stringify(merged));
      } catch {}

      setImportMsg(`Imported ${incoming.length} recipes.`);
    } catch (e) {
      console.error(e);
      setImportMsg(e.message || "Import failed.");
    } finally {
      setImportBusy(false);
    }
  };

  /* ---------- Add a single recipe ---------- */
  const emptyRecipe = {
    id: "",
    name: "",
    mealType: "dinner",
    course: "main",
    serves: trip?.peopleCount || 8,
    ingredients: [],
    steps: [],
    tags: {},
    diet: {},
  };

  const [draft, setDraft] = useState(emptyRecipe);
  const addDraftIngredient = () =>
    setDraft((d) => ({
      ...d,
      ingredients: [...(d.ingredients || []), { item: "", qtyPerPerson: "", unit: "" }],
    }));
  const updateDraftIngredient = (idx, key, val) =>
    setDraft((d) => {
      const next = { ...d, ingredients: [...(d.ingredients || [])] };
      next.ingredients[idx] = { ...next.ingredients[idx], [key]: val };
      return next;
    });
  const removeDraftIngredient = (idx) =>
    setDraft((d) => {
      const next = { ...d, ingredients: [...(d.ingredients || [])] };
      next.ingredients.splice(idx, 1);
      return next;
    });

  const addDraftStep = () =>
    setDraft((d) => ({ ...d, steps: [...(d.steps || []), ""] }));
  const updateDraftStep = (idx, val) =>
    setDraft((d) => {
      const next = { ...d, steps: [...(d.steps || [])] };
      next.steps[idx] = val;
      return next;
    });
  const removeDraftStep = (idx) =>
    setDraft((d) => {
      const next = { ...d, steps: [...(d.steps || [])] };
      next.steps.splice(idx, 1);
      return next;
    });

  const saveDraft = () => {
    const toSave = normalizeRecipe(draft);
    setRecipes((prev) => {
      const map = new Map((prev || []).map((r) => [r.id, r]));
      map.set(toSave.id, toSave);
      const merged = Array.from(map.values());
      try {
        localStorage.setItem("gm_recipes", JSON.stringify(merged));
      } catch {}
      return merged;
    });
    setDraft({ ...emptyRecipe, id: "", name: "" });
  };

  /* ---------- Menu management ---------- */
  const recipesByMeal = useMemo(() => {
    const m = { breakfast: [], lunch: [], dinner: [] };
    (recipes || []).forEach((r) => m[r.mealType]?.push(r));
    return m;
  }, [recipes]);

  const setMenuRecipe = (day, mealType, recipeId) => {
    setMenu((prev) => {
      const next = [...(prev || [])];
      const i = next.findIndex((x) => x.day === day && x.mealType === mealType);
      if (i >= 0) next[i] = { day, mealType, recipeId };
      else next.push({ day, mealType, recipeId });
      return next;
    });
  };

  const findRecipe = (id) => (recipes || []).find((r) => r.id === id);

  /* ---------- Shopping List (very basic) ---------- */
  const shopping = useMemo(() => {
    // Sum ingredients for selected menu items; multiply qtyPerPerson by trip.peopleCount
    const need = {};
    const people = Number(trip?.peopleCount) || 8;

    (menu || []).forEach((slot) => {
      const rec = findRecipe(slot.recipeId);
      if (!rec) return;
      (rec.ingredients || []).forEach((ing) => {
        const key = `${ing.item}||${ing.unit || ""}`;
        const qty = Number(ing.qtyPerPerson) || 0;
        need[key] = (need[key] || 0) + qty * people;
      });
    });

    const rows = Object.entries(need).map(([key, total]) => {
      const [item, unit] = key.split("||");
      return { item, total, unit };
    });

    rows.sort((a, b) => a.item.localeCompare(b.item));
    return rows;
  }, [menu, recipes, trip?.peopleCount]);

  /* ---------- Duty roster ---------- */
  const duty = useMemo(() => buildDutyRoster(days, names), [days, names]);

  /* ---------- Reset (clear local) ---------- */
  const handleResetAll = () => {
    if (!confirm("Clear all locally saved data?")) return;
    try {
      localStorage.removeItem("gm_recipes");
      localStorage.removeItem("gm_names");
      localStorage.removeItem("gm_trip");
      localStorage.removeItem("gm_menu");
    } catch {}
    setRecipes(defaultRecipes);
    setNames(defaultNames);
    setTrip(defaultTrip);
    setMenu([]);
  };

  return (
    <div className="gm-root">
      {/* Title */}
      <div className="gm-row" style={{ marginBottom: 12 }}>
        <div className="gm-h1">Grubmaster Planner</div>
        <div style={{ marginLeft: "auto" }} className="gm-actions">
          <button className="gm-btn danger" onClick={handleResetAll}>
            Start Over (clear local)
          </button>
        </div>
      </div>

      <div className="gm-grid">
        {/* Trip Setup */}
        <div className="gm-col-4">
          <div className="gm-card tight">
            <div className="gm-card-header">
              <div className="gm-card-title">Trip Setup</div>
              <div className="small">{fmtDateRange(trip?.startDate, trip?.numDays)}</div>
            </div>
            <div className="gm-card-body">
              <div className="gm-row">
                <label className="gm-label">Trip Name</label>
                <input
                  className="gm-input"
                  value={trip.tripName}
                  onChange={(e) => setTrip({ ...trip, tripName: e.target.value })}
                  placeholder="e.g., Oct Campout"
                />
              </div>
              <div className="gm-row">
                <label className="gm-label">Start Date</label>
                <input
                  className="gm-input"
                  type="date"
                  value={trip.startDate}
                  onChange={(e) => setTrip({ ...trip, startDate: e.target.value })}
                />
              </div>
              <div className="gm-row">
                <label className="gm-label"># Days</label>
                <input
                  className="gm-input"
                  type="number"
                  min={1}
                  value={trip.numDays}
                  onChange={(e) => setTrip({ ...trip, numDays: Number(e.target.value || 1) })}
                />
              </div>
              <div className="gm-row">
                <label className="gm-label"># People</label>
                <input
                  className="gm-input"
                  type="number"
                  min={1}
                  value={trip.peopleCount}
                  onChange={(e) =>
                    setTrip({ ...trip, peopleCount: Number(e.target.value || 1) })
                  }
                />
              </div>
            </div>
          </div>
        </div>

        {/* Roster (Scouts 1–10) */}
        <div className="gm-col-4">
          <div className="gm-card">
            <div className="gm-card-header">
              <div className="gm-card-title">Scouts 1–10</div>
            </div>
            <div className="gm-card-body">
              {Array.from({ length: 10 }).map((_, idx) => (
                <div key={idx} className="gm-row">
                  <label className="gm-label">#{idx + 1}</label>
                  <input
                    className="gm-input"
                    type="text"
                    value={names[idx] ?? ""}
                    onChange={(e) => {
                      const v = e.target.value;
                      setNames((prev) => {
                        const next = [...(prev || [])];
                        next[idx] = v;
                        return next;
                      });
                    }}
                    placeholder={`Scout ${idx + 1}`}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Import / Add Recipe */}
        <div className="gm-col-4">
          <div className="gm-card tight">
            <div className="gm-card-header">
              <div className="gm-card-title">Recipes</div>
            </div>
            <div className="gm-card-body">
              {/* Import */}
              <div className="gm-row" style={{ alignItems: "center" }}>
                <label className="gm-label">Import JSON</label>
                <input
                  className="gm-input"
                  type="file"
                  accept="application/json"
                  onChange={(e) => handleImportJSON(e.target.files?.[0])}
                />
              </div>
              {importBusy ? (
                <div className="small">Importing…</div>
              ) : importMsg ? (
                <div className="small">{importMsg}</div>
              ) : null}

              <div style={{ height: 8 }} />

              {/* Add Recipe (compact) */}
              <div className="gm-subtle" style={{ marginBottom: 6 }}>Add Recipe</div>
              <div className="gm-row">
                <label className="gm-label">Name</label>
                <input
                  className="gm-input"
                  value={draft.name}
                  onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                  placeholder="Recipe name"
                />
              </div>
              <div className="gm-row">
                <label className="gm-label">Meal</label>
                <select
                  className="gm-select"
                  value={draft.mealType}
                  onChange={(e) => setDraft((d) => ({ ...d, mealType: e.target.value }))}
                >
                  {MEALS.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                  <option value="dinner">dinner</option>
                </select>
              </div>
              <div className="gm-row">
                <label className="gm-label">Course</label>
                <select
                  className="gm-select"
                  value={draft.course}
                  onChange={(e) => setDraft((d) => ({ ...d, course: e.target.value }))}
                >
                  <option value="main">main</option>
                  <option value="side">side</option>
                  <option value="drink">drink</option>
                  <option value="dessert">dessert</option>
                </select>
              </div>
              <div className="gm-row">
                <label className="gm-label">Serves</label>
                <input
                  className="gm-input"
                  type="number"
                  min={1}
                  value={draft.serves}
                  onChange={(e) => setDraft((d) => ({ ...d, serves: Number(e.target.value || 1) }))}
                />
              </div>

              <div className="gm-subtle" style={{ margin: "8px 0 6px" }}>Ingredients</div>
              {(draft.ingredients || []).map((ing, idx) => (
                <div key={idx} className="gm-row">
                  <input
                    className="gm-input"
                    placeholder="Item"
                    value={ing.item}
                    onChange={(e) => updateDraftIngredient(idx, "item", e.target.value)}
                  />
                  <input
                    className="gm-input"
                    placeholder="Qty/Person"
                    type="number"
                    value={ing.qtyPerPerson}
                    onChange={(e) => updateDraftIngredient(idx, "qtyPerPerson", e.target.value)}
                    style={{ maxWidth: 120 }}
                  />
                  <input
                    className="gm-input"
                    placeholder="Unit"
                    value={ing.unit || ""}
                    onChange={(e) => updateDraftIngredient(idx, "unit", e.target.value)}
                    style={{ maxWidth: 120 }}
                  />
                  <button className="gm-btn" onClick={() => removeDraftIngredient(idx)}>−</button>
                </div>
              ))}
              <div className="gm-actions" style={{ marginBottom: 6 }}>
                <button className="gm-btn" onClick={addDraftIngredient}>+ Ingredient</button>
              </div>

              <div className="gm-subtle" style={{ margin: "8px 0 6px" }}>Steps</div>
              {(draft.steps || []).map((st, idx) => (
                <div key={idx} className="gm-row">
                  <input
                    className="gm-input"
                    placeholder={`Step ${idx + 1}`}
                    value={st}
                    onChange={(e) => updateDraftStep(idx, e.target.value)}
                  />
                  <button className="gm-btn" onClick={() => removeDraftStep(idx)}>−</button>
                </div>
              ))}
              <div className="gm-actions" style={{ marginBottom: 8 }}>
                <button className="gm-btn" onClick={addDraftStep}>+ Step</button>
              </div>

              <div className="gm-actions">
                <button className="gm-btn primary" onClick={saveDraft}>Save Recipe</button>
                <button className="gm-btn" onClick={() => setDraft(emptyRecipe)}>Clear</button>
              </div>
            </div>
          </div>
        </div>

        {/* Library (scroll) */}
        <div className="gm-col-12">
          <div className="gm-card gm-scroll">
            <div className="gm-card-header">
              <div className="gm-card-title">Recipe Library</div>
              <div className="small">{(recipes || []).length} total</div>
            </div>
            <div className="gm-card-body">
              {(recipes || []).length === 0 ? (
                <div className="small">No recipes yet. Import JSON or add one above.</div>
              ) : (
                <table className="gm-table">
                  <thead>
                    <tr>
                      <th style={{width: "28%"}}>Name</th>
                      <th style={{width: "10%"}}>Meal</th>
                      <th style={{width: "12%"}}>Course</th>
                      <th style={{width: "8%"}}>Serves</th>
                      <th>Ingredients</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(recipes || []).map((r) => (
                      <tr key={r.id}>
                        <td>{r.name}</td>
                        <td>{r.mealType}</td>
                        <td>{r.course}</td>
                        <td>{r.serves}</td>
                        <td>
                          {(r.ingredients || []).slice(0, 4).map((i, ii) => (
                            <span key={ii} className="gm-chip">
                              {i.item}{i.unit ? ` (${i.unit})` : ""}
                            </span>
                          ))}
                          {(r.ingredients || []).length > 4 ? <span className="small">+ more</span> : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>

        {/* Menu builder (grouped by day) */}
        <div className="gm-col-6">
          <div className="gm-card gm-scroll">
            <div className="gm-card-header">
              <div className="gm-card-title">Menu (by day)</div>
            </div>
            <div className="gm-card-body">
              {days.length === 0 ? (
                <div className="small">Pick a start date and # of days in Trip Setup.</div>
              ) : (
                days.map((day) => (
                  <div key={day} style={{ marginBottom: 12 }}>
                    <div className="gm-day">{day}</div>
                    {MEALS.map((meal) => {
                      const choices = recipesByMeal[meal] || [];
                      const selected = (menu || []).find(
                        (m) => m.day === day && m.mealType === meal
                      );
                      return (
                        <div key={meal} className="gm-row">
                          <label className="gm-label" style={{ width: 120, minWidth: 120, textTransform:"capitalize" }}>{meal}</label>
                          <select
                            className="gm-select"
                            value={selected?.recipeId || ""}
                            onChange={(e) => setMenuRecipe(day, meal, e.target.value)}
                          >
                            <option value="">— choose recipe —</option>
                            {choices.map((r) => (
                              <option key={r.id} value={r.id}>
                                {r.name} {r.course !== "main" ? `(${r.course})` : ""}
                              </option>
                            ))}
                          </select>
                        </div>
                      );
                    })}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Shopping list */}
        <div className="gm-col-6">
          <div className="gm-card gm-scroll">
            <div className="gm-card-header">
              <div className="gm-card-title">Shopping List</div>
              <div className="small">For {Number(trip?.peopleCount) || 8} people</div>
            </div>
            <div className="gm-card-body">
              {shopping.length === 0 ? (
                <div className="small">Select menu items to generate a shopping list.</div>
              ) : (
                <table className="gm-table">
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th style={{ width: 120, textAlign:"right" }}>Total</th>
                      <th style={{ width: 120 }}>Unit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shopping.map((row, idx) => (
                      <tr key={idx}>
                        <td>{row.item}</td>
                        <td style={{ textAlign: "right" }}>{Number(row.total).toFixed(2)}</td>
                        <td>{row.unit}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>

        {/* Duty roster */}
        <div className="gm-col-12">
          <div className="gm-card gm-scroll">
            <div className="gm-card-header">
              <div className="gm-card-title">Duty Roster</div>
            </div>
            <div className="gm-card-body">
              {days.length === 0 ? (
                <div className="small">Set your dates first.</div>
              ) : (
                days.map((day) => (
                  <div key={day} style={{ marginBottom: 12 }}>
                    <div className="gm-day">{day}</div>
                    <table className="gm-table">
                      <thead>
                        <tr>
                          <th style={{width:120}}>Meal</th>
                          <th>Cook</th>
                          <th>Cleanup</th>
                          <th>Fire</th>
                          <th>Water</th>
                        </tr>
                      </thead>
                      <tbody>
                        {MEALS.map((meal) => {
                          const row = duty.find((r) => r.day === day && r.meal === meal);
                          return (
                            <tr key={meal}>
                              <td style={{textTransform:"capitalize"}}>{meal}</td>
                              <td>{row?.cook || ""}</td>
                              <td>{row?.cleanup || ""}</td>
                              <td>{row?.fire || ""}</td>
                              <td>{row?.water || ""}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
