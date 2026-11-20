// Python.org's job RSS has no per-item publication date. Read the official
// job-detail time element before accepting it. Missing/invalid date fails closed.
export function pythonJobPostedAt(html) {
 const m=String(html||"").match(/class=["']listing-posted["'][^>]*>[\s\S]{0,160}?<time\b[^>]*datetime=["']([^"']+)["']/i);
 if(!m)return null;
 const t=Date.parse(m[1]);
 return Number.isFinite(t)?new Date(t).toISOString():null;
}
export function recentPythonJob(date,now=Date.now(),maxAgeDays=15){
 const t=Date.parse(date||"");
 return Number.isFinite(t)&&t<=now+3600000&&t>=now-maxAgeDays*86400000;
}
export async function fetchRecentPythonJobs({feed,source,fetchText,parseRss,now=Date.now()}){
 const items=parseRss(await fetchText(feed),source).slice(0,12);
 const kept=[];
 // At most 12 public HTML requests every four hours, no authentication,
 // concurrency capped to two to respect python.org resources.
 for(let i=0;i<items.length;i+=2){
  const results=await Promise.all(items.slice(i,i+2).map(async job=>{
   if(!/^https:\/\/www\.python\.org\/jobs\/\d+\/$/.test(job.url))return null;
   try{
    const posted=pythonJobPostedAt(await fetchText(job.url));
    if(!recentPythonJob(posted,now))return null;
    const region=String(job.description||"").split(/\n| {3,}/)[0].trim().slice(0,125);
    return {...job,date:posted,region:region||"",description:String(job.description||"").slice(0,2800)};
   }catch{return null}
  }));
  kept.push(...results.filter(Boolean));
 }
 return kept;
}
export function freelanceForumIsBuyer(job){
 const t=String(job?.title||"").trim(),d=String(job?.description||"");
 if(t.length<15||d.length<90)return false;
 if(/(?:available for hire|open to work|i.m available|here to help|i offer|offering my|for hire|seeking (?:job|work|projects)|my services|my (?:new|first) plugin|i will build you)/i.test(t))return false;
 const ask=/(?:looking for|we need|need (?:help|someone|a developer|consultants|to hire)|hiring|paid project|looking to hire|finish(?:ing)? (?:a|my|our) (?:app|saas)|can anyone (?:help|build)|fixed price|budget)/i.test(t);
 return ask&&/(?:business|customer|client|paid|project|app|integration|api|saas|backend|developer|plugin|database|workflow|payment|marketplace|stripe|shopify|ai|automation|bubble)/i.test(t+" "+d);
}
