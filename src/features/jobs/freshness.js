import {RADAR_SETTINGS} from "../../config/radar.generated.js";
export function ageOK(x, now=Date.now()) {
  if (!x.date) return true;
  const date=Date.parse(x.date);
  const maxAge=String(x.source||"").startsWith("DOU ·") ? RADAR_SETTINGS.search.douMaxAgeDays : RADAR_SETTINGS.search.maxAgeDays;
  return Number.isFinite(date) && date<=now+864e5 && date>now-maxAge*864e5;
}
