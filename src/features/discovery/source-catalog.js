import {RADAR_SETTINGS} from "../../config/radar.generated.js";
// Config is the single source of truth for active discovery sources.
export function baseSources(settings=RADAR_SETTINGS) {
  return (settings.jobs?.sources || settings.sources).items.map(item=>structuredClone(item));
}
