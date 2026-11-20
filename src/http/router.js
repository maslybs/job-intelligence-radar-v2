import {aiBudgetState} from "../platform/ai-budget.js";
// HTTP route tree, authorization and Inbox endpoints.
// Extracted from the production-compatible Worker without modifying the bodies.
import {MODEL,DAILY_AI_LIMIT,TGT} from "../config/constants.js";
import {RADAR_SETTINGS} from "../config/radar.generated.js";
import { runDemandDigest } from "../features/prospects/demand-discovery.js";
import {getMeta,putMeta} from "../platform/meta.js";
import {reviewBatch,seedBenchmark,scorecard,initOpportunity} from "../features/ai/opportunity-intelligence.js";
import { baseSources } from "../features/discovery/source-catalog.js";
import {hasBrowserOneAIHub,oneAIHubCapabilities} from "../integrations/oneaihub/capabilities.js";
import {validateSource,listSources,addSource} from "../features/discovery/custom-sources.js";
import { assess } from "../ai/job-evaluation-service.js";
import { notify, notifyReview } from "../features/delivery/notification-service.js";
import { testTelegram, tg, verifyTelegram } from "../features/delivery/telegram-transport.js";
import {listDeliveryIncidents} from "../features/delivery/telegram-outbox.js";
import { scan } from "../features/jobs/scan-service.js";
import { radarHealthReport } from "../features/observability/health-service.js";
import { enc, logged, sign } from "./auth.js";
import {consumeLoginAttempt,resetLoginAttempts} from "./login-rate-limit.js";
import { html, inbox } from "./inbox-view.js";
import { legacyEvaluate } from "./legacy-evaluate.js";
import { json } from "./responses.js";
import { radarHandleTelegram } from "./telegram-webhook.js";
import { iso, kyivDay, text } from "../platform/runtime-utils.js";

