// happy-dom differs from a real browser in ways the probes notice. Make the test DOM look like an ordinary browser;
// individual tests then opt in to automation.

// 1. happy-dom reports navigator.webdriver = true. A bound function stringifies as native code, like the real getter.
Object.defineProperty(Navigator.prototype, "webdriver", { configurable: true, get: (() => false).bind(null) });

// 2. happy-dom implements these in JavaScript; real browsers have native functions.
//    A transparent Proxy keeps behaviour and stringifies as native code.
const nativeLooking = <T extends object>(fn: T): T => new Proxy(fn, {});
Element.prototype.attachShadow = nativeLooking(Element.prototype.attachShadow);
if (typeof customElements !== "undefined") customElements.define = nativeLooking(customElements.define.bind(customElements));
const permissions = (navigator as Navigator & { permissions?: { query?: unknown } }).permissions;
if (permissions && typeof permissions.query === "function") permissions.query = nativeLooking(permissions.query.bind(permissions));
