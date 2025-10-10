// web-component.jsx
import cssHref from './index.css?url';
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
      // Give it some space even if no CSS is present
      const mount = document.createElement("div");
      mount.style.minHeight = "200px";
      this._shadow.appendChild(mount);
      this._mount = mount;
      this._root = null;
      console.info("[grubmaster-app] constructed");
      const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = cssHref;          // <- points to the emitted CSS asset
this._shadow.appendChild(link);
    }

    static get observedAttributes() { return ["troop", "data-troop", "embed", "debug"]; }

    connectedCallback() {
      try {
        if (!this._root) this._root = ReactDOM.createRoot(this._mount);
        this._render();
        console.info("[grubmaster-app] connected + rendered");
      } catch (e) {
        console.error("[grubmaster-app] render error", e);
        this._shadow.innerHTML = `<pre style="color:#b00020;font:12px/1.4 ui-monospace,monospace;">${String(e && e.stack || e)}</pre>`;
      }
    }

    attributeChangedCallback() {
      if (this._root) this._render();
    }

    disconnectedCallback() {
      try {
        if (this._root) { this._root.unmount(); this._root = null; }
        console.info("[grubmaster-app] unmounted");
      } catch {}
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
