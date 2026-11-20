import {RADAR_SETTINGS} from "../../config/radar.generated.js";
import {listingIsActionable} from "../discovery/source-accessibility.js";
import {focusedRedditTargets} from "./reddit-expertise.js";
// Cloudflare D1 adaptive Reddit search catalogue.
// Public-post discovery only. No automated DMs, CAPTCHA solving or rate-limit bypass.
const SUBS=RADAR_SETTINGS.reddit.seedSubreddits;
const SEARCHES=RADAR_SETTINGS.reddit.seedSearches;
const INTENTS=RADAR_SETTINGS.reddit.intentPhrases;
const TOPICS=RADAR_SETTINGS.reddit.topicPhrases;
const safe=x=>String(x||"").replace(/\s+/g," ").trim().slice(0,120);
const configuredSubreddit=(key,term)=>(RADAR_SETTINGS.reddit[key]||[]).some(x=>String(x).toLowerCase()===String(term).toLowerCase());
const configuredCommunityExcluded=(term,key="excludedCommunityTerms")=>(RADAR_SETTINGS.reddit[key]||[]).some(x=>String(term||"").toLowerCase().includes(String(x).toLowerCase()));
const matchesLeadProfileTopic=term=>{
 const source=[...(RADAR_SETTINGS.reddit.topicPhrases||[]),...(RADAR_SETTINGS.leads.profile.services||[]),...(RADAR_SETTINGS.reddit.seedSubreddits||[])];
 const normalize=x=>String(x||"").toLowerCase().replace(/[^a-z0-9а-яіїєґ]/gi,"");
 const subject=normalize(term);return source.some(x=>normalize(x).length>=3&&subject.includes(normalize(x)));
};
const nowMs=()=>Date.now();
export async function ensureRedditCatalogue(env) {
 const commands=[
  "CREATE TABLE IF NOT EXISTS reddit_targets (id TEXT PRIMARY KEY, kind TEXT NOT NULL, term TEXT NOT NULL, family TEXT NOT NULL DEFAULT 'seed', created_at TEXT NOT NULL, tries INTEGER NOT NULL DEFAULT 0, pages_ok INTEGER NOT NULL DEFAULT 0, post_links INTEGER NOT NULL DEFAULT 0, buyer_signals INTEGER NOT NULL DEFAULT 0, technical_signals INTEGER NOT NULL DEFAULT 0, unique_hits INTEGER NOT NULL DEFAULT 0, errors INTEGER NOT NULL DEFAULT 0, next_due INTEGER NOT NULL DEFAULT 0, last_used TEXT, last_error TEXT)",
  "CREATE TABLE IF NOT EXISTS reddit_hit_sources (target_id TEXT NOT NULL, job_id TEXT NOT NULL, discovered_at TEXT NOT NULL, PRIMARY KEY(target_id,job_id))",
  "CREATE TABLE IF NOT EXISTS reddit_target_runs (id TEXT PRIMARY KEY, target_id TEXT NOT NULL, timestamp TEXT NOT NULL, post_links INTEGER NOT NULL DEFAULT 0, buyer_signals INTEGER NOT NULL DEFAULT 0, tech_signals INTEGER NOT NULL DEFAULT 0, candidates INTEGER NOT NULL DEFAULT 0, new_hits INTEGER NOT NULL DEFAULT 0, error TEXT)"
 ];
 for(const command of commands) await env.DB.prepare(command).run();
 // Preserve historical target runs while making old noisy queries inactive.
 const cols=(await env.DB.prepare("PRAGMA table_info(reddit_targets)").all()).results||[];
 if(!cols.some(x=>x.name==="retired"))
   await env.DB.prepare("ALTER TABLE reddit_targets ADD COLUMN retired INTEGER NOT NULL DEFAULT 0").run();
 await env.DB.prepare(
  "UPDATE reddit_targets SET retired=1 WHERE retired=0 AND kind='query' AND "+
  "((family IN ('generated','relaxed') AND unique_hits=0) OR "+
  "(family='intent' AND tries>=3 AND unique_hits=0) OR "+
  "lower(term) LIKE '%cofounder%' OR lower(term) LIKE '%technical cofounder%' OR "+
  "lower(term) LIKE '%how to learn%')"
 ).run();
 const initial=[
  ...SUBS.map(term=>({kind:"sub",term,family:"community"})),
  ...SEARCHES.map(term=>({kind:"query",term,family:"intent"}))
 ];
 // Seed additions are atomic, repeatable and do not reset learned performance.
 await env.DB.prepare(
  "INSERT OR IGNORE INTO reddit_targets(id,kind,term,family,created_at) "+
  "SELECT json_extract(value,'$.id'),json_extract(value,'$.kind'),json_extract(value,'$.term'),json_extract(value,'$.family'),? FROM json_each(?)"
 ).bind(new Date().toISOString(),JSON.stringify(initial.map(x=>({
   id:x.kind+":"+x.term.toLowerCase(),...x
 })))).run();
 // Evidence-based targets are seeded every run and preserve learned stats.
 // Unlike legacy generated queries, they are NOT blocked when total old
 // historical targets exceed the previous fixed 260-row cap.
 const focused=focusedRedditTargets();
 await env.DB.prepare(
  "INSERT OR IGNORE INTO reddit_targets(id,kind,term,family,created_at) "+
  "SELECT json_extract(value,'$.id'),json_extract(value,'$.kind'),"+
  "json_extract(value,'$.term'),json_extract(value,'$.family'),? FROM json_each(?)"
 ).bind(new Date().toISOString(),JSON.stringify(focused)).run();
 await env.DB.prepare(
  "UPDATE reddit_targets SET retired=0 WHERE retired<>0 AND id IN "+
  "(SELECT json_extract(value,'$.id') FROM json_each(?))"
 ).bind(JSON.stringify(focused)).run();

}
// A comment-check run has only one discovery slot. Explicitly allocate
// 1 of 5 such slots to a problem search; otherwise queries starve forever.
export function redditTargetKinds(count,now=Date.now()) {
 const slot=Math.floor(now/(5*60000))%10;
 // 70% of discovery slots are subreddit new feeds (historically best yield);
 // 20% scoped problem searches, 10% global concise buyer-intent searches.
 const first=slot===0?"query":(slot===1||slot===5)?"subquery":"sub";
 return count<=1?[first]:[first,"sub"];
}
export async function pickRedditTargets(env,count=2) {
 const all=(await env.DB.prepare(
  "SELECT t.id,t.kind,t.term,t.family,t.tries,t.pages_ok,t.post_links,t.buyer_signals,t.technical_signals,t.unique_hits,t.errors,t.next_due,"+
  "(SELECT COUNT(*) FROM reddit_hit_sources h JOIN jobs j ON j.id=h.job_id "+
  " WHERE h.target_id=t.id AND j.priority IN ('P1','P2') AND j.kind='buyer') AS qualified,"+
  "(SELECT COUNT(*) FROM reddit_hit_sources h JOIN reddit_prospects p ON p.job_id=h.job_id "+
  " WHERE h.target_id=t.id AND p.business_signal=1 AND p.category='business_problem' AND p.fit>=78) AS demand_hits,"+
  "(SELECT COUNT(*) FROM reddit_hit_sources h JOIN reddit_thread_reviews r ON r.job_id=h.job_id "+
  " WHERE h.target_id=t.id AND r.status='credible' AND r.original_post_observed=1 AND r.comments_verified=1) AS confirmed_hits "+
  "FROM reddit_targets t WHERE t.retired=0 AND t.next_due <= ? "+
  "ORDER BY t.tries ASC LIMIT 260"
 ).bind(nowMs()).all()).results||[];
 if(!all.length)return [];
 const ranked=all.map(t=>{
   const tried=Number(t.tries)||0,qualified=Number(t.qualified)||0,
     demand=Number(t.demand_hits)||0,confirmed=Number(t.confirmed_hits)||0,
     unique=Number(t.unique_hits)||0,buyers=Number(t.buyer_signals)||0,
     technical=Number(t.technical_signals)||0,failures=Number(t.errors)||0;
   // Reward verified P1/P2 and unique buyer leads. Reserve exploration for
   // previously untested sources so the search does not lock on old winners.
   const exploration=tried===0?7:tried===1?3:0;
   // Real qualified buyer opportunities matter more than raw Reddit posts.
   // A high number of generic posts or service advertisements is not success.
   const pageYield=(Number(t.pages_ok)||0)>0?demand/Number(t.pages_ok):0;
   // Optimize for real business pain, not vacancy/post volume. Treat the
   // historical P1/P2 metric as a secondary signal; verified problems dominate.
   const exploitation=Math.min(31,demand*6+confirmed*10+pageYield*10+
     qualified*1.1+Math.min(5,unique*.35)+technical*.025);
   const penalty=Math.min(9,failures*2)+Math.min(8,Math.max(0,tried-3)*1.8);
   // Start with likely buyer-intent locations before generic tech discussions.
   // Randomness remains substantial so niche sources still get sampled.
   const directSub=configuredSubreddit("prioritySubreddits",t.term);
   const directQuery=/\b(?:hiring|hire someone|looking for someone|looking to hire|paid|developer needed|freelance project|need help|need developer|need automation)\b/i.test(t.term);
   const problemSub=configuredSubreddit("problemSubreddits",t.term);
   const problemQuery=/\b(?:not working|failing|broken|struggling|cannot|need help|automate|sync|webhook|follow up|inventory|integration|manual|lose leads|reporting|scheduling|invoices|spreadsheet|customers|appointments|bookings)\b/i.test(t.term);
   const highIntentSub=configuredSubreddit("highIntentSubreddits",t.term);
   const junkSub=configuredCommunityExcluded(t.term,"deprioritizedCommunityTerms");
   const hiringBoard=t.kind==="sub"&&configuredSubreddit("hiringBoardTerms",t.term);
   const expertise=t.family?.startsWith("expertise_");
   const buyerBias=(expertise?5:0)+(t.kind==="subquery"?6:0)+
     (t.kind==="sub"&&directSub?5:0)+
     (t.kind==="sub"&&highIntentSub?4:0)+
     (t.kind==="sub"&&problemSub?12:0)+
     (t.kind==="query"&&directQuery?2:0)+
     (t.kind==="query"&&problemQuery?10:0)-
     (junkSub?30:0)-(hiringBoard?10:0);
   // Don't repeatedly reward long zero-result generated searches.
   const zeroSignalPenalty=tried>=1 && technical===0 && unique===0 ? 5 : 0;
   return {...t,rank:Math.random()*10+exploration+exploitation+buyerBias-penalty-zeroSignalPenalty};
 }).sort((a,b)=>b.rank-a.rank);
 // Browser requests remain capped at two pages each run. Generic search
 // phrases yielded almost no posts, so devote two of three runs to subreddits.
 const kinds=redditTargetKinds(count,nowMs());
 const chosen=[];
 for(const type of kinds){
   const next=ranked.find(t=>t.kind===type && !chosen.some(c=>c.id===t.id));
   if(next && chosen.length<count)chosen.push(next);
 }
 for(const x of ranked)if(chosen.length<count && !chosen.some(c=>c.id===x.id))chosen.push(x);
 return chosen.slice(0,count).map(({id,kind,term,family})=>({id,kind,term,family}));
}
export function redditTargetUrl(target) {
 if(target.kind==="sub" && /^[a-zA-Z0-9_]{2,32}$/.test(target.term))
   return "https://www.reddit.com/r/"+target.term+"/new/";
 if(target.kind==="subquery"){
   const match=String(target.term).match(/^([A-Za-z0-9_]{2,32})::(.{3,75})$/);
   if(!match)throw Error("Invalid scoped Reddit query");
   return "https://www.reddit.com/r/"+match[1]+"/search/?q="+
      encodeURIComponent(match[2])+"&restrict_sr=1&sort=new&t=week&type=posts";
 }
 if(target.kind==="query" && target.term.length<150)
   return "https://www.reddit.com/search/?q="+encodeURIComponent(target.term)+"&type=posts&sort=new&t=day";
 throw Error("Invalid target");
}
export function jitterDelayMs() {
 // Randomized polite spacing, not a mechanism for defeating rate limits.
 return 35000+Math.floor(Math.random()*55000);
}
export async function learnRedditTarget(env,target,stats,items,failed,code="",added=0,suggestedSubs=[]) {
 const date=new Date().toISOString(),now=nowMs();
 const postLinks=Number(stats?.postLinks)||0,
  buyers=Number(stats?.buyers)||0,tech=Number(stats?.techBuyers)||0,
  candidates=items.length;
 // Park sources with repeated empty/irrelevant results, but allow later
 // re-testing. HTTP 429/CAPTCHA uses the separate global cooldown.
 const prev=await env.DB.prepare("SELECT tries,unique_hits FROM reddit_targets WHERE id=?").bind(target.id).first();
 const seen=Number(prev?.tries)||0;
 let backoff;
 if(failed)backoff=Math.min(72,3*Math.pow(2,Math.min(4,seen)))*3600e3;
 else if(!postLinks)backoff=(seen>=2?24:8)*3600e3;
 else if(!tech)backoff=(seen>=3?24:5)*3600e3;
 else if(!candidates)backoff=(seen>=3?16:3)*3600e3;
 else backoff=90*60e3;
 // avoid fixed-time bursts against a publisher.
 const nextDue=now+Math.round(backoff*(0.9+Math.random()*.2));
 await env.DB.prepare("UPDATE reddit_targets SET tries=tries+1,pages_ok=pages_ok+?,post_links=post_links+?,"+
   "buyer_signals=buyer_signals+?,technical_signals=technical_signals+?,errors=errors+?,"+
   "next_due=?,last_used=?,last_error=? WHERE id=?")
  .bind(failed?0:1,postLinks,buyers,tech,failed?1:0,nextDue,date,failed?safe(code):null,target.id).run();
 await env.DB.prepare("INSERT OR IGNORE INTO reddit_target_runs(id,target_id,timestamp,post_links,buyer_signals,tech_signals,candidates,new_hits,error) VALUES(?,?,?,?,?,?,?,?,?)")
  .bind(crypto.randomUUID(),target.id,date,postLinks,buyers,tech,candidates,added,failed?safe(code):null).run();
 if(!failed && (target.kind==="query"||target.kind==="subquery")){
   const proposals=[];
   // An empty long Reddit search should yield a broader TWO-TERM query
   // instead of another repetition of the exact failure.
   if(target.kind==="query"&&!postLinks && seen<3){
     const relaxed=target.term.replace(/\b(?:looking|need|hiring|hire|developer|someone|help|with|for|to|a|an|the|who|can|build|specialist|freelancer|paid|project)\b/gi," ")
        .replace(/\s+/g," ").trim();
     if(relaxed.length>=8 && relaxed.length<=65 && relaxed.split(/\s+/).length>=2 &&
       relaxed.toLowerCase()!==target.term.toLowerCase())
       proposals.push({id:"query:"+relaxed.toLowerCase(),kind:"query",term:relaxed,family:"relaxed"});
   }
   for(const sub of suggestedSubs.slice(0,4)){
     if(configuredCommunityExcluded(sub))continue;
     if(!/^[a-zA-Z0-9_]{2,32}$/.test(sub))continue;
     if(!matchesLeadProfileTopic(sub))continue;
     proposals.push({id:"sub:"+sub.toLowerCase(),kind:"sub",term:sub,family:"reddit_suggested"});
   }
   if(proposals.length)
     await env.DB.prepare(
       "INSERT OR IGNORE INTO reddit_targets(id,kind,term,family,created_at) "+
       "SELECT json_extract(value,'$.id'),json_extract(value,'$.kind'),json_extract(value,'$.term'),json_extract(value,'$.family'),? FROM json_each(?) "+
       "WHERE (SELECT COUNT(*) FROM reddit_targets WHERE retired=0)<220"
     ).bind(date,JSON.stringify(proposals)).run();
 }
}
export async function trackRedditHits(env,target,items) {
 const sql="INSERT OR IGNORE INTO jobs (id,fingerprint,title,company,source,url,description,region,published_at,discovered_at,state) VALUES (?,?,?,?,?,?,?,?,?,?,?)";
 let inserted=0;
 const communities=new Map();
 for(const p of items){
   if(!listingIsActionable(p,"leads"))continue;
   const raw=new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(p.url)));
   const id=Array.from(raw).map(b=>b.toString(16).padStart(2,"0")).join("").slice(0,28);
   const description=(p.intent==="problem"?"[Potential client: problem/request for help; paid intent not verified] ":"[Buyer request] ")+
      String(p.description||"").slice(0,2000);
   const out=await env.DB.prepare(sql).bind(id,id,p.title,p.company,p.source,p.url,
      description,"Reddit",p.published_at||null,p.discovered_at||new Date().toISOString(),"queued").run();
   if(out.meta?.changes)inserted++;
   await env.DB.prepare("INSERT OR IGNORE INTO reddit_hit_sources(target_id,job_id,discovered_at) VALUES(?,?,?)")
     .bind(target.id,id,new Date().toISOString()).run();
   const sub=String(p.source||"").replace(/^Reddit r\//,"");
   if(/^[A-Za-z0-9_]{2,32}$/.test(sub))communities.set(sub,(communities.get(sub)||0)+1);
 }
 if(inserted)await env.DB.prepare("UPDATE reddit_targets SET unique_hits=unique_hits+? WHERE id=?")
   .bind(inserted,target.id).run();
 // Promote communities found through search only if several *unique* buyer
 // leads point there. Avoid wandering into unrelated general subreddits.
 if(target.kind==="query"){
   for(const [name] of communities){
     if(configuredCommunityExcluded(name))continue;
     const r=await env.DB.prepare(
       "SELECT COUNT(DISTINCT h.job_id) n FROM reddit_hit_sources h "+
       "JOIN jobs j ON j.id=h.job_id WHERE j.source=? AND j.kind='buyer' AND j.score>=65"
     ).bind("Reddit r/"+name).first();
     if((r?.n||0)<2)continue;
     const value=name.toLowerCase();
     await env.DB.prepare(
       "INSERT OR IGNORE INTO reddit_targets(id,kind,term,family,created_at) VALUES(?,?,?,?,?)"
     ).bind("sub:"+value,"sub",name,"discovered",new Date().toISOString()).run();
   }
 }
 return inserted;
}
export async function redditLearningSnapshot(env) {
 const row=await env.DB.prepare(
  "SELECT COUNT(*) targets,SUM(CASE WHEN tries>0 THEN 1 ELSE 0 END) tried,"+
  "SUM(CASE WHEN tries=0 THEN 1 ELSE 0 END) untested,SUM(pages_ok) pages,"+
  "SUM(unique_hits) new_hits,SUM(errors) errors,"+
  "SUM(CASE WHEN retired=0 THEN 1 ELSE 0 END) active,"+
  "SUM(CASE WHEN kind='subquery' AND retired=0 THEN 1 ELSE 0 END) scoped_queries,"+
  "SUM(CASE WHEN retired=1 THEN 1 ELSE 0 END) archived FROM reddit_targets"
 ).first();
 const good=(await env.DB.prepare(
  "SELECT t.kind,t.term,t.tries,t.post_links,t.unique_hits,t.errors,"+
  "(SELECT COUNT(DISTINCT h.job_id) FROM reddit_hit_sources h JOIN jobs j ON j.id=h.job_id "+
  " WHERE h.target_id=t.id AND j.priority IN ('P1','P2')) qualified "+
  "FROM reddit_targets t WHERE t.retired=0 AND tries>0 ORDER BY qualified DESC,t.unique_hits DESC,t.post_links DESC LIMIT 6"
 ).all()).results||[];
 return {targets:row?.targets||0,active:row?.active||0,archived:row?.archived||0,
  scoped_queries:row?.scoped_queries||0,tested:row?.tried||0,untested:row?.untested||0,
  pages:row?.pages||0,unique:row?.new_hits||0,errors:row?.errors||0,
  leaders:good.map(x=>({kind:x.kind,term:x.term,tries:x.tries,unique:x.unique_hits,qualified:x.qualified}))};
}
