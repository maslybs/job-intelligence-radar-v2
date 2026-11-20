import {RADAR_SETTINGS} from "../src/config/radar.generated.js";
import {normalizeCommercialResult,commercialLeadIsSendable,commercialIntentLabel} from '../src/features/prospects/prospect-commercial.js';
const active=structuredClone(RADAR_SETTINGS);
active.leads.enabled=true;
active.leads.criteria.minCommercialScore=65;
active.leads.criteria.minTechnicalFit=70;
const tests=[
 ['Splunk knowledge-only',{category:'business_problem',fit:94,business_signal:1,commercial_intent:'knowledge_only',commercial_score:15,buyer_evidence_uk:'Experienced developer asks which permissions a service account needs.'},false],
 ['n8n paid audit',{category:'paid_request',fit:92,business_signal:1,commercial_intent:'paid_request',commercial_score:96,buyer_evidence_uk:'Автор прямо погоджується оплатити незалежний аудит платформи і допомогу із завершенням продукту.'},true],
 ['Shopify n8n hiring',{category:'paid_request',fit:88,business_signal:1,commercial_intent:'paid_request',commercial_score:94,buyer_evidence_uk:'Автор запрошує спеціаліста на платний тест і чітко визначає обсяг та оплату.'},true],
 ['Retool ordinary question',{category:'business_problem',fit:90,business_signal:1,commercial_intent:'knowledge_only',commercial_score:28,buyer_evidence_uk:'Команда питає як налаштувати інтеграцію, але не пропонує роботи або підряду.'},false],
 ['launch blocked with no hire stated',{category:'business_problem',fit:91,business_signal:1,commercial_intent:'commercial_blocker',commercial_score:92,buyer_evidence_uk:'Компанія не може запустити продукт для клієнтів, роками не може завершити критичну інтеграцію.'},true],
 ['ordinary company error',{category:'business_problem',fit:99,business_signal:1,commercial_intent:'commercial_blocker',commercial_score:46,buyer_evidence_uk:'Співробітник просить пораду щодо помилки API і самостійно проводить діагностику.'},false],
 ['missing evidence',{category:'paid_request',fit:97,business_signal:1,commercial_intent:'paid_request',commercial_score:100,buyer_evidence_uk:'too vague'},false],
 ['irrelevant tech',{category:'paid_request',fit:22,business_signal:1,commercial_intent:'paid_request',commercial_score:100,buyer_evidence_uk:'Автор шукає оплачуваного розробника для іншого технологічного напрямку.'},false]
];
let failures=0;
for(const [name,info,expected] of tests){
 const x=normalizeCommercialResult(info);
 const actual=commercialLeadIsSendable({...info,...x},active);
 if(!RADAR_SETTINGS.leads.enabled && commercialLeadIsSendable({...info,...x},RADAR_SETTINGS)!==false)failures++;
 console.log(name,actual===expected?'PASS':'FAIL',actual);
 if(actual!==expected)failures++;
}
if(failures)process.exit(1);
