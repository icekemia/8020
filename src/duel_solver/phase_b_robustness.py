from __future__ import annotations
import json
from pathlib import Path
import numpy as np
import pandas as pd
from .exact_phase_profiles import Profile
from .phase_a import _polytope_policy
from .propagation import propagate

def run_ratio(split,turn,root=Path('output')):
 out=root/'phase_b_ratio_sweep'/f'{split}_{turn}'; target=out/'exact_equilibrium_robustness.csv'
 if target.exists(): return
 p=Profile(out,'exact',split=split,turn_units=turn,cache_root=(root/'phase_a_80_20' if (split,turn)==(80,20) else None))
 policies=[('E0_BASIC',p.init.row),('E1_MAX_ENTROPY',p.exact)]; rng=np.random.default_rng(802020+split)
 for i in range(20):
  q,_=_polytope_policy(p.m,rng.normal(size=len(p.acts)),p.init.value)
  if all(np.max(np.abs(q,z))>1e-5 for _,z in policies): policies.append((f'E{len(policies)}_VERTEX_{i}',q))
  if len(policies)>=5: break
 rows=[]
 for name,q in policies:
  r=propagate(split,turn,q,q,p.split2,p.turn_policy)
  rows.append({'ratio':f'{split}/{turn}','profile':name,'calculation_method':'EXACT_PROPAGATED','win_rate':r.wdl[0],'draw_rate':r.wdl[1],'loss_rate':r.wdl[2],**r.metrics})
 pd.DataFrame(rows).to_csv(target,index=False)
 (out/'robustness_checkpoint.json').write_text(json.dumps({'profiles_found':len(rows),'status':'COMPLETE'},indent=2))
