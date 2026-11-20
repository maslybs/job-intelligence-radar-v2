import {hasBrowserOneAIHub} from "../../integrations/oneaihub/capabilities.js";
import {RADAR_SETTINGS} from "../../config/radar.generated.js";
// Cloudflare Workflow -> private OneAIHUB MCP -> Chrome agent tab.
// Never makes direct HTTP requests to DOU or touches human browser tabs.
import {WorkflowEntrypoint} from "cloudflare:workers";
import {excludedTopicLead} from "../discovery/source-accessibility.js";
import {hub} from "../reddit/reddit-mcp-client.js";
import {douBatch,douSearchUrl,extractDouListings,extractDouJobDetail,canonicalDouVacancy,douLeadLane} from "./dou-browser-source.js";
const SESSION="cloudflare-job-radar-dou";
const BROWSER="chrome-extension-gateway::browser.";
const now=()=>new Date().toISOString();
async function meta(env,key,value){
 await env.DB.prepare("INSERT INTO meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value")
   .bind(key,String(value)).run();
}
function ownerTab(x){
 const handle=x?.handle;const id=x?.tab_id||x?.id;
 return {session_id:SESSION,...(typeof handle==="string"&&handle.startsWith("tab_")?{handle}:
   Number.isInteger(id)?{tab_id:id}:{})};
}
function sessionTabs(snapshot){
 const list=snapshot?.result?.agent_tabs||snapshot?.agent_tabs||[];
 return Array.isArray(list)?list.filter(x=>x.origin==="agent"&&x.session_id===SESSION).map(ownerTab)
  .filter(x=>x.handle||x.tab_id).slice(0,15):[];
}
async function cleanup(env,connection){
 const state=await hub(env,"hub_read",BROWSER+"get_state",{},connection);
 const owned=sessionTabs(state);let closed=0;
 for(const tab of owned)try{
   await hub(env,"hub_write",BROWSER+"release_tab",{...tab,close:true},connection);closed++;
 }catch{}
 return {seen:owned.length,closed};
}
async function store(env,item){
 const canonical=canonicalDouVacancy(item.url);
 if(!canonical)throw Error("invalid_dou_url");
 const raw=new TextEncoder().encode(canonical.url);
 const digest=new Uint8Array(await crypto.subtle.digest("SHA-256",raw));
 const id=Array.from(digest,b=>b.toString(16).padStart(2,"0")).join("").slice(0,28);
 if(excludedTopicLead({...item,source:"DOU · Browser"}))
   return {id,inserted:0,skipped:"excluded_by_profile"};
 const text=String(item.description||"").slice(0,11500);
 const title=String(item.title||"").slice(0,200);
 const source="DOU · Browser";
 const reason="DOU browser search; candidate lane: "+douLeadLane(item)+"; public vacancy listing observed";
 const inserted=await env.DB.prepare("INSERT OR IGNORE INTO jobs(id,fingerprint,title,company,source,url,description,region,published_at,discovered_at,state) VALUES(?,?,?,?,?,?,?,?,?,?,?)")
   .bind(id,id,title,canonical.companySlug,source,canonical.url,
    ("[Лід: "+douLeadLane(item)+"] "+reason+"\n"+text).slice(0,11700),
    item.region||"",null,now(),"queued").run();
 return {id,inserted:Number(inserted.meta?.changes||0)};
}
function relevant(x){
 const label=(String(x.title||"")+" "+String(x.evidence||"")).toLowerCase();
 const settings=RADAR_SETTINGS.jobs;
 const terms=[...settings.profile.skills,...settings.criteria.includeKeywords,...settings.criteria.preferredRoles,
   ...settings.browserSources.dou.targets.map(x=>x.query)];
 return terms.some(value=>{const term=String(value).trim().toLowerCase();return term.length>=3&&label.includes(term)});
}
export class DouBrowserWorkflow extends WorkflowEntrypoint {
 async run(event,step){
  const env=this.env;
  if(!RADAR_SETTINGS.jobs.enabled||!RADAR_SETTINGS.integrations.dou.enabled||!RADAR_SETTINGS.jobs.browserSources.dou.enabled||!hasBrowserOneAIHub(env)||
     env.DOU_BROWSER_ENABLED!=="1"||!env.ONEAIHUB_VPC||
     !(env.ONEAIHUB_MCP_BEARER_TOKEN||(env.ONEAIHUB_MCP_CLIENT_ID&&env.ONEAIHUB_MCP_CLIENT_SECRET)))
   return {state:"disabled"};
  const paused=Number(await env.DB.prepare("SELECT value FROM meta WHERE key='dou_browser_pause_until'").first("value")||0);
  if(Date.now()<paused)return {state:"publisher_cooldown",pause_until:paused};
  const attempt=String(event.payload?.slot||"manual").slice(0,40);
  const t=Date.now(),deadline=t+12*60*1000;
  const claim=await step.do("dou-claim-exclusive-tab-lease",
   {retries:{limit:0,delay:"10 seconds",backoff:"constant"},timeout:"20 seconds"},
   async()=>{
    const r=await env.DB.prepare("INSERT INTO meta(key,value) VALUES('dou_browser_lease',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value WHERE CAST(meta.value AS INTEGER)<?")
     .bind(String(deadline),t).run();
    return Number(r.meta?.changes||0)>0;
   });
  if(!claim)return {state:"already_running"};
  const connection={token:null,sessionId:null};
  let tab=null,error="",blocked=false,scanned=0,found=0,inserted=0;
  const details=[],targetNames=[];
  try{
   const started=await step.do("dou-attach-private-agent-browser",
    {retries:{limit:0,delay:"10 seconds",backoff:"constant"},timeout:"85 seconds"},
    async()=>{
     const state=await hub(env,"hub_read",BROWSER+"get_state",{},connection);
     if(state?.ok===false)throw Error("browser_offline");
     await cleanup(env,connection);
     return hub(env,"hub_write",BROWSER+"create_tab",
       {session_id:SESSION,url:"about:blank",reuse:true,foreground:false},connection);
    });
   tab=ownerTab(started);
   if(!tab.handle&&!tab.tab_id)throw Error("browser_tab_unavailable");
   const index=event.payload?.slot?Math.floor(Date.parse(event.payload.slot)/600000):
     Math.floor(Date.now()/600000);
   const targets=douBatch(Number.isFinite(index)?index:0,1);
   for(let i=0;i<targets.length;i++){
    const target=targets[i];targetNames.push(target.query);
    try{
     const page=await step.do("dou-list-search-"+i,
      {retries:{limit:0,delay:"10 seconds",backoff:"constant"},timeout:"85 seconds"},
      async()=>{
       await hub(env,"hub_write",BROWSER+"goto",
        {...tab,url:douSearchUrl(target),wait:true,timeout_ms:18000},connection);
       // Browser.goto(wait:true) can resolve while the SPA is still rendering.
       // Repeat only DOM observations on the SAME loaded page, never
       // navigating to the same URL or opening extra tabs.
       let last=null;
       for(let n=0;n<4;n++){
         if(n)await new Promise(resolve=>setTimeout(resolve,700*n));
         const initial=await hub(env,"hub_read",BROWSER+"dom_snapshot",
           {...tab,includeBodyText:true,bodyTextLimit:7500,
            include_offscreen:true,limit:40,scan_limit:900},connection);
         // The broad DOU DOM contains many navigation/category links. The
         // gateway truncates large results, dropping vacancy links in the
         // middle. Focused snapshots on the SAME page return the actual
         // job anchors without extra page requests.
         const collected=[];
         for(const query of [target.query,"Engineer","Developer","Інженер"]){
           const sub=await hub(env,"hub_read",BROWSER+"dom_snapshot",
             {...tab,query,include_offscreen:true,limit:36,scan_limit:1600},connection);
           const nodes=Array.isArray(sub.nodes)?sub.nodes:
             Array.isArray(sub.nodes?.items)?sub.nodes.items.map(v=>v.value):[];
           collected.push(...nodes);
         }
         const parsed=extractDouListings({
           ...initial,nodes:collected,
           bodyText:typeof initial.bodyText==="string"?initial.bodyText:
             String(initial.bodyText?.head||"")+" "+String(initial.bodyText?.tail||"")
         },target.query);
         last=parsed;
         if(parsed.state==="blocked"||parsed.items.length>0)break;
         const body=typeof initial.bodyText==="string"?initial.bodyText:
           String(initial.bodyText?.head||"")+" "+String(initial.bodyText?.tail||"");
         if(/(?:^|\\n)0 вакансій/i.test(body)||/ничего не найдено|вакансій не знайдено/i.test(body))break;
       }
       return last;
      });
     scanned++;
     if(page.state==="blocked"){blocked=true;break}
     if(page.state!=="ok")continue;
     found+=page.items.length;
     // One detail per list page; only new postings with fitting technical scope.
     for(const x of page.items.filter(x=>relevant(x)&&
       !excludedTopicLead({...x,source:"DOU · Browser"})).slice(0,6)){
      const raw=new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(x.url)));
      const id=Array.from(raw,b=>b.toString(16).padStart(2,"0")).join("").slice(0,28);
      const existing=await env.DB.prepare("SELECT id FROM jobs WHERE id=?").bind(id).first();
      if(!existing){details.push({...x,search:target.query});break}
     }
    }catch(e){
     error=String(e?.message||e).slice(0,120);
     if(/(?:http 429|rate limit|captcha|access denied|blocked)/i.test(error)){blocked=true;break}
    }
   }
   for(let i=0;i<Math.min(1,details.length)&&!blocked;i++){
    const x=details[i];
    try{
     const evidence=await step.do("dou-read-job-description-"+i,
       {retries:{limit:0,delay:"10 seconds",backoff:"constant"},timeout:"95 seconds"},
       async()=>{
        await hub(env,"hub_write",BROWSER+"goto",
          {...tab,url:x.url,wait:true,timeout_ms:19000},connection);
        let parsed={state:"not_enough_evidence"};
        for(let n=0;n<3;n++){
          if(n)await new Promise(resolve=>setTimeout(resolve,600*n));
          const p=await hub(env,"hub_read",BROWSER+"dom_snapshot",
            {...tab,includeBodyText:true,bodyTextLimit:11000,
             includeNodes:false,include_offscreen:false,limit:4,
             scan_limit:140},connection);
          parsed=extractDouJobDetail(p,x.url);
          if(parsed.state==="ok"||parsed.state==="blocked")break;
        }
        return parsed;
       });
     if(evidence.state==="blocked"){blocked=true;break}
     if(evidence.state!=="ok")continue;
     const added=await step.do("dou-store-observed-job-"+i,
       {retries:{limit:0,delay:"10 seconds",backoff:"constant"},timeout:"35 seconds"},
       ()=>store(env,{...x,description:evidence.description,region:evidence.location_mode}));
     inserted+=added.inserted;
    }catch(e){error=String(e?.message||e).slice(0,120)}
   }
  }catch(e){error=String(e?.message||e).slice(0,130)}
  finally{
   try{
    await step.do("dou-close-owned-browser-tabs",
      {retries:{limit:0,delay:"10 seconds",backoff:"constant"},timeout:"60 seconds"},
      async()=>{
       if(tab)try{await hub(env,"hub_write",BROWSER+"release_tab",{...tab,close:true},connection)}catch{}
       return cleanup(env,connection);
      });
   }catch(e){console.error("DOU cleanup unavailable",String(e?.message||e).slice(0,80))}
   await step.do("dou-release-exclusive-lease",
    {retries:{limit:1,delay:"10 seconds",backoff:"constant"},timeout:"25 seconds"},
    ()=>env.DB.prepare("UPDATE meta SET value='0' WHERE key='dou_browser_lease' AND value=?")
       .bind(String(deadline)).run());
  }
  if(blocked)await meta(env,"dou_browser_pause_until",String(Date.now()+6*3600000));
  const report={state:blocked?"publisher_blocked":error?"partial":scanned?"ok":"browser_offline",
   origin:event.payload?.origin||"manual_probe",slot:attempt,
   pages:scanned,found,inserted,targets:targetNames,error_code:error?"browser_or_mcp_error":null,
   at:now()};
  await step.do("dou-production-run-report",
    {retries:{limit:0,delay:"10 seconds",backoff:"constant"},timeout:"25 seconds"},
    ()=>meta(env,"dou_browser_last_report",JSON.stringify(report)));
  return report;
 }
}
