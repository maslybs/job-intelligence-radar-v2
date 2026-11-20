// Reddit durable Cloudflare Workflow orchestration.

// Migrated from original Reddit scanner without changing declaration bodies.

import { WorkflowEntrypoint } from "cloudflare:workers";

import {RADAR_SETTINGS} from "../../config/radar.generated.js";

import {hasBrowserOneAIHub} from "../../integrations/oneaihub/capabilities.js";

import {ensureRedditCatalogue,pickRedditTargets,redditTargetUrl,jitterDelayMs,learnRedditTarget,trackRedditHits} from "./reddit-adaptive.js";

import {ensureRedditThreadReviewTable,nextRedditThreadReview,classifyRedditThread,recordRedditThreadReview,redditThreadBudgetAvailable,chargeRedditThreadAi} from "./reddit-thread-review.js";

import { releaseRadarOwnedTab,closeRadarSessionTabs } from "./reddit-tab-lifecycle.js";

import { enrichRedditThreadSnapshot } from "./reddit-thread-evidence.js";

import {extract} from "./reddit-post-parser.js";

import {hub} from "./reddit-mcp-client.js";

import {mcpRequest} from "./reddit-mcp-client.js";

import {meta} from "./reddit-persistence.js";

import {redditAccessCheck} from "./reddit-mcp-client.js";



export const SESSION = "cloudflare-job-radar-reddit";

