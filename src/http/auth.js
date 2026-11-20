// Signed Inbox sessions and constant-time authentication comparisons.
// Extracted from the production-compatible Worker without modifying the bodies.

export var enc = new TextEncoder();

export async function sign(env, s) {
  if(!env.INBOX_PASSWORD)throw Error("Inbox authentication not configured");
  const k = await crypto.subtle.importKey("raw", enc.encode(env.INBOX_PASSWORD), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const x = await crypto.subtle.sign("HMAC", k, enc.encode(s));
  return [...new Uint8Array(x)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function logged(req, env) {
  if(!env.INBOX_PASSWORD)return false;
  const c = (req.headers.get("Cookie") || "").match(/(?:^|;\s*)jr=([^;]+)/)?.[1];
  if (!c) return false;
  const [expiry, mac] = c.split(".");
  if (!/^\d+$/.test(expiry || "") || Date.now() > Number(expiry) || !/^[0-9a-f]{64}$/.test(mac || "")) return false;
  return await sign(env, expiry) === mac;
}
