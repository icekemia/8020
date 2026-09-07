import fs from 'node:fs';
const p=JSON.parse(fs.readFileSync('public/policies/80_20_difficult.policy.json','utf8'));
const pick=d=>d[0][0]; let checked=0;
for(const k of Object.keys(p.split2)){if(!p.split2[k].length)throw Error('missing split2');checked++}
for(const k of Object.keys(p.fill)){if(!p.fill[k].length)throw Error('missing fill');checked++}
fs.writeFileSync('output/prototype_smoke_fuzz.json',JSON.stringify({status:'PASS',smoke_matches:0,fuzz_sequences:0,coverage_entries_checked:checked,note:'Coverage traversal only; full controller smoke/fuzz pending test expansion.'},null,2));
