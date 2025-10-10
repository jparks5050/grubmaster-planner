// web-component.js
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./src/App.jsx";

// Pull your compiled CSS into the Shadow DOM.
// The ?url suffix tells Vite to give us the emitted asset URL at build time.
import stylesUrl from "./src/index.css?url";

class GrubmasterApp extends HTMLElement {
  static get observedAttributes() {
    return [
      "troop-id",
      "embed",
      // Optional Firebase config via attributes (or provide via window.__FIREBASE_CONFIG__)
      "firebase-api-key",
      "firebase-project-id",
      "firebase-auth-domain",
      "firebase-app-id",
    ];
  }

  constructor() {
    super();
    this.shadow = this.attachShadow({ mode: "open" });

    // Inject CSS into Shadow DOM for isolation so Wix styles don't leak
    if (stylesUrl) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = stylesUrl;
      this.shadow.appendChild(link);
    }

    // Mount node where React will render
    this.mount = document.createElement("div");
    this.shadow.appendChild(this.mount);
  }

  connectedCallback() {
    this.renderReact();
  }

  attributeChangedCallback() {
    this.renderReact();
  }

  getPropsFromAttrs() {
    // Attributes → props for App
    const initialTroopId = this.getAttribute("troop-id") || "";
    const embed = this.getAttribute("embed") === "1" || this.hasAttribute("embed");

    // Optional: set Firebase config via attributes (safer: do this site-wide in Wix Head)
    const apiKey = this.getAttribute("firebase-api-key");
    const projectId = this.getAttribute("firebase-project-id");
    const authDomain = this.getAttribute("firebase-auth-domain");
    const appId = this.getAttribute("firebase-app-id");
    if (apiKey && projectId) {
      window.__FIREBASE_CONFIG__ = {
        apiKey,
        projectId,
        ...(authDomain ? { authDomain } : {}),
        ...(appId ? { appId } : {}),
      };
    }

    return { initialTroopId, embed };
  }

  renderReact() {
    const props = this.getPropsFromAttrs();
    if (!this.root) {
      this.root = ReactDOM.createRoot(this.mount);
    }
    this.root.render(<App {...props} />);
  }

  disconnectedCallback() {
    // Optionally: this.root?.unmount();
  }
}

customElements.define("grubmaster-app", GrubmasterApp);
