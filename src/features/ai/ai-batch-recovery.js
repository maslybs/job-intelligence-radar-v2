// One bounded split fallback: malformed/oversized model output should not
// strand every job in a ten-job batch. The caller keeps the per-job retry cap.
export async function evaluateWithSplitFallback(items,evaluate,onPartialError=()=>{}){
 try{return await evaluate(items);}
 catch(original){
  if(items.length<=1)throw original;
  const mid=Math.ceil(items.length/2);
  const results=[],failures=[];
  for(const group of [items.slice(0,mid),items.slice(mid)]){
   try{
    const chunk=await evaluate(group);
    if(!Array.isArray(chunk))throw Error("invalid_split_evaluation");
    results.push(...chunk);
   }catch(error){failures.push(String(error?.message||error).slice(0,140));}
  }
  if(failures.length)await onPartialError({jobs:items.length,unrecovered_chunks:failures.length,errors:failures});
  if(!results.length)throw original;
  return results;
 }
}
