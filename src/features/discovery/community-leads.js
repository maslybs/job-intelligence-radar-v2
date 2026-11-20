import {matchesLeadProfile} from "../../platform/profile-matching.js";
import {RADAR_SETTINGS} from "../../config/radar.generated.js";
// Cloudflare-native, read-only public RSS/Atom community discovery.
// No browsing sessions, cookies, accounts or outgoing community messages.
// Endpoints were probed from Cloudflare on 2026-10-20 (HTTP 200 + RSS/Atom).
export const COMMUNITY_FEEDS=RADAR_SETTINGS.community.enabled ? RADAR_SETTINGS.community.feeds : [];
const PROBLEM=/(need|help|error|issue|problem|fail|can't|cannot|doesn.t work|not working|stuck|how (?:do|can|to)|trying|anyone|trouble|slow|missing|broken|fix|custom|automat|integrat|connect|sync|workaround|question|struggl|solution|build|create|setup|setting up|webhook)/i;
const EXCLUDE=/(?:^\s*(?:\[(?:for hire|offering)\]|i (?:offer|provide|sell)|available for hire)|buy followers|casino|giveaway|free crypto|adult entertainment)/i;
const text=s=>String(s||"").replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,"$1").replace(/<[^>]*>/g," ").replace(/&amp;/gi,"&").replace(/&lt;/gi,"<").replace(/&gt;/gi,">").replace(/&quot;/gi,'"').replace(/&nbsp;/gi," ").replace(/\s+/g," ").trim();
const tag=(s,n)=>text(s.match(new RegExp("<(?:[a-z0-9_-]+:)?" + n + "(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:[a-z0-9_-]+:)?" + n + ">","i"))?.[1]);
const cleanUrl=u=>{
 try{
   const url=new URL(u);if(url.protocol!=="https:")return "";
   url.hash="";
   for(const k of ["utm_source","utm_medium","utm_campaign","utm_content","fbclid","gclid"])
     url.searchParams.delete(k);
   return url.toString();
 }catch{return "";}
};
const digest=async value=>Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value))))
 .map(x=>x.toString(16).padStart(2,"0")).join("").slice(0,28);
