// web-component.jsx
import React from "react";
import { createRoot } from "react-dom/client";
import App from "./src/App.jsx"; // adjust path if your App.jsx lives elsewhere

const TAG = "grubmaster-app";

function safeBooleanAttr(el, name) {
  // JSX <grubmaster-app embed></grubmaster-app> => true
  return el.hasAttribute(name);
}

function getProps(el) {
  return {
    initialTroopId:
      el.getAttribute("troop") || el.getAttribute("data-troop") || "",
    embed: safeBooleanAttr(el, "embed"),
  };
}

if (!customElements.get(TAG)) {
  class GrubmasterApp extends HTMLElement {
    static get observedAttributes() {
      return ["troop", "data-troop", "embed"];
    }

    constructor() {
      super();
      this._mounted = false;
      // Shadow DOM keeps Wix CSS from interfering
      this._shadow = this.attachShadow({ mode: "open" });
      // A container node for React root (inside shadow)
      this._container = document.createElement("div");
      this._shadow.appendChild(this._container);
      this._root = null;
    }

    connectedCallback() {
      // Avoid double-mounts if Wix reattaches
      if (this._mounted) return;
      this._mounted = true;

      if (!this._root) {
        this._root = createRoot(this._container);
      }
      this._render();
    }

    disconnectedCallback() {
      // Clean unmount (prevents dangling roots and #418/#422 class errors)
      if (this._root) {
        this._root.unmount();
        this._root = null;
      }
      this._mounted = false;
    }

    attributeChangedCallback() {
      // Re-render when attributes change (e.g., troop id)
      if (this._mounted) this._render();
    }

    _render() {
      // Ultra-defensive: never let an undefined value reach App
      const props = getProps(this);
      try {
        this._root.render(
          <React.StrictMode>
            <App
              initialTroopId={String(props.initialTroopId || "")}
              embed={!!props.embed}
            />
          </React.StrictMode>
        );
      } catch (err) {
        // If something goes wrong, show an inline error instead of a blank widget
        const msg = (err && err.message) || String(err);
        this._container.innerHTML = `
          <div style="font:14px/1.4 ui-sans-serif,system-ui; padding:12px; border:1px solid #e11; border-radius:8px; background:#fee;">
            <strong>Grubmaster App Error</strong><br/>${msg}
          </div>`;
        // eslint-disable-next-line no-console
        console.error("[grubmaster-app] render failed:", err);
      }
    }
  }

  customElements.define(TAG, GrubmasterApp);
}
