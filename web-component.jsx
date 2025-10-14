// web-component.jsx
import React from "react";
import { createRoot } from "react-dom/client";
import App from "./src/App.jsx";

// IMPORTANT: pull your app styles as a raw string and inject into the shadow root
// Adjust the path if your CSS lives elsewhere.
import appCss from "./src/index.css?raw";

const TAG = "grubmaster-app";

function boolAttr(el, name) {
  return el.hasAttribute(name);
}

function getProps(el) {
  return {
    initialTroopId: el.getAttribute("troop") || el.getAttribute("data-troop") || "",
    embed: boolAttr(el, "embed"),
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

      // Create shadow root so Wix CSS can’t leak in
      this._shadow = this.attachShadow({ mode: "open" });

      // Adopt CSS inside the shadow (works in all modern browsers; fallback provided)
      this._applyStyles();

      // React root container inside the shadow
      this._container = document.createElement("div");
      // Establish a stable base style so layout doesn’t collapse
      this._container.style.cssText =
        "box-sizing:border-box; width:100%; max-width:1200px; margin:0 auto; padding:0;";
      this._shadow.appendChild(this._container);

      this._root = null;
    }

    _applyStyles() {
      const baseReset = `
  :host{ all:initial; display:block; width:100%; }
  *,*::before,*::after{ box-sizing:border-box; }
`;

      const fullCss = `${baseReset}\n${appCss || ""}`;

      // Prefer adoptedStyleSheets
      if ("adoptedStyleSheets" in Document.prototype &&
          "replaceSync" in CSSStyleSheet.prototype) {
        const sheet = new CSSStyleSheet();
        sheet.replaceSync(fullCss);
        this._shadow.adoptedStyleSheets = [sheet];
      } else {
        const style = document.createElement("style");
        style.textContent = fullCss;
        this._shadow.appendChild(style);
      }
    }

    connectedCallback() {
      if (this._mounted) return;
      this._mounted = true;

      if (!this._root) {
        this._root = createRoot(this._container);
      }
      this._render();
    }

    disconnectedCallback() {
      if (this._root) {
        this._root.unmount();
        this._root = null;
      }
      this._mounted = false;
    }

    attributeChangedCallback() {
      if (this._mounted) this._render();
    }

    _render() {
      const props = getProps(this);

      try {
        // If StrictMode causes double-effects with Wix, you can remove it.
        this._root.render(
  <App initialTroopId={String(props.initialTroopId || "")} embed={!!props.embed} />
);
      } catch (err) {
        const msg = (err && err.message) || String(err);
        this._container.innerHTML = `
          <div style="font:14px/1.4 ui-sans-serif,system-ui; padding:12px; border:1px solid #e11; border-radius:8px; background:#fee;">
            <strong>Grubmaster App Error</strong><br/>${msg}
          </div>`;
        console.error("[grubmaster-app] render failed:", err);
      }
    }
  }

  customElements.define(TAG, GrubmasterApp);
}