export function parseCommunityXml(raw,source){
 const result=[];
 for(const match of raw.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi)){
   const block=match[1],title=tag(block,"title"),url=cleanUrl(tag(block,"link")||tag(block,"guid"));
   if(title&&url)result.push({title,url,source,description:tag(block,"description").slice(0,2000),
     date:tag(block,"pubDate")||tag(block,"date")});
 }
 for(const match of raw.matchAll(/<entry(?:\s[^>]*)?>([\s\S]*?)<\/entry>/gi)){
   const block=match[1],title=tag(block,"title");
   const url=cleanUrl(block.match(/<link\b[^>]*href=["']([^"']+)["']/i)?.[1]);
   if(title&&url)result.push({title,url,source,
     description:(tag(block,"summary")||tag(block,"content")).slice(0,2000),
     date:tag(block,"published")||tag(block,"updated")});
 }
 return result;
}
export function communityPreselect(j,now=Date.now()){
 const title=String(j.title||""),description=String(j.description||"");
 const age=Date.parse(j.date||"");
 if(!title||!j.url||title.length<12||!Number.isFinite(age)||age>now+60*60e3||age<now-5*86400e3)
   return {ok:false,reason:"age_or_missing"};
 const body=(title+" "+description).slice(0,2600);
 if(EXCLUDE.test(title)||!matchesLeadProfile(body)||!PROBLEM.test(body))
   return {ok:false,reason:"not_problem"};
 if(description.length<55&&title.length<40)
   return {ok:false,reason:"insufficient_context"};
 return {ok:true};
}
export async function communityScan(env,{limit=4,force=false}={}){
  if(!COMMUNITY_FEEDS.length)return {state:"disabled_by_configuration",checked:0,inserted:0};
 const leaseKey="community_scan_lease",now=Date.now();
 await env.DB.prepare("DELETE FROM meta WHERE key=? AND CAST(value AS INTEGER)<?")
   .bind(leaseKey,now-8*60e3).run();
 const leaseVal=String(now)+"-"+crypto.randomUUID();
 const claim=await env.DB.prepare("INSERT OR IGNORE INTO meta(key,value) VALUES(?,?)")
   .bind(leaseKey,leaseVal).run();
 if(!claim.meta?.changes)return {state:"already_running",checked:0,inserted:0};
 try {
  const cursor=Number((await env.DB.prepare("SELECT value FROM meta WHERE key='community_source_cursor'").first())?.value||0)%COMMUNITY_FEEDS.length;
  const candidates=[],skipped=[];
  let examined=0;
  for(let i=0;i<COMMUNITY_FEEDS.length&&candidates.length<limit;i++){
    const feed=COMMUNITY_FEEDS[(cursor+i)%COMMUNITY_FEEDS.length];examined=i+1;
    const last=await env.DB.prepare("SELECT last_success,last_error FROM source_state WHERE source=?").bind(feed.name).first();
    const retry=Number((last?.last_error||"").match(/RETRY_AT:(\d+)/)?.[1]||0);
    if(now<retry){skipped.push(feed.name+":cooldown");continue;}
    if(!force&&last?.last_success&&now/1000-last.last_success<feed.hours*3600){
      skipped.push(feed.name+":interval");continue;
    }
    candidates.push(feed);
  }
  await env.DB.prepare("INSERT INTO meta(key,value) VALUES('community_source_cursor',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value")
    .bind(String((cursor+Math.max(1,examined))%COMMUNITY_FEEDS.length)).run();
  const results=[],errors=[];
  for(const feed of candidates){
   try{
    const cacheKey="community_cache_"+feed.name;
    let saved={};
    try{const row=await env.DB.prepare("SELECT value FROM meta WHERE key=?").bind(cacheKey).first();saved=JSON.parse(row?.value||"{}")}catch{}
    const headers={Accept:"application/rss+xml,application/atom+xml,text/xml"};
    if(saved.etag)headers["If-None-Match"]=saved.etag;
    if(saved.modified)headers["If-Modified-Since"]=saved.modified;
    const resp=await fetch(feed.url,{headers,signal:AbortSignal.timeout(11500)});
    let posts=[];
    if(resp.status===304)posts=[];
    else {
      if(!resp.ok)throw Error("HTTP "+resp.status);
      const ct=resp.headers.get("content-type")||"";
      if(!/xml|rss|atom/i.test(ct))throw Error("Invalid RSS content-type");
      const raw=(await resp.text()).slice(0,800000);
      if(!/<rss[\s>]|<feed[\s>]/i.test(raw))throw Error("Unexpected RSS payload");
      posts=parseCommunityXml(raw,feed.name);
      if(!posts.length)throw Error("Zero parseable feed entries");
      const etag=resp.headers.get("etag")||"";
      const modified=resp.headers.get("last-modified")||"";
      if(etag||modified)await env.DB.prepare("INSERT INTO meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value")
         .bind(cacheKey,JSON.stringify({etag,modified})).run();
    }
    let candidatesFound=0,ageRejected=0,irrelevant=0,duplicates=0,inserted=0;
    for(const post of posts.slice(0,40)){
      const verdict=communityPreselect(post);
      if(!verdict.ok){if(verdict.reason==="age_or_missing")ageRejected++;else irrelevant++;continue;}
      candidatesFound++;
      const id=await digest(post.url),fp=await digest(feed.name+"|"+post.title.toLowerCase());
      const out=await env.DB.prepare(
        "INSERT OR IGNORE INTO jobs(id,fingerprint,title,company,source,url,description,region,published_at,discovered_at,state) VALUES(?,?,?,?,?,?,?,?,?,?,?)"
      ).bind(id,fp,post.title.slice(0,220),feed.name.slice(0,120),feed.name,post.url,
        ("[Public community question — paid intent unknown] "+post.description).slice(0,2300),
        "",post.date,new Date().toISOString(),"filtered").run();
      if(out.meta?.changes)inserted++;else duplicates++;
      if(candidatesFound>=20)break;
    }
    const metrics={checked_at:new Date().toISOString(),received:posts.length,
      age_rejected:ageRejected,first_pass_rejected:irrelevant,preselected:candidatesFound,
      duplicates,inserted,cached:resp.status===304};
    await env.DB.prepare("INSERT INTO meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value")
      .bind("source_metrics_"+feed.name,JSON.stringify(metrics)).run();
    await env.DB.prepare("INSERT INTO source_state(source,last_success,last_error) VALUES(?,?,NULL) ON CONFLICT(source) DO UPDATE SET last_success=excluded.last_success,last_error=NULL")
      .bind(feed.name,Math.floor(Date.now()/1000)).run();
    results.push({name:feed.name,...metrics});
   }catch(e){
     const msg=String(e?.message||e).slice(0,100);
     const status=Number(msg.match(/HTTP (403|404|429)/)?.[1]||0);
     const pause=status===403||status===404?24*3600e3:
       status===429?(feed.name==="Community · Cloudflare"?48:8)*3600e3:0;
     const detail=msg+(pause?" RETRY_AT:"+(Date.now()+pause):"");
     await env.DB.prepare("INSERT INTO source_state(source,last_success,last_error) VALUES(?,NULL,?) ON CONFLICT(source) DO UPDATE SET last_error=excluded.last_error")
       .bind(feed.name,detail).run();
     errors.push({source:feed.name,error:msg});
   }
  }
  const result={state:errors.length?"partial":"ok",checked:results.length,
    fetched:results.reduce((n,x)=>n+x.received,0),inserted:results.reduce((n,x)=>n+x.inserted,0),
    results,errors,skipped:skipped.length,at:new Date().toISOString()};
  await env.DB.prepare("INSERT INTO meta(key,value) VALUES('community_last_report',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value")
    .bind(JSON.stringify(result)).run();
  return result;
 }finally{
  await env.DB.prepare("DELETE FROM meta WHERE key=? AND value=?").bind(leaseKey,leaseVal).run();
 }
}
