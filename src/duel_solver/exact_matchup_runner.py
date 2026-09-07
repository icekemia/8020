from __future__ import annotations
import json
from pathlib import Path
from .exact_phase_profiles import Profile
from .propagation import propagate
def run(name,b_kind,b_band,b_perturb,output=Path('output')):
 a=Profile(output,kind='exact'); b=Profile(output,kind=b_kind,band=b_band,perturb=b_perturb)
 def s2(x,y): return a.split2(x,y)[0],b.split2(x,y)[1]
 def tr(d): return a.turn_policy(d)[0],b.turn_policy(d)[1]
 def progress(stage,i,n): print(f'{name} {stage} {i}/{n} {100*i/n:.2f}%',flush=True)
 r=propagate(80,20,a.opening(),b.opening(),s2,tr,progress)
 p=output/'phase_a_80_20'/'exact_profile_checkpoints'; p.mkdir(exist_ok=True); (p/f'{name}.json').write_text(json.dumps({'profile':name,'method':'EXACT_PROPAGATED','leaf_mass':r.leaf_mass,'wdl':r.wdl.tolist(),'turn_states':len(r.turn_reach),'metrics':r.metrics},indent=2),encoding='utf-8')
