// User-defined expertise matching. No technology, domain or provider names are assumed.
import {RADAR_SETTINGS} from "../config/radar.generated.js";
const words=value=>String(value||"").toLocaleLowerCase().split(/[^\p{L}\p{N}+#.]+/u).filter(term=>term.length>=3);
const terms=values=>[...new Set(values.flatMap(x=>[String(x||"").toLocaleLowerCase(),...words(x)]).filter(x=>x.length>=3))];
export function jobProfileTerms(settings=RADAR_SETTINGS){
 const jobs=settings.jobs;
 return terms([...jobs.profile.skills,...jobs.profile.provenExperience,...jobs.criteria.includeKeywords,...jobs.criteria.preferredRoles,
   ...jobs.browserSources.dou.targets.map(x=>x.query)]);
}
export function leadProfileTerms(settings=RADAR_SETTINGS){
 const leads=settings.leads;
 return terms([...leads.profile.services,...leads.profile.provenDeliveries,
   ...leads.sources.reddit.topicPhrases,...leads.sources.reddit.intentPhrases,
   ...leads.sources.reddit.seedSearches]);
}
export const matchesJobProfile=(text,settings=RADAR_SETTINGS)=>{
 const content=String(text||"").toLocaleLowerCase();
 return jobProfileTerms(settings).some(term=>content.includes(term));
};
export const matchesLeadProfile=(text,settings=RADAR_SETTINGS)=>{
 const content=String(text||"").toLocaleLowerCase();
 return leadProfileTerms(settings).some(term=>content.includes(term));
};
