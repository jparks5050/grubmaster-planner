// src/main.jsx
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./index.css";

window.onerror = (msg, src, line, col, err) => {
  console.error("[window.onerror]", msg, src, line, col, err);
};
window.onunhandledrejection = (e) => {
  console.error("[unhandledrejection]", e.reason || e);
};

const rootEl = document.getElementById("root");
if (!rootEl) {
  throw new Error('No #root element found in index.html');
}
ReactDOM.createRoot(rootEl).render(<App />);

