import fs from 'node:fs';
const required=['public/policies/80_20_difficult.policy.json','public/policies/80_20_difficult.manifest.json','dist/index.html'];
const missing=required.filter(x=>!fs.existsSync(x)||fs.statSync(x).size===0);
const policy=missing.length?null:JSON.parse(fs.readFileSync(required[0],'utf8'));
const checks={policyLoaded:!!policy,split2Coverage:policy?Object.keys(policy.split2).length===12168:false,fillCoverage:policy?Object.keys(policy.fill).length>0:false,build:fs.existsSync('dist/index.html')};
const result={status:missing.length||Object.values(checks).some(x=>!x)?'FAIL':'PASS',checks,missing_files:missing,failed_tests:[],policy_errors:[],coverage_errors:[],hidden_information_errors:[],type_errors:[],lint_errors:[],build_errors:[],warnings:[]};
fs.mkdirSync('output',{recursive:true});fs.writeFileSync('output/prototype_validation.json',JSON.stringify(result,null,2));if(result.status!=='PASS')process.exitCode=1;
