// web-component.jsx
import * as React from "react";
import * as ReactDOM from "react-dom/client";
import App from "./src/App.jsx";

// IMPORTANT: point this to where your stylesheet actually is.
// If your CSS is at src/index.css, keep as-is. Otherwise adjust the path.
import cssText from "./src/index.css?inline";

class GrubmasterApp extends HTMLElement {
  static observedAttributes = ["troop", "data-troop"];

  constructor() {
    super();
    this._shadow = this.attachShadow({ mode: "open" });

    // Inject CSS into Shadow DOM (prevents Wix 404s to /index.css)
    const style = document.createElement("style");
    style.textContent = cssText;
    this._shadow.appendChild(style);

    // Mount point
    this._mount = document.createElement("div");
    this._shadow.appendChild(this._mount);

    this._root = null;
  }

  connectedCallback() {
    this._render();
  }

  attributeChangedCallback() {
    this._render();
  }

  disconnectedCallback() {
    try { this._root?.unmount(); } catch {}
    this._root = null;
  }

  _render() {
    const troopAttr =
      this.getAttribute("troop") || this.getAttribute("data-troop") || "";

    const props = {
      initialTroopId: troopAttr,
      embed: true, // so App knows it's embedded
    };

    if (!this._root) {
      this._root = ReactDOM.createRoot(this._mount);
    }
    this._root.render(React.createElement(App, props));
  }
}

if (!customElements.get("grubmaster-app")) {
  customElements.define("grubmaster-app", GrubmasterApp);
}
