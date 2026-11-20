// Extracted unchanged from the production-compatible Worker.
export async function sha(s) {
  const a = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(a)].map((x) => x.toString(16).padStart(2, "0")).join("").slice(0, 28);
}
