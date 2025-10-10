// 1) Import the compiled CSS as a string (so we can put it into Shadow DOM)
import cssText from "./src/index.css?inline"; // <-- NOTE the path: ./src/index.css

// (rest of your imports)
import * as React from "react";
import * as ReactDOM from "react-dom/client";
import App from "./src/App.jsx";

(function bootstrap() {
  // Avoid double registration if Wix hot-swaps pages
  if (customElements.get("grubmaster-app")) {
    console.info("[grubmaster-app] already defined");
    return;
  }

  const attrBool = (el, name, def = false) => {
    if (!el.hasAttribute(name)) return def;
    const v = el.getAttribute(name);
    return v === "" || v === "true" || v === "1";
  };

  class GrubmasterApp extends HTMLElement {
  constructor() {
    super();
    this._shadow = this.attachShadow({ mode: "open" });

    // Inject CSS into Shadow DOM (works on Wix and avoids /index.css 404s)
    const style = document.createElement("style");
    style.textContent = cssText;
    this._shadow.appendChild(style);

    const mount = document.createElement("div");
    this._shadow.appendChild(mount);
    this._mount = mount;
    this._root = null;
  }

  connectedCallback() {
    if (!this._root) this._root = ReactDOM.createRoot(this._mount);
    this._root.render(
      React.createElement(App, {
        initialTroopId:
          this.getAttribute("troop") || this.getAttribute("data-troop") || "",
        embed: true,
      })
    );
  }

  disconnectedCallback() {
    try { this._root?.unmount(); } catch {}
    this._root = null;
  }
}

if (!customElements.get("grubmaster-app")) {
  customElements.define("grubmaster-app", GrubmasterApp);
}
    _render() {
      const troopAttr = this.getAttribute("troop") || this.getAttribute("data-troop") || "";
      const props = {
        initialTroopId: troopAttr,
        embed: attrBool(this, "embed", true), // default true on Wix pages
      };
      this._root.render(React.createElement(App, props));
    }
  }

  customElements.define("grubmaster-app", GrubmasterApp);
  console.info("[grubmaster-app] defined");
})();
