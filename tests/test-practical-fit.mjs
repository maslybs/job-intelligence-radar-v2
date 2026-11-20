import assert from "node:assert/strict";
import {practicalFitScore} from "../src/features/jobs/practical-fit.js";
assert.equal(practicalFitScore(99,"high","fulltime"),79);
assert.equal(practicalFitScore(96,"high","unknown"),79);
assert.equal(practicalFitScore(96,"medium","fulltime"),96);
assert.equal(practicalFitScore(89,"high","contract"),89);
assert.equal(practicalFitScore(-3,"low","fulltime"),0);
assert.equal(practicalFitScore(103,"low","fulltime"),100);
console.log("PASS practical fit caps");
