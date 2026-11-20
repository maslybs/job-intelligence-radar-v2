// Job preferences originate in the selected configuration, not from a
// maintainer's resume or preferred job titles.
import {RADAR_SETTINGS} from "../../config/radar.generated.js";
const CONCRETE_OUTCOME=/(?:build|ship|deliver|launch|implement|integrat|automat|migrat|prototype|fix|debug|stabili[sz]|maintain|internal tool|client project|crm|erp|saas|api|workflow|webhook|mvp|розроб|створи|інтеграц|автоматиз|впровад|налаштув)/i;
export function matchesGeneralistOutcome(job,settings=RADAR_SETTINGS){
 const title=String(job?.title||"").toLowerCase();
 const body=[job?.title,job?.description,job?.region].join(" ").toLowerCase();
 const roles=[settings.jobs?.profile?.role,...(settings.jobs?.criteria?.preferredRoles||[])]
   .filter(Boolean).map(x=>String(x).toLowerCase());
 const roleMatch=roles.some(role=>{
   const terms=role.split(/[^a-z0-9]+/).filter(x=>x.length>=3);
   return terms.length>0&&terms.every(term=>title.includes(term));
 });
 const skillTerms=[...(settings.jobs?.profile?.skills||[]),
   ...(settings.jobs?.criteria?.includeKeywords||[])].map(x=>String(x).toLowerCase())
   .filter(x=>x.length>=2);
 const skillsSupported=skillTerms.some(term=>body.includes(term));
 return roleMatch||
   (skillsSupported&&CONCRETE_OUTCOME.test(title)&&
     CONCRETE_OUTCOME.test(body)&&String(job?.description||"").length>=110);
}
export function opportunityTrack(job){
 const source=String(job?.source||"");
 const role=[job?.title,job?.description].join(" ");
 if(/(?:upwork|freelancehunt|reddit)/i.test(source))return "project";
 if(/(?:agency|integrator|consultancy|consulting firm|client projects|subcontract)/i.test(role))return "agency";
 if(job?.engagement==="fulltime"||/(?:engineer|developer|technical generalist|permanent|full[- ]time)/i.test(job?.title||""))return "employment";
 return "project";
}
