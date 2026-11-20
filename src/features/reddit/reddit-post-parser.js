import {matchesLeadProfile} from "../../platform/profile-matching.js";
// Reddit candidate extraction and evidence filters.

// Migrated from original Reddit scanner without changing declaration bodies.

import {redditAccessCheck} from "./reddit-mcp-client.js";



export const POST = /^\/r\/([a-zA-Z0-9_]+)\/comments\/([a-z0-9]+)(?:\/|$)/i;

export const REDDIT_HOSTS = new Set(["www.reddit.com","reddit.com","old.reddit.com","new.reddit.com"]);

export function redditPostLink(node){
  const raw=[node?.href,node?.url,node?.attributes?.href,node?.attrs?.href,
    node?.props?.href,node?.link?.href,node?.value?.href].find(x=>typeof x==="string"&&x.trim());
  if(!raw)return null;
  try{
    const u=new URL(raw,"https://www.reddit.com");
    if(u.protocol!=="https:"||!REDDIT_HOSTS.has(u.hostname))return null;
    const m=POST.exec(u.pathname);
    return m?{sub:m[1],id:m[2].toLowerCase()}:null;
  }catch{return null;}
}

export function redditNodeLabels(node){
  const options=[node.text,node.name,node.label,node.ariaLabel,node.aria_label,
    node.accessibleName,node.innerText,node.title,node.description,
    node.parent?.text,node.parent?.name,node.context?.text,node.value?.text];
  return [...new Set(options.filter(x=>typeof x==="string").map(x=>x.replace(/\s+/g," ").trim())
    .filter(x=>x.length>=2))].slice(0,8);
}

export const SELLER = /^(?:\[(?:for\s*hire|available|offering)\]|\b(?:for hire|available for hire|hire me)\b)/i;

export const BUYER = /\b(?:hiring|looking (?:for|to hire)|need(?:ing)?\s+(?:a|an|someone|help|developer|engineer|programmer)|seeking|wanted|contractor|freelancer|paid project|build (?:me|us)|developer needed|who can build|willing to pay|pay someone|anyone available|hire (?:a|an|someone)|outsource)\b/i;

export const PAIN = /\b(?:how (?:do i|can i|to)|can(?:not|\x27t) (?:get|connect|build|automate|scrape|sync|fix)|struggling (?:with|to)|need to automate|broken (?:api|integration|workflow|script)|manual process|need advice (?:on|about)|stuck (?:with|on)|looking for (?:a solution|an alternative)|not working|keeps? (?:failing|breaking)|unable to (?:connect|integrate|automate|sync)|trying to (?:automate|integrate|connect|sync)|problem with (?:api|workflow|integration)|spending hours on|takes too (?:long|much time)|keep(?:s)? (?:getting|having) (?:errors?|issues?)|my (?:store|business|crm|app|website|workflow|api) (?:is|keeps|won't|doesn't)|need (?:a|an|to|help)|i'm building|we're building)\b/i;

export const ACTIONABLE = /\b(?:checkout failure|duplicate transactions|failed payments?|unresolved business issue|operational blocker|production failure|client follow.?up|lead capture|missed leads|customer support|customer onboarding|inventory|stock sync|order sync|supplier stock|manual (?:report|task|entry|process|work)|spreadsheet|payment processing|webhook|data migration|data (?:export|import|extract)|email routing|reporting dashboard|dashboard|sync(?:ing)? (?:data|orders|stock|leads)|api (?:error|issue|integration)|workflow (?:error|fail|broken)|sales pipeline)\b/i;

export const TECH = /\b(?:checkout|booking|payments?|authentication|auth|oauth|developer|develop|engineer|programming|backend|frontend|full.stack|api|integrat\w*|automat\w*|web.?app|mobile app|bot|software|script|webhook|data extract\w*|database|inventory|sync|server|tool|system|platform|product|customer|business process)\b/i;

