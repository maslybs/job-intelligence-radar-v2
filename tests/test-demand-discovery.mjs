import {RADAR_SETTINGS} from "../src/config/radar.generated.js";
import {strict as assert} from "node:assert";
import {rankDemand,chooseDemand,renderDemandDigest} from "../src/features/prospects/demand-discovery.js";
const base={
 id:"01",source:"Reddit r/SaaS",title:"Our LLM bill tripled in 6 months",
 url:"https://www.reddit.com/r/SaaS/comments/1xcecv5/",
 category:"business_problem",business_signal:1,commercial_intent:"commercial_blocker",
 commercial_score:65,fit:91,geo:"unknown",kind:"unclear",
 problem_uk:"Витрати на LLM для B2B-бота зростають швидше за дохід.",
 solution_uk:"Виміряти вартість запитів, маршрутизувати моделі та оптимізувати токени.",
 reply_uk:"Запропонувати спосіб порахувати частку витрат за типами запитів.",
 discovered_at:"2026-10-22T18:00:00Z",review_status:"credible",review_competition:"low",
 original_post_observed:1,comments_verified:1,self_promotion:0,comments_observed:2,
 business_owner_evidence_uk:"Автор керує B2B підтримкою клієнтів із платними підписками та внутрішніми агентами.",
 unresolved_gap_uk:"Коментарі не розв'язали проблему високої вартості токенів у production.",
 community_status:null
};
assert(rankDemand(base),"verified business problem accepted without hiring phrase or budget");
assert(rankDemand({...base,review_status:null})===null,"unreviewed Reddit must NOT be sent");
assert(rankDemand({...base,review_status:"inconclusive"})===null,"incomplete comments blocked");
assert(rankDemand({...base,comments_verified:0})===null,"unread comments blocked");
assert(rankDemand({...base,original_post_observed:0})===null,"headline-only blocked");
assert(rankDemand({...base,self_promotion:1})===null,"seller even when AI mislabels blocked");
assert(rankDemand({...base,business_owner_evidence_uk:""})===null,"no business connection blocked");
assert(rankDemand({...base,unresolved_gap_uk:""})===null,"no unresolved gap blocked");
assert(rankDemand({...base,commercial_score:30})===null,"weak demand rejected");
assert(rankDemand({...base,fit:55})===null,"weak fit rejected");
assert(rankDemand({...base,category:"learning"})===null,"tutorial rejected");
assert(rankDemand({...base,review_status:"resolved"})===null,"resolved problem rejected");
assert(rankDemand({...base,community_status:"answered"})===null,"answered community rejected");
assert(rankDemand({...base,kind:"seller"})===null,"seller rejected");
assert(rankDemand({...base,url:"http://example.com/test"})===null,"insecure url rejected");
assert(rankDemand({...base,commercial_intent:"knowledge_only"})===null,"plain question rejected");
assert(rankDemand({...base,commercial_intent:"seeking_contractor",commercial_score:60}),"explicit external help accepted");
const candidates=[
 base,
 {...base,id:"02",source:"Reddit r/SaaS",title:"B2B launch blocked by failing API",url:"https://www.reddit.com/r/SaaS/comments/another/"},
 {...base,id:"03",source:"Reddit r/SaaS",title:"Our business app failed to sync orders",url:"https://www.reddit.com/r/SaaS/comments/third/"},
 {...base,id:"04",source:"Reddit r/smallbusiness",title:"Square integration with our business systems",url:"https://www.reddit.com/r/smallbusiness/comments/square/"},
 {...base,id:"05",source:"Community · Shopify",community_status:"open",title:"Store inventory sync issue",url:"https://community.shopify.com/t/store/123/"},
 {...base,id:"06",source:"Reddit r/woocommerce",title:"Our WooCommerce integrations failed",url:"https://www.reddit.com/r/woocommerce/comments/woo/"},
];
const picked=chooseDemand(candidates,5);
const excludesWp=[...RADAR_SETTINGS.leads.profile.excludedServices,...RADAR_SETTINGS.leads.criteria.excludeKeywords].some(x=>["wordpress","woocommerce"].includes(String(x).trim().toLowerCase()));
assert.equal(picked.length,excludesWp?4:5,"only configured tech exclusions apply");
assert.equal(picked.some(x=>/wordpress|woocommerce/i.test(x.title+" "+x.source)),!excludesWp);
assert.equal(picked.filter(x=>x.source==="Reddit r/SaaS").length,2,"source diversification");
const html=renderDemandDigest(picked,"2026-10-22");
assert(html.includes("потенційні клієнти")&&html.includes("Наявність бюджету"),"truthful header");
assert(html.includes("🔗 Оригінальний допис")&&html.includes("Проблема:"),"actionable");
assert(html.length<3950,"fits Telegram 4096-character limit");
assert(!renderDemandDigest([{...base,title:"<script>alert(1)</script>"}],"2026-10-22").includes("<script>"),"HTML sanitized");
console.log("PASS Demand Discovery: 10 guardrails, source diversification, HTML, compact Telegram digest",html.length);
