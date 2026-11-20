// Releases only a handle acquired under Radar's agent session. Never touches
// active user tabs or any external tab even if it happens to show Reddit.
export async function releaseRadarOwnedTab(env,tabArgs,mcpConnection,hub){
  if(!tabArgs||tabArgs.session_id!=="cloudflare-job-radar-reddit")
    return {released:false,reason:"not_radar_agent_session"};
  const locator=typeof tabArgs.handle==="string"&&tabArgs.handle.startsWith("tab_")
    ?{handle:tabArgs.handle}
    :Number.isInteger(tabArgs.tab_id)?{tab_id:tabArgs.tab_id}:null;
  if(!locator)return {released:false,reason:"no_owned_tab_handle"};
  return await hub(env,"hub_write","chrome-extension-gateway::browser.release_tab",
    {session_id:"cloudflare-job-radar-reddit",...locator,close:true},mcpConnection);
}

// Cleanup session-owned orphan tabs, including tabs created before a Workflow
// timeout or recovered after a stale handle. Do not touch human-owned tabs.
export function radarSessionTabs(raw) {
  const a=raw?.result?.agent_tabs||raw?.agent_tabs||raw?.preview?.result?.agent_tabs||[];
  return Array.isArray(a)?a.filter(tab=>
    tab?.session_id==="cloudflare-job-radar-reddit"&&tab?.origin==="agent"&&
    ((typeof tab?.handle==="string"&&tab.handle.startsWith("tab_"))||
     Number.isInteger(tab?.id))
  ).map(tab=>({session_id:"cloudflare-job-radar-reddit",
    ...(typeof tab.handle==="string"&&tab.handle.startsWith("tab_")
      ?{handle:tab.handle}:{tab_id:tab.id})})).slice(0,25):[];
}
export async function closeRadarSessionTabs(env,connection,hub){
  const raw=await hub(env,"hub_read","chrome-extension-gateway::browser.get_state",{},connection);
  const tabs=radarSessionTabs(raw);
  const result={seen:tabs.length,closed:0,failed:0};
  for(const tab of tabs){
    try{
      const out=await releaseRadarOwnedTab(env,tab,connection,hub);
      if(out?.closed===true||out?.released===true||out?.result?.closed===true)result.closed++;
      else result.failed++;
    }catch(e){result.failed++;}
  }
  return result;
}
