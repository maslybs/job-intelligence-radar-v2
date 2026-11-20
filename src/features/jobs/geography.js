import {RADAR_SETTINGS} from "../../config/radar.generated.js";

// Conservative geographical gate: only reject an explicit regional exclusion.
// Unknown locations are retained for later evidence-based AI evaluation.
export function geoClearlyExcludesApplicant(job, settings=RADAR_SETTINGS) {
  const src=String(job.source||"");
  if(!src.startsWith("Himalayas") && !src.startsWith("Jobicy")) return false;
  const region=String(job.region||"").trim().toLowerCase();
  if(!region) return false;
  if(/\b(?:worldwide|anywhere|global|any country)\b/i.test(region)) return false;
  const accepted=[settings.profile.country,...settings.search.allowedRegions]
    .map(x=>String(x).trim().toLowerCase())
    .filter(x=>x && !["worldwide","global","anywhere"].includes(x));
  if(accepted.some(x=>region.includes(x))) return false;
  if(accepted.includes("united states") && /\b(?:usa|u\.s\.a\.|u\.s\.)\b/i.test(region)) return false;
  if(accepted.includes("europe") && /\b(?:europe|european|eu|emea)\b/i.test(region)) return false;
  // No assertion about unspecified locations: explicit incompatible region only.
  return true;
}
