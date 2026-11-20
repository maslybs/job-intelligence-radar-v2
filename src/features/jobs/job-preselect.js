// Fast, evidence-based vacancy preselection.
// Extracted from the production-compatible Worker without modifying the bodies.
import {RADAR_SETTINGS} from "../../config/radar.generated.js";
import {freelanceForumIsBuyer} from "../discovery/direct-source-verification.js";
import { geoClearlyExcludesApplicant } from "./geography.js";
import {matchesGeneralistOutcome,opportunityTrack} from "./job-strategy.js";

export var REJECT = /\b(?:security clearance|onsite only|on-site only|hybrid only)\b/i;

export var SELLER = /(?:\[for hire\]|\bfor hire\b|\bhire me\b|\blooking for work\b|\bavailable freelancer\b|\boffering my services\b)/i;

export var UNRELATED = RADAR_SETTINGS.search.excludeTechnologies.map(x=>x.trim().toLowerCase());

export var STACK = [...new Set([...RADAR_SETTINGS.profile.skills,...RADAR_SETTINGS.search.includeKeywords,...RADAR_SETTINGS.search.preferredRoles].map(x=>String(x).trim().toLowerCase()).filter(x=>x.length>1))];

const REGEX_META=new Set(["\\","[","]","(",")","{","}","?","*","+","^","$",".","|"]);
export var FH_STACK = new RegExp(STACK.map(term=>[...term].map(char=>REGEX_META.has(char)?"\\"+char:char).join("")).join("|")||"(?!)","gi");

export var FH_SCAM = /(?:сплат[иі]ть.{0,60}(?:застав|депозит|для початку|для доступу)|оплатите.{0,60}(?:депозит|залог|для доступа)|pay.{0,35}(?:deposit|fee).{0,35}(?:apply|start)|(?:для роботи|для начала работы).{0,45}(?:внес[тти]|оплат[иі]ть|заплатить).{0,25}(?:депозит|залог|активац))/i;

export function firstPass(x) {
  const head = x.title.toLowerCase(), body = (head + " " + x.description + " " + x.region).toLowerCase();
  if (String(x.source || "").startsWith("Freelancehunt")) {
    if (FH_SCAM.test(body)) return false;
    const matches = body.match(FH_STACK) || [];
    const titleMatches = x.title.match(FH_STACK) || [];
    const strict=matches.length >= 2 && (titleMatches.length > 0 || matches.length >= 3);
    // Outcome-oriented freelance briefs often name one technology and a
    // concrete business outcome rather than listing a full tech stack.
    // They still require real task context and pass the scam filter above.
    const actionableTitle=/(?:автоматиз|автоматизац|интеграц|інтеграц|синхроніз|синхрониз|розробк|разработк|створит|создат|налаштув|настроит|парс|бот|agent|агент|crm|api|обмін даними|обмен данными)/i.test(x.title);
    const businessContext=/(?:клієнт|клиент|товар|залишк|остатк|склад|заказ|замовлен|облік|учет|заявк|оплат|платеж|постачаль|поставщик|синхрон|інтеграц|интеграц|автоматиз|автоматизац|api|webhook|crm|1с|bas|google sheets|таблиц)/i.test(body);
    return strict || (matches.length>=1 && actionableTitle && businessContext && x.description.length>=140);
  }
  if (geoClearlyExcludesApplicant(x) || SELLER.test(head) || RADAR_SETTINGS.search.remoteOnly && REJECT.test(body)) return false;
  if(RADAR_SETTINGS.search.excludeKeywords.some(x=>head.includes(x.toLowerCase())))return false;
  const outcomeBased=matchesGeneralistOutcome(x);
  if (UNRELATED.some(t=>t && head.includes(t)) && !outcomeBased) return false;
  const explicitHiring=/(?:hiring|hire|need(?:ed)?|seeking|looking for|paid (?:job|project|contract|audit)|help wanted|freelanc|contractor|specialist|consultant|technician)/i.test(head);
  const specialized=/(?:engineer|developer|consultant|technician|architect|contractor|specialist)/i.test(head)||STACK.some(k=>head.includes(k));
  // Forum hiring sections may title offers by the tools involved
  // rather than "Software Engineer" — keep them for AI screening.
  const forumHiring=(RADAR_SETTINGS.jobs.sources.items||[]).some(item=>item.name===x.source&&item.forumHiring===true);
  if(!specialized&&!explicitHiring&&!outcomeBased)return false;
  const skillCount=STACK.filter(k=>body.includes(k)).length;
  return skillCount>=2 || (skillCount>=1&&(specialized||forumHiring&&explicitHiring)) ||
    (outcomeBased && String(x.description||"").length>=90);
}
