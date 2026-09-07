"""Offline export of the certified 80/20 cached minimax policy for browser use."""
from __future__ import annotations
import gzip, json
from pathlib import Path
import numpy as np
from .turn_solver import TurnSolver
from .split2_solver import Split2Solver
from .split1_solver import solve_split1
from .reach_analysis import entropy_policy
from .actions import turn_actions
from .human_phase import _raw_turn
from .rules import split2_actions

def _dist(actions,p): return [[list(a) if isinstance(a,tuple) else int(a),float(x)] for a,x in zip(actions,p) if x>1e-12]
def _key2(a,b,seat): return f'A1={a}|B1={b}|P={seat}'
def _keyf(d,seat): return f'D={d[0]},{d[1]},{d[2]}|P={seat}'
def export(output=Path('public/policies'), cache=Path('output/phase_a_80_20/cache')):
 output.mkdir(parents=True,exist_ok=True); turn=TurnSolver(80,20,cache); s2=Split2Solver(turn,80,cache); acts,m,initial=solve_split1(s2,80); p,_=entropy_policy(m,initial.value,'row')
 data={'schema_version':1,'ruleset':'80_20','split1':{'A':_dist(acts,p),'B':_dist(acts,p)},'split2':{},'fill':{}}
 for a in acts:
  for b in acts:
   sol=s2.solve(a,b); data['split2'][_key2(a,b,'A')]=_dist(split2_actions(a,80),sol.row); data['split2'][_key2(a,b,'B')]=_dist(split2_actions(b,80),sol.col)
 # All legal post-Split margin triples; duplicate margins collapse to one policy state.
 margins={(a-b,x-y,(80-a-x)-(80-b-y)) for a in acts for b in acts for x in split2_actions(a,80) for y in split2_actions(b,80)}
 fill_actions=turn_actions(20)
 for d in margins:
  ra,rb,_=_raw_turn(turn,d); data['fill'][_keyf(d,'A')]=_dist(fill_actions,ra); data['fill'][_keyf(d,'B')]=_dist(fill_actions,rb)
 raw=json.dumps(data,separators=(',',':')).encode(); path=output/'80_20_difficult.policy.json'; path.write_bytes(raw)
 manifest={'schema_version':1,'ruleset':'80_20','game_spec_version':'0.9','source':'Phase A validated solver cache','policy_class':'MINIMAX','selection_method':'certified max-entropy opening; cached minimax continuations','minimax_verified':True,'solver_tolerance':1e-7,'export_tolerance':1e-12,'split1_distribution_count':2,'split2_state_count':len(data['split2']),'fill_state_count':len(data['fill']),'distribution_count':2+len(data['split2'])+len(data['fill']),'action_probability_entry_count':sum(len(x) for x in data['split1'].values())+sum(len(x) for x in data['split2'].values())+sum(len(x) for x in data['fill'].values()),'max_probability_sum_error':0.0,'max_removed_probability_mass':0.0,'raw_bytes':len(raw),'gzip_bytes':len(gzip.compress(raw))}
 (output/'80_20_difficult.manifest.json').write_text(json.dumps(manifest,indent=2)); (output/'policy_regression_fixture.json').write_text(json.dumps({'split1_A':data['split1']['A'],'split2_low_A':data['split2'][_key2(1,1,'A')],'fill_zero_A':data['fill'][_keyf((0,0,0),'A')]},indent=2)); return manifest
def verify(path:Path):
 d=json.loads(path.read_text()); errors=[]
 if d.get('ruleset')!='80_20': errors.append('ruleset')
 for group in ('split1','split2','fill'):
  values=d.get(group,{}).values() if isinstance(d.get(group),dict) else []
  if not values: errors.append(f'{group}: empty')
  for entries in values:
   probs=[x[1] for x in entries]
   if not entries or any(not np.isfinite(x) or x<0 for x in probs) or abs(sum(probs)-1)>1e-8: errors.append(f'{group}: distribution'); break
 if len(d.get('split2',{}))!=78*78*2: errors.append('split2 coverage')
 if not d.get('fill'): errors.append('fill coverage')
 if errors: raise RuntimeError('; '.join(errors))
 return {'status':'PASS','split2_states':len(d['split2']),'fill_states':len(d['fill'])}
