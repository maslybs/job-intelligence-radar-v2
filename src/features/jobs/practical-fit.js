import {RADAR_SETTINGS} from "../../config/radar.generated.js";
// Keep the radar focused on interviews that the candidate can realistically pass.
// A mandatory gap is different from an ordinary stretch or a learnable tool.
export function practicalFitScore(rawScore, interviewRisk, engagement) {
  const score = Math.max(0, Math.min(100, Math.round(Number(rawScore) || 0)));
  if (interviewRisk === "high" && engagement !== "contract") {
    // The regular P1/P2 job threshold is 85. Still retain a P3 review record.
    return Math.min(RADAR_SETTINGS.search.minQualifiedScore - 6, score);
  }
  return score;
}
