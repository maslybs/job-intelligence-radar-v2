// Extracted unchanged from the production-compatible Worker.
export function unpack(result) {
  const raw = result?.choices?.[0]?.message?.content ?? result?.output_text ?? result?.response ?? result?.text ?? result;
  if (typeof raw === "string") return JSON.parse(raw);
  if (raw && typeof raw === "object") return raw;
  throw new Error("unknown model output format");
}
export function clampScore(n) {
  return Number.isFinite(Number(n)) ? Math.min(100, Math.max(0, Math.round(Number(n)))) : 0;
}
