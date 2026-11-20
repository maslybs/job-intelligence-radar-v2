// API response helpers and common headers.
// Extracted from the production-compatible Worker without modifying the bodies.
import { __name } from "../platform/function-names.js";

export var json = /* @__PURE__ */ __name((x, code = 200) => new Response(JSON.stringify(x), { status: code, headers: { "content-type": "application/json", "Cache-Control": "no-store" } }), "json");

export var HEADERS = { "content-type": "application/json", "cache-control": "no-store" };

export var unauthorized = /* @__PURE__ */ __name(() => new Response(JSON.stringify({ error: "unauthorized" }), { status: 403, headers: HEADERS }), "unauthorized");