export function extract(page,created) {
  const text=String(page.bodyText||"");
  const access=redditAccessCheck(page);
  if(access.blocked)return {...access,items:[],stats:{postLinks:0,titles:0}};
  const list=Array.isArray(page.nodes)?page.nodes:
    Array.isArray(page.nodes?.items)?page.nodes.items.map(x=>x.value):[];
  const postMap=new Map();
  let matchedAnchors=0,emptyLabels=0;
  for(const node of list){
    if(!node||typeof node!=="object")continue;
    const link=redditPostLink(node);if(!link)continue;
    matchedAnchors++;
    const labels=redditNodeLabels(node);
    if(!postMap.has(link.id))postMap.set(link.id,{id:link.id,sub:link.sub,texts:[]});
    if(!labels.length)emptyLabels++;
    const post=postMap.get(link.id);
    for(const value of labels){
      if(!post.texts.includes(value))post.texts.push(value.slice(0,2100));
    }
  }
  const items=[];
  const stats={domNodes:list.length,matchedAnchors,emptyLabels,postLinks:postMap.size,
    titleMissing:0,irrelevant:0,nonTechnical:0,
    titles:0,buyers:0,techBuyers:0,ageFound:0,fresh:0,direct:0,problem:0};
  for(const p of postMap.values()) {
    const clean=x=>String(x||"").split(/\n/)[0].trim();
    const title=p.texts.map(clean).find(x=>x.length>=12&&x.length<=220&&
      !/^(?:\d+ comments?|\d+ (?:votes?|points?|replies)|comments?|share|save|upvote|downvote|replies|r\/|u\/|open post|view discussion)/i.test(x));
    if(!title){stats.titleMissing++;continue}
    if(SELLER.test(title)){stats.irrelevant++;continue}
    stats.titles++;
    const description=p.texts.reduce((a,b)=>a.length>b.length?a:b,"");
    const content=title+" "+description;
    const direct=BUYER.test(title)||BUYER.test(description);
    // A real operational obstacle is a prospect even when the author never
    // mentions hiring or budget. AI checks context later.
    const problem=PAIN.test(title)||PAIN.test(description)||
      ((ACTIONABLE.test(content)||matchesLeadProfile(content))&&/\b(?:i|my|we|our|customers?|clients?|business)\b/i.test(content));
    if(!direct&&!problem){stats.irrelevant++;continue}
    stats.buyers++;
    if(!TECH.test(content)&&!matchesLeadProfile(content)){stats.nonTechnical++;continue}
    stats.techBuyers++;
    const index=text.toLowerCase().indexOf(title.toLowerCase().slice(0,48));
    const near=index>=0?text.slice(Math.max(0,index-130),index+260):"";
    const ages=[...near.matchAll(/(\d+)\s*(min(?:ute)?s?|m|hr|hours?|h|days?|d|weeks?|w|months?|mo)\.?\s+ago\b/gi)];
    let timestamp=null;
    if(ages.length){
      stats.ageFound++;
      const pivot=index-Math.max(0,index-130);
      const closest=ages.sort((a,b)=>Math.abs(a.index-pivot)-Math.abs(b.index-pivot))[0];
      const n=Number(closest[1]),unit=closest[2].toLowerCase();
      if(unit.startsWith("w")||unit.startsWith("mo")||unit.startsWith("d"))continue;
      const minutes=n*(unit.startsWith("h")?60:1);
      if(minutes<0||minutes>1439)continue;
      timestamp=new Date(new Date(created).getTime()-minutes*60000);
    }else if(!page.searchHasDayFilter){
      // /new feeds often omit age in the accessibility DOM. Keep these
      // leads for AI prospect review but mark publication time unknown.
      // No age-based "fresh low competition" claims may be made.
      stats.unknownAge=(stats.unknownAge||0)+1;
    }
    stats.fresh++;
    if(direct)stats.direct++;else stats.problem++;
    items.push({url:"https://www.reddit.com/r/"+p.sub+"/comments/"+p.id+"/",
      source:"Reddit r/"+p.sub,company:"Reddit r/"+p.sub,title:title.slice(0,220),
      description:description.slice(0,2100),intent:direct?"direct":"problem",
      published_at:timestamp?.toISOString()||null,discovered_at:created});
    if(items.length>=18)break;
  }
  // Reddit itself suggests related communities on search-result pages,
  // including when a precise query has no matches. Only public names.
  const section=page.searchHasDayFilter ? (text.split(/\nCOMMUNITIES\n/i)[1]||"").split(/\nPROFILES\n/i)[0] : "";
  const suggestedSubs=[...new Set([...section.matchAll(/(?:^|\n)r\/([a-zA-Z0-9_]{2,32})(?=\n|\s)/g)].map(x=>x[1]))].slice(0,8);
  return {blocked:false,items,stats,suggestedSubs};
}
