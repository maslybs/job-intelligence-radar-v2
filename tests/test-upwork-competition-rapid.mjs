import {upworkCompetitionDecision} from '../src/integrations/upwork/upwork-competition.js';
const now=Date.parse('2026-10-21T18:40:26Z');
const obj={published_at:'2026-10-21T18:15:47Z',first_seen_at:'2026-10-21T18:32:58Z',last_seen_at:'2026-10-21T18:32:58Z',first_upper:50,last_upper:50,samples:1};
for(const [name,o,date,expected] of [
 ['actual',obj,now,false],
 ['three_hours_later',obj,now+10800000,false],
 ['low_but_too_new',{...obj,first_upper:10,last_upper:10},now,false],
 ['unknown',{...obj,first_upper:999,last_upper:999},now,false],
 ['fifty_plus',{...obj,first_upper:1000,last_upper:1000},now,false]
]){
 const x=upworkCompetitionDecision(o,date);
 console.log(name,x.reason,x.eligible);
 if(x.eligible!==expected)process.exitCode=1;
}
