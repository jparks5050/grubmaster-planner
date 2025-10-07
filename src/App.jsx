// src/App.jsx
import React from "react";

export default function App() {
  // Prove render is happening
  console.log("[App] Rendered");

  // Huge visible block
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#111",
        color: "#0ff",
        padding: 24,
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <h1 style={{ fontSize: 32, marginBottom: 8 }}>
        ✅ App rendered (no Firebase yet)
      </h1>
      <p>If you can see this, React mounted correctly.</p>
      <p>
        Time: <strong>{new Date().toLocaleString()}</strong>
      </p>
      <p>
        If this doesn’t show, the issue is outside your React code
        (e.g. the bundle didn’t load).
      </p>
    </div>
  );
}
