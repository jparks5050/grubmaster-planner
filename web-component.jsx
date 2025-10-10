// web-component.js  (JS-only to avoid JSX parse issues)
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./src/App.jsx";
import stylesUrl from "./src/index.css?url";

(function () {
  // Resolve our own script URL (works in Wix)
  const thisScriptSrc =
    document.currentScript?.src ||
    ([...document.scripts].map(s => s.src).find(u => u?.includes("grubmaster-app.js")) || "");

  class GrubmasterApp extends HTMLElement {
    static get observedAttributes() {
      return [
        "troop-id",
        "embed",
        "firebase-api-key",
        "firebase-project-id",
        "firebase-auth-domain",
        "firebase-app-id",
      ];
    }
    constructor() {
      super();
      this.shadow = this.attachShadow({ mode: "open" });

      // ✅ Load CSS from the **Vercel** origin, not Wix
   if (stylesUrl) {
     const link = document.createElement("link");
     link.rel = "stylesheet";
     link.href = new URL(stylesUrl, import.meta.url).href; // absolute to Vercel
     this.shadow.appendChild(link);
   }

      this.mount = document.createElement("div");
      this.shadow.appendChild(this.mount);
    }

    connectedCallback() { this.renderReact(); }
    attributeChangedCallback() { this.renderReact(); }

    getPropsFromAttrs() {
      const initialTroopId = this.getAttribute("troop-id") || "";
      const embed = this.getAttribute("embed") === "1" || this.hasAttribute("embed");

      // Optional Firebase via attributes
      const apiKey = this.getAttribute("firebase-api-key");
      const projectId = this.getAttribute("firebase-project-id");
      const authDomain = this.getAttribute("firebase-auth-domain");
      const appId = this.getAttribute("firebase-app-id");
      if (apiKey && projectId) {
        window.__FIREBASE_CONFIG__ = { apiKey, projectId, ...(authDomain && { authDomain }), ...(appId && { appId }) };
      }
      return { initialTroopId, embed };
    }

    renderReact() {
      const props = this.getPropsFromAttrs();
      if (!this.root) this.root = ReactDOM.createRoot(this.mount);
      // no JSX here
      this.root.render(React.createElement(App, props));
    }
  }

  // ✅ Safe define (won’t throw if already defined)
  try {
    if (!customElements.get("grubmaster-app")) {
      customElements.define("grubmaster-app", GrubmasterApp);
    }
    // simple breadcrumb for debugging
    window.__GM_WC_READY__ = true;
  } catch (err) {
    console.error("Grubmaster WC init error:", err);
  }
})();
