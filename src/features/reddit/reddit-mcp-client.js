import {RADAR_SETTINGS} from "../../config/radar.generated.js";
// Reddit private MCP browser transport.

// Migrated from original Reddit scanner without changing declaration bodies.



export const REDDIT_GATE = [
  {code:"http_429_page",re:/^\s*(?:too many requests|429 too many requests)(?:\b|[.!])/im},
  {code:"security_interstitial",re:/\b(?:your request has been blocked|you have been blocked by network security|you've been blocked by network security|request was blocked by network security)\b/i},
  {code:"reddit_whoa",re:/^\s*whoa there[.!]?\s*$/im},
  {code:"captcha_interstitial",re:/\b(?:verify you are human|verify that you are human|complete the captcha to continue|unusual traffic from your network)\b/i}
];

export function redditAccessCheck(page) {
  const body=String(page?.bodyText||"").slice(0,1350), title=String(page?.title||"");
  const normalized=title+"\n"+body;
  const headline=[title,...body.split(/\n+/).slice(0,3)]
    .map(x=>String(x||"").trim().toLowerCase());
  const isInterstitial=headline.some(x=>
    /^(?:whoa there[.!]?|(?:429\s+)?too many requests|429 too many requests|(?:your request has been blocked|you have been blocked|you've been blocked)|verify (?:you are|that you are) human|complete the captcha to continue|unusual traffic from your network)/i.test(x));
  const found=isInterstitial?REDDIT_GATE.find(rule=>rule.re.test(normalized)):null;
  // Never treat a post describing somebody's CAPTCHA/rate limit as proof of
  // Reddit itself blocking us.
  const hasPosts=/(?:https?:\/\/www\.reddit\.com)?\/r\/[A-Za-z0-9_]+\/comments\/[A-Za-z0-9]+/.test(normalized);
  if(!found||hasPosts)return {blocked:false};
  return {blocked:true,reason:found.code};
}

export function object(x) { return x && typeof x === "object" && !Array.isArray(x) ? x : {}; }

export function unpack(packet) {
  if (packet.error || packet.result?.isError) throw Error("MCP operation failed");
  const outer=object(packet.result);
  let payload=outer.structuredContent;
  if (!payload) for (const item of outer.content || []) if(item.type==="text") {
    try {payload=JSON.parse(item.text);break;}catch{}
  }
  payload=object(payload||outer);
  if(payload.ok===false)throw Error("OneAIHUB method rejected");
  // OneAIHUB wraps results as { result: { ... tab properties, result: DOM }}.
  // Prefer a fully unwrapped DOM, but retain tab ID/handle for create_tab.
  if(payload.result && payload.result.result && (payload.result.result.bodyText!==undefined||
      payload.result.result.nodes!==undefined)) return object(payload.result.result);
  if(payload.result && (payload.result.handle||payload.result.tab_id||payload.result.id))
    return object(payload.result);
  if(payload.result && (payload.result.bodyText!==undefined||payload.result.nodes!==undefined))
    return object(payload.result);
  if(payload.preview && payload.preview.result?.result)
    return object(payload.preview.result.result);
  return payload;
}

export async function tunnelFetch(env,path,opts) {
  const response=await env.ONEAIHUB_VPC.fetch("http://127.0.0.1:8710"+path,
    { ...opts, signal:AbortSignal.timeout(24000) });
  if(!response.ok) throw Error("OneAIHUB transport status "+response.status);
  const body=await response.text();
  if(body.trimStart().startsWith("event:") || response.headers.get("content-type")?.includes("text/event-stream")) {
    const events=body.split("\n").filter(s=>s.startsWith("data:"));
    for (const line of events.reverse()) try { return JSON.parse(line.slice(5).trim()); } catch {}
    throw Error("MCP stream had no JSON response");
  }
  return JSON.parse(body);
}

export function scopedEndpoint(env) {
  const path=String(env.ONEAIHUB_MCP_ENDPOINT_PATH||RADAR_SETTINGS.integrations.oneaihub.endpointPath||"");
  if(!/^\/[a-zA-Z0-9][a-zA-Z0-9_-]{1,63}$/.test(path))
    throw Error("Dedicated scoped MCP endpoint path is missing");
  return path;
}

export async function auth(env) {
  // This version of OneAIHub supplies a per-endpoint Bearer Access Key
  // instead of an OAuth client secret. Prefer it for server-to-server MCP.
  if (!env.ONEAIHUB_VPC) throw Error("Private OneAIHUB binding unavailable");
  const bearer=String(env.ONEAIHUB_MCP_BEARER_TOKEN||"").trim();
  if (bearer) return bearer;
  if (!env.ONEAIHUB_MCP_CLIENT_ID || !env.ONEAIHUB_MCP_CLIENT_SECRET)
    throw Error("Dedicated OneAIHUB MCP Bearer key or OAuth credentials missing");
  const data=new URLSearchParams({
    grant_type:"client_credentials",client_id:env.ONEAIHUB_MCP_CLIENT_ID,
    client_secret:env.ONEAIHUB_MCP_CLIENT_SECRET
  });
  const result=await tunnelFetch(env,scopedEndpoint(env)+"/oauth/token",
    {method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:data.toString()});
  if (!result.access_token) throw Error("OneAIHUB OAuth not available");
  return result.access_token;
}

export async function mcpRequest(env, accessToken, sessionId, payload) {
  const headers = {
    "Authorization":"Bearer "+accessToken,
    "Content-Type":"application/json",
    "Accept":"application/json, text/event-stream",
    "MCP-Protocol-Version":"2025-03-26"
  };
  if(sessionId)headers["MCP-Session-Id"]=sessionId;
  const response=await env.ONEAIHUB_VPC.fetch(
    "http://127.0.0.1:8710"+scopedEndpoint(env)+"/mcp",
    {method:"POST",headers,body:JSON.stringify(payload),signal:AbortSignal.timeout(26000)});
  if(!response.ok)throw Error("Private MCP transport status "+response.status);
  if(response.status===202)return {packet:null,sessionId:response.headers.get("MCP-Session-Id")};
  const raw=await response.text();
  let packet;
  if(response.headers.get("content-type")?.includes("text/event-stream")){
    const data=raw.split("\n").filter(x=>x.startsWith("data:"));
    for(const line of data.reverse())try{packet=JSON.parse(line.slice(5).trim());break}catch{}
    if(!packet)throw Error("No MCP JSON in event stream");
  }else packet=JSON.parse(raw);
  return {packet,sessionId:response.headers.get("MCP-Session-Id")};
}

export async function hub(env,method,tool_ref,args,connection) {
  // Tokens/session IDs live only in volatile Workflow memory, never in D1
  // or durable Workflow step outputs.
  if(!connection.token){
    connection.phase="auth";
    connection.token=await auth(env);
    connection.sessionId="";
  }
  if(!connection.sessionId){
    const request={jsonrpc:"2.0",id:crypto.randomUUID(),method:"initialize",
      params:{protocolVersion:"2025-03-26",capabilities:{},
        clientInfo:{name:"job-radar-reddit",version:"1.0.0"}}};
    connection.phase="mcp_initialize";
    const response=await mcpRequest(env,connection.token,"",request);
    if(response.packet?.error || !response.sessionId)throw Error("MCP initialize handshake failed");
    connection.sessionId=response.sessionId;
    connection.phase="mcp_initialized";
    await mcpRequest(env,connection.token,connection.sessionId,
      {jsonrpc:"2.0",method:"notifications/initialized"});
  }
  const payload={jsonrpc:"2.0",id:crypto.randomUUID(),method:"tools/call",
    params:{name:method,arguments:{tool_ref,arguments:args}}};
  connection.phase="tool_call";
  const answer=await mcpRequest(env,connection.token,connection.sessionId,payload);
  return unpack(answer.packet||{});
}
