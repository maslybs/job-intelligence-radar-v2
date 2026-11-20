import {RADAR_SETTINGS} from "../../config/radar.generated.js";
export const EXCLUDED_SEARCH_TOKENS=/\b(?:cofounder|co-founder|learnprogramming|tutorials?|homework|internship|resume review|equity.only)\b/i;
export function focusedRedditTargets(){
 const entries=[],seen=new Set();
 for(const lane of RADAR_SETTINGS.reddit.expertiseLanes){
  for(const sub of lane.subs){
   if(!/^[A-Za-z0-9_]{2,32}$/.test(sub))continue;
   const id="sub:"+sub.toLowerCase();
   if(!seen.has(id)){seen.add(id);entries.push({id,kind:"sub",term:sub,family:"expertise_"+lane.id})}
  }
  for(const [sub,phrase] of lane.searches){
   if(!/^[A-Za-z0-9_]{2,32}$/.test(sub)||phrase.length>45)continue;
   const term=sub+"::"+phrase,id="subquery:"+term.toLowerCase();
   if(!seen.has(id)){seen.add(id);entries.push({id,kind:"subquery",term,family:"expertise_"+lane.id})}
  }
 }
 for(const phrase of RADAR_SETTINGS.reddit.strongShortQueries){
  const id="query:"+phrase.toLowerCase();
  if(!seen.has(id)){seen.add(id);entries.push({id,kind:"query",term:phrase,family:"expertise_direct"})}
 }
 return entries;
}
export const EXPERTISE_QUALIFICATION_HINT = [
  "Consulting services: "+RADAR_SETTINGS.leads.profile.services.join(", ")+".",
  "Proven delivery: "+RADAR_SETTINGS.leads.profile.provenDeliveries.join(", ")+".",
  "Ideal clients: "+RADAR_SETTINGS.leads.profile.idealClientTypes.join(", ")+".",
  "Excluded services: "+RADAR_SETTINGS.leads.profile.excludedServices.join(", ")+".",
  "Technical help requests alone do not establish commercial intent."
].join("\n");

export const EXPERTISE_LANES = RADAR_SETTINGS.reddit.expertiseLanes;
export const STRONG_SHORT_QUERIES = RADAR_SETTINGS.reddit.strongShortQueries;
