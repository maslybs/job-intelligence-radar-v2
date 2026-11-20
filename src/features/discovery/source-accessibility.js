import {RADAR_SETTINGS} from "../../config/radar.generated.js";
// Source-level eligibility: availability of RSS data alone does not mean
// freelancers can actually open or apply to offers without a paid plan.
// Evidence: https://freelance.ua/services/pro lists 0 proposals/day for Basic.

// Explicit user preference filtering, independent of technologies and source names.
export function excludedTopicLead(item,settings=RADAR_SETTINGS){
 const excluded=[...(settings.jobs.criteria.excludeTechnologies||[]),...(settings.jobs.criteria.excludeKeywords||[])].map(x=>String(x).trim().toLowerCase()).filter(x=>x.length>=3);
 if(!excluded.length)return false;
 const title=(String(item?.source||item?.name||"")+" "+String(item?.title||"")).toLowerCase();
 const text=String(item?.description||"").slice(0,1700).toLowerCase();
 return excluded.some(term=>title.includes(term)||text.includes(term));
}
export function leadExcludedTopic(item,settings=RADAR_SETTINGS){
 const excluded=[...(settings.leads.profile.excludedServices||[]),...(settings.leads.criteria.excludeKeywords||[])].map(x=>String(x).trim().toLowerCase()).filter(x=>x.length>=3);
 const body=(String(item?.source||item?.name||"")+" "+String(item?.title||"")+" "+String(item?.description||"").slice(0,1600)).toLowerCase();
 return excluded.some(term=>body.includes(term));
}
export function requiresPaidSubscription(sourceOrUrl,mode="jobs"){
 const config=mode==="leads"?RADAR_SETTINGS.leads.sources:RADAR_SETTINGS.jobs.sources;
 const blocked=new Set(config.inaccessibleHosts||[]);
 const s=String(sourceOrUrl||"").trim();
 if(mode==="jobs"&&RADAR_SETTINGS.jobs.sources.items.some(x=>x.name===s&&x.inaccessible===true))return true;
 try{
  const hostname=new URL(s).hostname.toLowerCase();
  return blocked.has(hostname);
 }catch{return false}
}
export function sourceIsActionable(s,mode="jobs"){
 return !requiresPaidSubscription(s?.name,mode)&&
        !requiresPaidSubscription(s?.url,mode)&&
        !(mode==="leads"?leadExcludedTopic(s):excludedTopicLead(s));
}
export function listingIsActionable(s,mode="jobs"){
 return !requiresPaidSubscription(s?.source,mode)&&
        !requiresPaidSubscription(s?.url,mode)&&
        !(mode==="leads"?leadExcludedTopic(s):excludedTopicLead(s));
}
