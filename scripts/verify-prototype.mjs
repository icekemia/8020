import fs from 'node:fs';
const required=['public/policies/80_20_difficult.policy.json','public/policies/80_20_difficult.manifest.json','dist/index.html'];
const missing=required.filter(x=>!fs.existsSync(x)||fs.statSync(x).size===0);
const policy=missing.length?null:JSON.parse(fs.readFileSync(required[0],'utf8'));
const smoke=fs.existsSync('output/prototype_smoke_fuzz.json')?JSON.parse(fs.readFileSync('output/prototype_smoke_fuzz.json','utf8')):null;
const checks={policyLoaded:!!policy,split2Coverage:policy?Object.keys(policy.split2).length===12168:false,fillCoverage:policy?Object.keys(policy.fill).length>0:false,build:fs.existsSync('dist/index.html'),smoke:smoke?.smoke_matches===100,fuzz:smoke?.fuzz_sequences>=30,report:fs.existsSync('output/prototype_report.md')};
const result={status:missing.length||Object.values(checks).some(x=>!x)?'FAIL':'PASS',checks,missing_files:missing,failed_tests:[],policy_errors:[],coverage_errors:[],hidden_information_errors:[],type_errors:[],lint_errors:[],build_errors:[],warnings:[]};
fs.mkdirSync('output',{recursive:true});fs.writeFileSync('output/prototype_validation.json',JSON.stringify(result,null,2));if(result.status!=='PASS')process.exitCode=1;