export class RedditMcpWorkflow extends WorkflowEntrypoint {
  async run(event,step) {
    const env=this.env,hour=String(event.payload?.hour||new Date().toISOString().slice(0,13));
    if(!RADAR_SETTINGS.leads.enabled||!RADAR_SETTINGS.reddit.enabled||!hasBrowserOneAIHub(env))
      return {state:"disabled_or_unavailable",checked:0,candidates:0,errors:0};
    // Explicit, read-only transport/permission diagnostic. Never navigates Reddit.
    // Only the status booleans are retained in Workflow logs.
    // Diagnostics: verify the WRITE permission the live workflow actually
    // needs. Blank tab only: no Reddit visit, no rate-limit bypass.
    if(event.payload?.blankTabProbe===true) {
      return await step.do("probe-private-mcp-blank-tab",
        {retries:{limit:0,delay:"10 seconds",backoff:"constant"},timeout:"75 seconds"},async()=>{
          const session={token:null,sessionId:null,phase:"none"};
          try{
            const v=await hub(env,"hub_write","chrome-extension-gateway::browser.create_tab",
              {session_id:SESSION,url:"about:blank",reuse:true,foreground:false},session);
            return {state:"ready",browser_create:true,
              handle_present:Boolean(v?.handle||v?.tab_id||v?.id)};
          }catch(e){
            const m=String(e?.message||"");
            const reason=/OneAIHUB method rejected|MCP operation failed|MCP tool rejected/i.test(m)?"method_rejected":
              /Private MCP transport status\s+(\d+)/i.test(m)?"transport_http_"+m.match(/Private MCP transport status\s+(\d+)/i)[1]:
              /timeout|abort/i.test(m)?"timeout":
              /ENOSPC|no space left/i.test(m)?"disk_full":
              /MCP initialize/i.test(m)?"initialize_failed":
              "other";
            return {state:"failed",phase:String(session.phase||"unknown"),reason,
              error_class:String(e?.name||"Error")};
          }
        });
    }
    if(event.payload?.probeOnly===true) {
      return await step.do("probe-private-mcp-auth",{retries:{limit:0,delay:'10 seconds',backoff:'constant'},timeout:"75 seconds"},async()=>{
        const session={token:null,sessionId:null};
        try {
          const discovered=await hub(env,"hub_read","chrome-extension-gateway::browser.get_state",{},session);
          if(!discovered || typeof discovered!=="object")
            return {state:"invalid_browser_response",authorized:false};
          let commandsAllowed=false,filesystemAllowed=false;
          try {
            await hub(env,"hub_read","local-command-runner::commands.list",{},session);
            commandsAllowed=true;
          }catch{}
          try {
            // A harmless path, and no filesystem contents are retained.
            await hub(env,"hub_read","local-filesystem::fs.list",
              {path:"/private/radar-mcp-scope-denial-probe"},session);
            filesystemAllowed=true;
          }catch{}
          return {state:commandsAllowed||filesystemAllowed?"unsafe_scope":"ready",authorized:true,
            browser_connector:true,non_browser_connector_denied:!commandsAllowed,
            non_filesystem_connector_denied:!filesystemAllowed};
        }catch(e){
          if(session.token && session.sessionId) {
            try {
              const listing=await mcpRequest(env,session.token,session.sessionId,
                {jsonrpc:"2.0",id:crypto.randomUUID(),method:"tools/list",params:{}});
              const methods=Array.isArray(listing.packet?.result?.tools) ?
                listing.packet.result.tools.map(t=>String(t.name||"")).slice(0,40) : [];
              return {state:"tool_call_failed",authorized:true,phase:String(session.phase),
                tool_names:methods,tool_count:methods.length};
            }catch{}
          }
          const msg=String(e?.message||"");
          const matched=msg.match(/(?:transport status\s+(?:401|403|404|429|500|502|503)|MCP initialize handshake failed|No MCP JSON in event stream|OneAIHUB method rejected|MCP operation failed|MCP tool rejected|Invalid URL|Unexpected token)/i);
          return {state:"auth_failed",authorized:false,
            phase:String(session.phase||"unknown").slice(0,30),
            error_code:matched?matched[0]:"other",
            error_class:String(e?.name||"Error").slice(0,30)};
        }
      });
    }
    const pauseUntil=Number(await env.DB.prepare("SELECT value FROM meta WHERE key=?")
      .bind("reddit_mcp_pause_until").first("value")||0);
    if(Date.now()<pauseUntil)return {state:"cooldown",until:pauseUntil};
    // Cron and manual /reddit both reuse one browser tab. An atomic D1 lease
    // prevents parallel navigation and expires automatically after 15 min
    // if a Cloudflare execution is interrupted.
    const leaseKey="reddit_mcp_active_lease";
    // State-changing operations must be durable Workflow steps so a resume
    // after step.sleep does not accidentally acquire a second browser lease.
    const lease=await step.do("reddit-browser-lease-acquire",
      {retries:{limit:0,delay:"10 seconds",backoff:"constant"},timeout:"20 seconds"},
      async()=>{
        const now=Date.now();
        await env.DB.prepare("DELETE FROM meta WHERE key=? AND CAST(value AS INTEGER)<?")
          .bind(leaseKey,now-15*60*1000).run();
        const value=String(now)+"-"+crypto.randomUUID();
        const taken=await env.DB.prepare("INSERT OR IGNORE INTO meta(key,value) VALUES(?,?)")
          .bind(leaseKey,value).run();
        return {granted:Boolean(taken.meta?.changes),value};
      });
    if(!lease.granted)return {state:"already_running",checked:0,candidates:0,errors:0};
    // Created handle is tracked across all navigation, including recovered tabs.
    // The owner closes it after each scan, including partial/blocked runs.
    let tabArgs=null,mcpConnection=null;
    try {
    await step.do("reddit-adaptive-schema-and-seed",
      {retries:{limit:0,delay:"10 seconds",backoff:"constant"},timeout:"40 seconds"},
      ()=>ensureRedditCatalogue(env));
    // Prioritize authentic business thread review on every second 5-min scan.
    // This REPLACES one discovery page; total Reddit page/navigation budget is
    // still at most 2 per cycle, with existing delays and 429 cooldown.
    // On daily comment-review budget exhaustion, pickRedditTargets resumes
    // 2 discovery pages rather than increasing traffic.
    const reviewDue=event.payload?.smokeTest!==true && event.payload?.reviewDue!==false;
    const pendingReview=reviewDue?await step.do("reddit-prioritize-previously-qualified-thread",
      {retries:{limit:0,delay:"10 seconds",backoff:"constant"},timeout:"25 seconds"},async()=>{
        if(!await redditThreadBudgetAvailable(env))return null;
        return await nextRedditThreadReview(env);
      }):null;
    // Always one discovery page; verified-comment review remains <=1 per
    // second scan. Thus 5-min discovery with at most 18 navigations/hour
    // (12 discovery + 6 comments), preserving Reddit backoff on 429.
    const targets=await step.do("reddit-adaptive-select",
      {retries:{limit:0,delay:"10 seconds",backoff:"constant"},timeout:"20 seconds"},
      ()=>pickRedditTargets(env,1));
    if(!targets.length&&!pendingReview){
      const report={state:"nothing_due",hour,checked:0,candidates:0,errors:0,pages:[],completed:new Date().toISOString()};
      await meta(env,"reddit_mcp_last_report",JSON.stringify(report));
      return report;
    }
    let tab;
    mcpConnection={token:null,sessionId:null};
    // Clean orphan tabs from earlier interrupted runs, scoped to Radar only.
    try {
      const cleaned=await step.do("reddit-remove-orphan-tabs",
        {retries:{limit:0,delay:"10 seconds",backoff:"constant"},timeout:"50 seconds"},
        ()=>closeRadarSessionTabs(env,mcpConnection,hub));
      if(cleaned.failed)console.error("reddit orphan cleanup incomplete",cleaned.failed);
    }catch(e){console.error("reddit orphan cleanup unavailable",String(e?.message||e).slice(0,110))}
    try {
      tab=await step.do("agent-owned-reddit-tab",
        {retries:{limit:0,delay:"10 seconds",backoff:"constant"},timeout:"75 seconds"},async()=>{
          const request=()=>hub(env,"hub_write","chrome-extension-gateway::browser.create_tab",
            {session_id:SESSION,url:"about:blank",reuse:true,foreground:false},mcpConnection);
          try{return await request()}
          catch(e){
            const msg=String(e?.message||e);
            // Recover one transient private-gateway/MCP session failure. This
            // only creates about:blank; it does not retry or bypass Reddit.
            if(!/MCP|OneAIHUB|gateway|transport|timeout|AbortError/i.test(msg))throw e;
            mcpConnection={token:null,sessionId:null,phase:"retry_blank_tab"};
            return await request();
          }
        });
      if(!tab.handle&&!tab.tab_id&&!tab.id)throw Error("No OneAIHUB agent tab");
    }catch(e){
      const msg=String(e?.message||e);
      const category=/ENOSPC|no space left/i.test(msg)?"disk_full":
        /401|403|auth|token/i.test(msg)?"auth_or_permission":
        /tab_closed|tab_not_found/i.test(msg)?"browser_tab_closed":"browser_offline";
      const report={state:"offline",reason:category,
        stage:String(mcpConnection?.phase||"unknown").slice(0,32),
        hour,checked:0,candidates:0,errors:1,completed:new Date().toISOString()};
      await meta(env,"reddit_mcp_last_report",JSON.stringify(report));
      return report;
    }
    tabArgs={session_id:SESSION,...(tab.handle?{handle:tab.handle}:{tab_id:tab.tab_id||tab.id})};
    async function navigateToReddit(url){
      try{
        await hub(env,"hub_write","chrome-extension-gateway::browser.goto",
          {...tabArgs,url,wait:true,timeout_ms:19000},mcpConnection);
      }catch(e){
        const msg=String(e?.message||e);
        // A closed agent tab is a recoverable browser defect, not evidence
        // of a Reddit ban. Retry the navigation once on a fresh tab.
        if(!/tab_closed|tab_not_found|tab not found|stale tab|unknown tab/i.test(msg))throw e;
        const fresh=await hub(env,"hub_write","chrome-extension-gateway::browser.create_tab",
          {session_id:SESSION,url:"about:blank",reuse:false,foreground:false},mcpConnection);
        if(!fresh?.handle&&!fresh?.tab_id&&!fresh?.id)throw Error("Browser tab recovery failed");
        delete tabArgs.handle;delete tabArgs.tab_id;
        Object.assign(tabArgs,fresh.handle?{handle:fresh.handle}:{tab_id:fresh.tab_id||fresh.id});
        await hub(env,"hub_write","chrome-extension-gateway::browser.goto",
          {...tabArgs,url,wait:true,timeout_ms:19000},mcpConnection);
      }
    }
    const posts=new Set(),pageMetrics=[];
    let errors=0,blocked=false,checked=0,inserted=0;
    for(let i=0;i<targets.length;i++){
      if(i){
        const delay=await step.do("polite-random-delay-"+i,
          {retries:{limit:0,delay:"10 seconds",backoff:"constant"},timeout:"15 seconds"},
          ()=>jitterDelayMs());
        await step.sleep("one-page-at-a-time-"+i,delay);
      }
      const target=targets[i],url=redditTargetUrl(target);
      try {
        const data=await step.do("reddit-adaptive-browser-"+i,
          {retries:{limit:0,delay:"10 seconds",backoff:"constant"},timeout:"100 seconds"},async()=>{
            await navigateToReddit(url);
            const initial=await hub(env,"hub_read","chrome-extension-gateway::browser.dom_snapshot",
              {...tabArgs,includeBodyText:true,bodyTextLimit:18000,include_offscreen:true,limit:70,scan_limit:600},mcpConnection);
            const access=redditAccessCheck(initial);
            if(access.blocked)return {...access,items:[],stats:{postLinks:0}};
            const nodes=Array.isArray(initial.nodes)?initial.nodes.slice():
              Array.isArray(initial.nodes?.items)?initial.nodes.items.map(x=>x.value):[];
            // Read slices of the same DOM. No extra Reddit navigation.
            for(const word of ["hiring","looking for","need","not working","automation","integration","api"]){
              const slice=await hub(env,"hub_read","chrome-extension-gateway::browser.dom_snapshot",
                {...tabArgs,query:word,include_offscreen:true,limit:30,scan_limit:1300},mcpConnection);
              const list=Array.isArray(slice.nodes)?slice.nodes:
                Array.isArray(slice.nodes?.items)?slice.nodes.items.map(x=>x.value):[];
              nodes.push(...list);
            }
            return extract({nodes,bodyText:initial.bodyText,title:initial.title,
              searchHasDayFilter:target.kind!=="sub"},new Date().toISOString());
          });
        checked++;
        if(data.blocked){
          blocked=true;
          await step.do("reddit-adaptive-blocked-"+i,
            {retries:{limit:0,delay:"10 seconds",backoff:"constant"},timeout:"25 seconds"},
            ()=>learnRedditTarget(env,target,data.stats||{},[],true,
            "publisher_blocked_"+String(data.reason||"unknown")));
          pageMetrics.push({source:target.kind==="sub"?"r/"+target.term:target.term,
            error:"publisher_blocked",evidence_type:data.reason||"unknown"});
          break;
        }
        const added=await step.do("reddit-adaptive-store-"+i,
          {retries:{limit:0,delay:"10 seconds",backoff:"constant"},timeout:"55 seconds"},
          ()=>trackRedditHits(env,target,data.items));
        await step.do("reddit-adaptive-learn-"+i,
          {retries:{limit:0,delay:"10 seconds",backoff:"constant"},timeout:"25 seconds"},
          ()=>learnRedditTarget(env,target,data.stats,data.items,false,"",added,data.suggestedSubs||[]));
        for(const p of data.items)posts.add(p.url);
        inserted+=added;
        pageMetrics.push({source:target.kind==="sub"?"r/"+target.term:target.term,
          ...(data.stats||{}),candidates:data.items.length,new:added,
          suggestedCommunities:data.suggestedSubs?.length||0});
      }catch(e){
        errors++;
        const error=String(e?.message||e);
        // A browser/MCP failure or closed tab is NOT a publisher ban.
        // Only explicit publisher 429 / security interstitial is a cooldown.
        if(/(?:^|\b)(?:HTTP\s*)?429\b|reddit.{0,100}(?:captcha|security interstitial)/i.test(error))
          blocked=true;
        await step.do("reddit-adaptive-learn-error-"+i,
          {retries:{limit:0,delay:"10 seconds",backoff:"constant"},timeout:"25 seconds"},
          ()=>learnRedditTarget(env,target,{},[],true,
            blocked?"publisher_blocked":error.includes("404")?"not_found":"browser_error"));
        const errorCode=blocked?"publisher_blocked":
          /ENOSPC|no space left/i.test(error)?"disk_full":
          /tab_closed|tab_not_found|unknown tab/i.test(error)?"browser_tab_closed":
          /MCP|gateway|initialize/i.test(error)?"oneaihub_gateway":"browser_error";
        pageMetrics.push({source:target.kind==="sub"?"r/"+target.term:target.term,
          error:errorCode});
        if(blocked||errors>=2)break;
      }
    }
    let commentReview=null;
    if(!blocked&&pendingReview){
      // One independent thread page, after any earlier query page.
      if(checked){
        const delay=await step.do("reddit-thread-polite-delay",
          {retries:{limit:0,delay:"10 seconds",backoff:"constant"},timeout:"15 seconds"},
          ()=>jitterDelayMs());
        await step.sleep("reddit-before-thread-detail",delay);
      }
      try{
        const detail=await step.do("reddit-read-and-review-comments",
          {retries:{limit:0,delay:"10 seconds",backoff:"constant"},timeout:"170 seconds"},async()=>{
            await navigateToReddit(pendingReview.url);
            const initial=await hub(env,"hub_read","chrome-extension-gateway::browser.dom_snapshot",
              {...tabArgs,includeBodyText:true,bodyTextLimit:26000,
                include_offscreen:true,limit:120,scan_limit:2400},mcpConnection);
            const gate=redditAccessCheck(initial);
            if(gate.blocked)return {blocked:true,evidence_type:gate.reason};
            // Additional DOM observations are on the SAME loaded page: no
            // extra Reddit request, tab or rate-limit pressure.
            const slices=[];
            for(const query of ["comment","reply","author"]){
              try{
                slices.push(await hub(env,"hub_read",
                  "chrome-extension-gateway::browser.dom_snapshot",
                  {...tabArgs,query,include_offscreen:true,limit:85,scan_limit:3200},
                  mcpConnection));
              }catch(e){
                console.error("reddit comment DOM slice unavailable",query,
                  String(e?.message||e).slice(0,110));
              }
            }
            const snapshot=enrichRedditThreadSnapshot(initial,slices);
            await chargeRedditThreadAi(env);
            const review=await classifyRedditThread(env,pendingReview,snapshot);
            const saved=await recordRedditThreadReview(env,pendingReview,review);
            return {blocked:false,...saved};
          });
        if(detail.blocked){
          blocked=true;
          commentReview={state:"publisher_interstitial",reason:detail.evidence_type};
        }else commentReview={state:detail.status,competition:detail.competition,
          comments_observed:detail.comments_observed,offers_observed:detail.offers_observed};
      }catch(e){
        errors++;
        const msg=String(e?.message||e);
        if(/(?:^|\b)(?:HTTP\s*)?429\b|reddit.{0,100}(?:captcha|security interstitial)/i.test(msg))blocked=true;
        else{
          await step.do("reddit-record-unavailable-comments",
            {retries:{limit:0,delay:"10 seconds",backoff:"constant"},timeout:"25 seconds"},
            ()=>recordRedditThreadReview(env,pendingReview,{
              status:"unavailable",competition:"unknown",offer_count:null,
              author_engaged:false,comments_observed:null,
              reason_uk:"Обговорення недоступне для перевірки коментарів.",
              comment_summary_uk:"",ad_signal:"browser_or_ai_error"}));
        }
        commentReview={state:blocked?"publisher_interstitial":"unavailable"};
      }
    }
    if(blocked)await step.do("reddit-rate-cooldown",
      {retries:{limit:0,delay:"10 seconds",backoff:"constant"},timeout:"15 seconds"},
      ()=>meta(env,"reddit_mcp_pause_until",Date.now()+12*60*60*1000));
    const report={state:blocked?"blocked":errors?"partial":"ok",hour,checked,candidates:posts.size,inserted,errors,
      pages:pageMetrics,comment_review:commentReview,completed:new Date().toISOString()};
    await step.do("reddit-adaptive-write-health",
      {retries:{limit:0,delay:"10 seconds",backoff:"constant"},timeout:"20 seconds"},
      ()=>meta(env,"reddit_mcp_last_report",JSON.stringify(report)));
    return report;
    } finally {
      // release_tab(close:true) closes agent-owned tabs, never user-owned tabs.
      // Execute before releasing the D1 lease so another run cannot reuse this tab.
      if(tabArgs){
        try{
          await step.do("reddit-close-agent-tab",
            {retries:{limit:0,delay:"10 seconds",backoff:"constant"},timeout:"35 seconds"},
            ()=>releaseRadarOwnedTab(env,tabArgs,mcpConnection,hub));
        }catch(e){
          console.error("reddit browser tab cleanup failed",String(e?.message||e).slice(0,160));
        }
      }
      // Close all session-owned leftovers: a recovery may have created another
      // tab, or a timed-out create_tab may never have returned its handle.
      try{
        const sweep=await step.do("reddit-final-session-tab-cleanup",
          {retries:{limit:0,delay:"10 seconds",backoff:"constant"},timeout:"50 seconds"},
          async()=>{
            const r=await closeRadarSessionTabs(env,
              mcpConnection||{token:null,sessionId:null},hub);
            await meta(env,"reddit_tab_cleanup_last",JSON.stringify({
              ...r,checked_at:new Date().toISOString()
            }));
            return r;
          });
        if(sweep.failed)console.error("reddit leftover tabs",sweep.failed);
      }catch(e){console.error("reddit final tab sweep failed",String(e?.message||e).slice(0,130))}
      await step.do("reddit-browser-lease-release",
        {retries:{limit:0,delay:"10 seconds",backoff:"constant"},timeout:"20 seconds"},
        ()=>env.DB.prepare("DELETE FROM meta WHERE key=? AND value=?")
          .bind(leaseKey,lease.value).run());
    }
  }
}

// Backwards-compatible helper export for existing DOU integrations.
export {hub} from "./reddit-mcp-client.js";
