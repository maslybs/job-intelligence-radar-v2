// Pure formatting, date, URL and timestamp helpers.
// Extracted from the production-compatible Worker without modifying the bodies.
import {normalizeSourceDate} from "../features/discovery/rss-date.js";
import {RADAR_SETTINGS} from "../config/radar.generated.js";
import { __name } from "./function-names.js";

export var sourceDate = /* @__PURE__ */ __name(normalizeSourceDate, "sourceDate");

export var locations = /* @__PURE__ */ __name((a) => Array.isArray(a) ? a.map((x) => typeof x === "string" ? x : x?.name || x?.country || x?.location || x?.label || "").filter(Boolean).join(", ") : "", "locations");

export var text = /* @__PURE__ */ __name((s) => String(s || "").replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/<[^>]+>/g, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&quot;/gi, '"').replace(/&nbsp;/gi, " ").replace(/\s+/g, " ").trim(), "text");

export var esc = /* @__PURE__ */ __name((s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]), "esc");

export var tag = /* @__PURE__ */ __name((b, n) => text(b.match(new RegExp("<(?:[a-z0-9_-]+:)?" + n + "(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:[a-z0-9_-]+:)?" + n + ">", "i"))?.[1]), "tag");

export var iso = /* @__PURE__ */ __name(() => (/* @__PURE__ */ new Date()).toISOString(), "iso");

export var kyiv = /* @__PURE__ */ __name(() => Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: RADAR_SETTINGS.notifications.timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" }).formatToParts(/* @__PURE__ */ new Date()).filter((x) => x.type !== "literal").map((x) => [x.type, x.value])), "kyiv");

export var kyivDay = /* @__PURE__ */ __name(() => {
  const d = kyiv();
  return [d.year, d.month, d.day].join("-");
}, "kyivDay");

export var urlClean = /* @__PURE__ */ __name((x) => {
  try {
    const u = new URL(x);
    if (!["http:", "https:"].includes(u.protocol)) return "";
    ["utm_source", "utm_medium", "utm_campaign", "utm_content", "gclid", "fbclid"].forEach((k) => u.searchParams.delete(k));
    u.hash = "";
    return u.toString();
  } catch {
    return "";
  }
}, "urlClean");
