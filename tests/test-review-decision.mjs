import { strict as assert } from "node:assert";
import { reviewDecision } from "../src/features/jobs/review-decision.js";

// Fixtures intentionally match the deployed Worker, not the obsolete src/index.js.
const now = Date.now();
const base = {
  source: "Freelancehunt · Backend / Web", state: "filtered", kind: "buyer",
  score: 81, geo: "allowed", engagement: "contract",
  published_at: new Date(now - 10 * 3600_000).toISOString(),
  description: "Бюджет: не вказано. Заявок: 32. Історія замовника: 1 завершених проєктів.",
  reason: "Конкретна CRM API інтеграція; бюджет не вказано.",
};
const decide = (overrides = {}) => reviewDecision({ ...base, ...overrides });
assert.ok(decide(), "reviewable contract with disclosed risks");
assert.ok(decide().risks.some(r => r.includes("32")), "competition risk disclosed");
assert.ok(decide({ engagement: "fulltime" }), "current production explicitly allows full-time review");
assert.equal(decide({ source: "Upwork · Low Competition" }), null, "retired Upwork excluded");
assert.equal(decide({ kind: "spam" }), null);
assert.equal(decide({ geo: "unknown" }), null);
assert.equal(decide({ score: 85 }), null, "review score above cutoff");
assert.equal(decide({ score: 69 }), null, "review score below cutoff");
assert.equal(decide({ description: "Бюджет: 20000 UAH. Заявок: 39." }), null);
assert.equal(decide({ description: "Бюджет: 2000 UAH. Заявок: 8." }), null);
assert.equal(decide({ published_at: new Date(now - 80 * 3600_000).toISOString() }), null);
assert.equal(decide({ description: "Бюджет: 9000 UAH. Заявок: 12. 2 негативних відгуків" }), null);
assert.equal(decide({ reason: "Потрібен неоплачуваний тест" }), null);
console.log("PASS review-tier production behavior and risks");
