const fs=require('fs'),vm=require('vm'),assert=require('assert');
const src=fs.readFileSync('src/features/reddit/reddit-mcp-client.js','utf8');
const section=src.slice(src.indexOf('export function object(')).replace(/^export /gm,'');
let oauth=0,init=0,ready=0,calls=0,allHeaders=[];
const env={
 ONEAIHUB_MCP_ENDPOINT_PATH:'/radar-reddit-mcp',
 ONEAIHUB_MCP_CLIENT_ID:'TEST_ID',
 ONEAIHUB_MCP_CLIENT_SECRET:'TEST_SECRET',
 ONEAIHUB_VPC:{
  async fetch(url,opts){
   assert(url.startsWith('http://127.0.0.1:8710/radar-reddit-mcp/'));
   if(url.endsWith('/oauth/token')){
    oauth++;assert(opts.body.includes('client_credentials'));
    return new Response(JSON.stringify({access_token:'SENTINEL_TOKEN'}),{status:200,headers:{'content-type':'application/json'}});
   }
   const rpc=JSON.parse(opts.body);
   allHeaders.push({method:rpc.method,session:opts.headers['MCP-Session-Id']||null});
   if(rpc.method==='initialize'){
    init++;assert(!opts.headers['MCP-Session-Id']);
    return new Response(JSON.stringify({jsonrpc:'2.0',id:rpc.id,result:{protocolVersion:'2025-03-26'}}),{status:200,headers:{'content-type':'application/json','MCP-Session-Id':'SESSION_X'}});
   }
   assert.equal(opts.headers['MCP-Session-Id'],'SESSION_X');
   if(rpc.method==='notifications/initialized'){
    ready++;return new Response(null,{status:202});
   }
   assert.equal(rpc.method,'tools/call');calls++;
   return new Response(JSON.stringify({jsonrpc:'2.0',id:rpc.id,result:{
     structuredContent:{ok:true,result:{handle:'tab_mock',tab_id:123}}
   }}),{status:200,headers:{'content-type':'application/json'}});
  }
 }};
const context=vm.createContext({Response,URLSearchParams,AbortSignal,crypto:require('crypto').webcrypto,console,env,JSON,Error});
vm.runInContext(section,context);
(async()=>{
 const conn={token:null,sessionId:null};
 const result=await vm.runInContext('hub(env,"hub_write","chrome-extension-gateway::browser.create_tab",{url:"about:blank"},connection)',vm.createContext({...context,connection:conn}));
 assert.equal(result.handle,'tab_mock');
 await vm.runInContext('hub(env,"hub_read","chrome-extension-gateway::browser.get_state",{},connection)',vm.createContext({...context,connection:conn}));
 assert.deepStrictEqual([oauth,init,ready,calls],[1,1,1,2]);
 console.log(JSON.stringify({passed:true,oauth,initialize:init,initializedNotification:ready,toolsCalls:calls,privateOnly:true}));
})().catch(e=>{console.error(e);process.exitCode=1});
