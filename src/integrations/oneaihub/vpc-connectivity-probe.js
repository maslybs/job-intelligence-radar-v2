// Optional, separately deployed VPC connectivity diagnostic.
// Never included in the main Radar Worker or public anonymous configuration.
// Explicitly set ONEAIHUB_PROBE_TOKEN when deploying this entrypoint.
export default {
  async fetch(request,env) {
    const token=String(env?.ONEAIHUB_PROBE_TOKEN||"");
    if(!token)return Response.json({private_reachable:false,reason:"probe_access_not_configured"},{status:503});
    const authorization=String(request.headers.get("authorization")||"");
    if(authorization!=="Bearer "+token)return Response.json({error:"not authorized"},{status:403});
    if(typeof env?.ONEAIHUB_VPC?.fetch!=="function")
      return Response.json({private_reachable:false,reason:"vpc_binding_unavailable"},{status:503});
    const base=String(env.ONEAIHUB_MCP_ENDPOINT_PATH||"/mcp");
    const path=/^\/[a-zA-Z0-9_\/-]{1,120}$/.test(base)?base.replace(/\/$/,""):"/radar-reddit-mcp";
    try {
      const response=await env.ONEAIHUB_VPC.fetch("http://127.0.0.1:8710"+path+"/health",
        {signal:AbortSignal.timeout(8000)});
      return Response.json({private_reachable:response.status===401||response.status===200,
        status:response.status,auth_required:response.status===401});
    } catch(error) {
      return Response.json({private_reachable:false,error:String(error?.message||error).slice(0,110)},
        {status:503});
    }
  }
};
