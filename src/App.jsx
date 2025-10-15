// src/App.jsx
import React from "react";

function App() {
  return (
    <div style={{ fontFamily: "system-ui, sans-serif", padding: 16 }}>
      <header style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 16 }}>
        <h1 style={{ margin: 0 }}>Scouts BSA Grubmaster Planner</h1>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => alert("Export coming soon")}>Export Recipes</button>
          <label>
            <input type="file" accept=".json" style={{ display: "none" }} onChange={() => alert("Import coming soon")} />
            <span style={{ cursor: "pointer", padding: "6px 12px", border: "1px solid #ccc", borderRadius: 6 }}>Import Recipes</span>
          </label>
          <button onClick={() => alert("Reset coming soon")}>Reset</button>
        </div>
      </header>

      <main style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <section style={{ padding: 12, border: "1px solid #eee", borderRadius: 8 }}>
          <h2 style={{ marginTop: 0 }}>Roster</h2>
          <p style={{ color: "#666" }}>(demo content)</p>
        </section>

        <section style={{ padding: 12, border: "1px solid #eee", borderRadius: 8 }}>
          <h2 style={{ marginTop: 0 }}>Recipes Library</h2>
          <p style={{ color: "#666" }}>(demo content)</p>
        </section>
      </main>

      <footer style={{ marginTop: 24, color: "#999" }}>
        © {new Date().getFullYear()} Scouts BSA Grubmaster Planner
      </footer>
    </div>
  );
}

export default App;
