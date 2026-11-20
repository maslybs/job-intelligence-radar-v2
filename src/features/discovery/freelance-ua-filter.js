import {RADAR_SETTINGS} from "../../config/radar.generated.js";
import {matchesJobProfile} from "../../platform/profile-matching.js";
// Freelance.ua public programming projects are Ukrainian/Russian and often
// describe concrete outcomes instead of English technology-keyword lists.
export function freelanceUaFirstPass(x,settings=RADAR_SETTINGS){
 const title=String(x.title||""),description=String(x.description||"");
 if(title.length<16||description.length<125)return false;
 const body=(title+" "+description).slice(0,3200);
 if(/(?:сплат[иі]ть|оплатите|pay).{0,70}(?:депозит|залог|застав|activation fee|processing fee)|(?:знайти|найти)\s+(?:партнер|инвестор)|(?:ищу|шукаю)\s+(?:business partner|партнер)/i.test(body))return false;
 if(/(?:взлом|взлам|зламати|обойти блокировку|обхід блокування)/i.test(body))return false;
 const action=/(?:розроб|розробк|доопрац|дороб|створити|створення|написати|зробити|запустити|розширити|автоматиз|інтеграц|синхроніз|підключ|модифікац|разработ|доработ|создат|написать|настроить|подключить|нужен специалист|потрібн.{0,12}(?:програміст|розробник)|шукаю.{0,22}(?:програміст|розробник)|ищу.{0,22}(?:разработчик|программист))/i.test(title);
  const tech=matchesJobProfile(body,settings);
 return action&&tech;
}