export async function handleFetch(req, env, ctx) {
    const u = new URL(req.url);
    if(u.pathname==="/telegram/webhook" && req.method==="POST")
      return radarHandleTelegram(req,env,ctx);
    if (u.pathname === "/health") return json({ ok: true, runtime: "Cloudflare cron", inbox: "/inbox", ai_daily_limit: DAILY_AI_LIMIT });
    if (u.pathname.startsWith("/admin/")) {
      if (!env.ADMIN_TOKEN || req.headers.get("Authorization") !== "Bearer " + env.ADMIN_TOKEN) return json({ error: "not authorized" }, 403);
      if(u.pathname==="/admin/demand/preview"&&req.method==="GET"){
         if(!RADAR_SETTINGS.leads.enabled)return json({state:"disabled_by_configuration"});
        return json(await runDemandDigest(env,{day:kyivDay(),
          slot:"preview_"+kyivDay(),send:false}));
      }
      if(u.pathname==="/admin/demand/send"&&req.method==="POST"){
         if(!RADAR_SETTINGS.leads.enabled)return json({state:"disabled_by_configuration"});
        const day=kyivDay(),slot="manual_"+day+"_"+new Date().toISOString().slice(11,13);
        return json(await runDemandDigest(env,{day,slot,send:true,
          deliver:async text=>{
            await verifyTelegram(env);
            await tg(env,"sendMessage",{chat_id:env.TG_CHAT_ID,text,
              parse_mode:"HTML",disable_web_page_preview:true});
          }}));
      }
      if(u.pathname==="/admin/health/audit"&&req.method==="GET"){
        return json({last:JSON.parse(await getMeta(env,"hourly_health_audit_last")||"null")});
      }
      if(u.pathname==="/admin/opportunities"&&req.method==="GET")
        return json(await scorecard(env));
      if(u.pathname==="/admin/opportunities/sample"&&req.method==="GET"){
        await initOpportunity(env);
        const page=Math.max(0,Math.min(10,Number(u.searchParams.get("page")||0)));
        return json({page,items:(await env.DB.prepare(
          "SELECT b.job_id,b.old_decision,b.label,b.critical_error,b.contacted,b.manual_seconds,b.notes,"+
          "j.title,j.source,j.url,j.reason,j.score,j.engagement,j.geo,"+
          "o.channel,o.stage,o.reason_code,o.technical_fit,o.evidence_json,o.missing_json,o.explanation,"+
          "o.rejection,o.next_action,b.old_manual_seconds FROM opportunity_benchmark b "+
          "JOIN jobs j ON j.id=b.job_id LEFT JOIN opportunity_reviews o ON o.job_id=b.job_id "+
          "ORDER BY b.job_id LIMIT 20 OFFSET ?").bind(page*20).all()).results||[]});
      }
      if(u.pathname==="/admin/opportunities/feedback"&&req.method==="POST"){
        await initOpportunity(env);
        let form;try{form=await req.json()}catch{return json({error:"invalid_json"},400)}
        const id=String(form?.job_id||""),
          label=String(form?.label||"");
        if(!/^[a-f0-9]{28}$/.test(id)||!["accepted","rejected","unlabeled"].includes(label))
          return json({error:"invalid_job_or_label"},400);
        const current=await env.DB.prepare("SELECT job_id FROM opportunity_benchmark WHERE job_id=?").bind(id).first();
        if(!current)return json({error:"not_in_100_sample"},404);
        const seconds=form?.manual_seconds==null?null:Number(form.manual_seconds);
        if(seconds!==null&&(!Number.isFinite(seconds)||seconds<0||seconds>7200))
          return json({error:"invalid_manual_seconds"},400);
        await env.DB.prepare("UPDATE opportunity_benchmark SET label=?,critical_error=?,contacted=?,"+
          "manual_seconds=?,notes=?,labeled_at=?,old_manual_seconds=? WHERE job_id=?").bind(label,
          form.critical_error===true?1:0,form.contacted===true?1:0,
          seconds,String(form.notes||"").slice(0,600),iso(),
          form.old_manual_seconds==null?null:Math.max(0,Math.min(7200,Math.round(Number(form.old_manual_seconds)||0))),id).run();
        return json({saved:true,job_id:id,label});
      }
      if (u.pathname === "/admin/stats") {
        const s = (await env.DB.prepare("SELECT state,COUNT(*) n FROM jobs GROUP BY state").all()).results;
        return json({ states: s, latest: (await env.DB.prepare("SELECT * FROM runs ORDER BY id DESC LIMIT 3").all()).results, source_status: (await env.DB.prepare("SELECT source,last_success,last_error FROM source_state").all()).results, configured_sources: baseSources().length + JSON.parse(await getMeta(env, "custom_sources") || "[]").length, ai_daily_limit: DAILY_AI_LIMIT, ai_used_today: (await aiBudgetState(env)).used });
      }
      if (u.pathname === "/admin/scan" && req.method === "POST") return json(await scan(env, u.searchParams.get("force") === "1"));
      if (u.pathname === "/admin/assess" && req.method === "POST") return json(await assess(env));
      if (u.pathname === "/admin/telegram/health" && req.method === "GET") {
        const last = (await env.DB.prepare("SELECT MAX(alerted_at) as last_alert FROM jobs WHERE alerted_at IS NOT NULL").first())?.last_alert || null;
        return json({ ok: true, last_delivery: JSON.parse(await getMeta(env, "telegram_last_success") || "null"), last_failure: JSON.parse(await getMeta(env, "telegram_last_error") || "null"), historical_last_alert: last, review_last_sent: JSON.parse(await getMeta(env, "review_last_sent") || "null"), tracked_after_deploy: true });
      }
      if (u.pathname === "/admin/reddit/private-probe" && req.method === "GET") {
        if(!RADAR_SETTINGS.integrations.oneaihub.enabled)return json({private_reachable:false,reason:"disabled_by_configuration"},503);
        if (!env.ONEAIHUB_VPC) return json({ private_reachable:false,reason:"no VPC binding" }, 503);
        try {
          const response = await env.ONEAIHUB_VPC.fetch("http://127.0.0.1:8710/health", {
            method:"GET",signal:AbortSignal.timeout(9000)
          });
          return json({ private_reachable:response.status===401||response.status===200,
            status:response.status,authentication_required:response.status===401 });
        } catch(e) { return json({private_reachable:false,reason:String(e?.message||e).slice(0,140)},503); }
      }
      if (u.pathname === "/admin/reddit/health" && req.method === "GET")
        return json({ oneaihub: oneAIHubCapabilities(env), configured: Boolean(env.ONEAIHUB_VPC && env.REDDIT_MCP_WORKFLOW),
          enabled: RADAR_SETTINGS.reddit.enabled && env.REDDIT_MCP_ENABLED === "1",
          credentials_present: Boolean(env.ONEAIHUB_MCP_BEARER_TOKEN || (env.ONEAIHUB_MCP_CLIENT_ID && env.ONEAIHUB_MCP_CLIENT_SECRET)),
          endpoint_path: env.ONEAIHUB_MCP_ENDPOINT_PATH || RADAR_SETTINGS.integrations.oneaihub.endpointPath || null,
          last_report: JSON.parse(await getMeta(env, "reddit_mcp_last_report") || "null"),
          pause_until: Number(await getMeta(env, "reddit_mcp_pause_until") || 0) || null });
      if (u.pathname.startsWith("/admin/upwork/")) return json({source:"Upwork",state:"disabled"},410);
      if (u.pathname === "/admin/digest" && req.method === "POST") return json(await notify(env, "digest", u.searchParams.get("send") === "1", u.searchParams.get("batch") === "2" ? "2" : ""));
      if (u.pathname === "/admin/health-report" && (req.method === "GET" || req.method === "POST")) return json(await radarHealthReport(env,{send:req.method==="POST" && u.searchParams.get("send")==="1",slot:"manual",force:false}));
      if (u.pathname === "/admin/telegram/delivery-issues" && req.method === "GET")
        return json(await listDeliveryIncidents(env));
      if (u.pathname === "/admin/test-telegram" && req.method === "POST") return json(await testTelegram(env));
      if (u.pathname === "/admin/review" && (req.method === "GET" || req.method === "POST")) return json(await notifyReview(env, req.method === "POST" && u.searchParams.get("send") === "1"));
      if (u.pathname === "/admin/sources" && req.method === "GET") return json(await listSources(env));
      if (u.pathname === "/admin/sources" && req.method === "POST") return json(await addSource(env, await req.json()));
      return json({ error: "not found" }, 404);
    }
    if (u.pathname === "/evaluate" && req.method === "POST") return legacyEvaluate(req, env);
    if (u.pathname === "/") return Response.redirect(u.origin + "/inbox", 302);
    if (req.method === "POST" && req.headers.get("Origin") && req.headers.get("Origin") !== u.origin) return json({ error: "bad origin" }, 403);
    if (u.pathname === "/login" && req.method === "POST") {
      if(!env.INBOX_PASSWORD)return json({error:"login_not_configured"},503);
      const attempt=await consumeLoginAttempt(req,env);
      if(!attempt.allowed)return new Response("Too many login attempts",{
        status:429,headers:{"Retry-After":String(Math.ceil(attempt.retryAfter)),
          "Cache-Control":"no-store"}
      });
      const f = await req.formData(), a = enc.encode(String(f.get("password") || "")), b = enc.encode(env.INBOX_PASSWORD);
      const aa = new Uint8Array(await crypto.subtle.digest("SHA-256", a)), bb = new Uint8Array(await crypto.subtle.digest("SHA-256", b));
      if (!aa.every((v, i) => v === bb[i])) return html('<main class="login"><h1>Job Radar</h1><p>\u041D\u0435\u043F\u0440\u0430\u0432\u0438\u043B\u044C\u043D\u0438\u0439 \u043F\u0430\u0440\u043E\u043B\u044C.</p><form method="post" action="/login"><input type="password" name="password" required><button>\u0423\u0432\u0456\u0439\u0442\u0438</button></form></main>');
      await resetLoginAttempts(req,env);
      const exp = String(Date.now() + 864e5 * 14), cookie = exp + "." + await sign(env, exp);
      return new Response(null, { status: 303, headers: { location: "/inbox", "set-cookie": "jr=" + cookie + "; Secure; HttpOnly; SameSite=Strict; Path=/; Max-Age=1209600" } });
    }
    if (!await logged(req, env)) return html('<main class="login card"><h1>Job Radar Inbox</h1><p class="muted">\u0422\u0456\u043B\u044C\u043A\u0438 \u0434\u043B\u044F \u0432\u043B\u0430\u0441\u043D\u0438\u043A\u0430</p><form method="post" action="/login"><input type="password" name="password" placeholder="\u041F\u0430\u0440\u043E\u043B\u044C" required><button>\u0423\u0432\u0456\u0439\u0442\u0438</button></form></main>');
    if (u.pathname === "/inbox" && req.method === "GET") return inbox(env, u);
    if (u.pathname === "/logout" && req.method === "POST") return new Response(null, { status: 303, headers: { location: "/inbox", "set-cookie": "jr=; Max-Age=0; Path=/; HttpOnly; Secure" } });
    if (u.pathname === "/source/add" && req.method === "POST") {
      const f = await req.formData();
      try {
        await addSource(env, { kind: f.get("kind"), name: f.get("name"), url: f.get("url"), slug: f.get("slug"), query: f.get("query") });
      } catch (e) {
        return json({ error: String(e.message || e) }, 400);
      }
      return new Response(null, { status: 303, headers: { location: "/inbox" } });
    }
    if (u.pathname === "/action" && req.method === "POST") {
      const f = await req.formData(), id = String(f.get("id") || ""), state = String(f.get("state") || ""), tab = String(f.get("tab") || "unread");
      if (!/^[a-f0-9]{28}$/.test(id) || !["read", "saved", "ignored", "unread"].includes(state)) return json({ error: "bad request" }, 400);
      await env.DB.prepare("UPDATE jobs SET state=?,read_at=? WHERE id=? AND state IN ('unread','read','saved','ignored')").bind(state, state === "unread" ? null : iso(), id).run();
      return new Response(null, { status: 303, headers: { location: "/inbox?tab=" + encodeURIComponent(tab) } });
    }
    return json({ error: "not found" }, 404);
  }
