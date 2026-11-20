import {strict as assert} from "node:assert";
import {readFileSync} from "node:fs";
import {freelanceUaFirstPass} from "../src/features/discovery/freelance-ua-filter.js";
const items=JSON.parse(readFileSync("tests/fixtures/freelance-ua-sample.json","utf8"));
const config={jobs:{profile:{skills:["POS","WordPress","Telegram"],provenExperience:[]},criteria:{includeKeywords:[],preferredRoles:[]},browserSources:{dou:{targets:[]}}}};
const relevant=item=>freelanceUaFirstPass(item,config);
console.log("RSS sample",items.length,"selected",items.filter(relevant).length);
for(const x of items.filter(relevant).slice(0,12))console.log(x.title.slice(0,110));

const viable=items.filter(relevant);
assert(viable.length>=3,"only projects matching the injected profile should pass");
assert(viable.some(x=>x.title.includes("POS-програм")));
assert(viable.some(x=>x.title.includes("WordPress")));
assert(viable.some(x=>x.title.includes("Telegram-бот")));
assert(!freelanceUaFirstPass({title:"Looking for a business partner",description:"I am looking for a business partner to invest in my project and build a network. This is a partnership not a paid contract."}));
assert(!freelanceUaFirstPass({title:"Зробити Telegram бота",description:"Потрібно сплатити депозит для початку роботи, а потім налаштувати telegram webhook у CRM платформі замовника."}));
console.log("PASS configured-profile project matching and anti-scam filters");
