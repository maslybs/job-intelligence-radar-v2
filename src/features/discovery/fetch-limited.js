import {assertSafeSourceUrl} from "./safe-source-url.js";
// Bound actual bytes read from untrusted RSS/API publishers, not just returned text.
export const MAX_SOURCE_RESPONSE_BYTES=1600000;
export async function fetchLimited(u) {
  assertSafeSourceUrl(u,{maxLength:2048});
  const r=await fetch(u,{
    headers:{Accept:"application/json, application/rss+xml, application/atom+xml, text/xml",
      "User-Agent":"OneAIHub Job Radar personal research"},
    signal:AbortSignal.timeout(12500),redirect:"error"
  });
  if(!r.ok)throw Error("source "+new URL(u).host+" HTTP "+r.status);
  return readLimitedResponse(r);
}
export async function readLimitedResponse(r){
  const declared=Number(r.headers.get("Content-Length")||0);
  if(declared>MAX_SOURCE_RESPONSE_BYTES){
    await r.body?.cancel().catch(()=>{});
    throw Error("source_response_too_large");
  }
  if(!r.body)return "";
  const reader=r.body.getReader(),decoder=new TextDecoder();
  let total=0,result="";
  try {
    while(true){
      const {done,value}=await reader.read();
      if(done)break;
      total+=value.byteLength;
      if(total>MAX_SOURCE_RESPONSE_BYTES)throw Error("source_response_too_large");
      result+=decoder.decode(value,{stream:true});
    }
    return result+decoder.decode();
  }catch(error){
    await reader.cancel().catch(()=>{});
    throw error;
  }finally{
    reader.releaseLock();
  }
}
