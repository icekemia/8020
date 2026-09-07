"""Ratio-generic Phase-B exact sweep (checkpointed per configuration)."""
from __future__ import annotations
import json, time
from pathlib import Path
import numpy as np
import pandas as pd
from .actions import turn_actions
from .exact_phase_profiles import Profile
from .propagation import propagate
from .analysis import stats

RATIOS=((75,25),(78,22),(80,20),(82,18),(85,15))
PROFILES=(("EXACT_MAX_ENTROPY","exact",0.,None),("Q005_UNIFORM","uniform",.005,None),("Q02_UNIFORM","uniform",.02,None),("P1_25","exact",0.,(1,.25)))

def _path_metrics(split, opening, s2):
    x=[]
    from .rules import split2_actions
    for a,pa in enumerate(opening,1):
      for b,pb in enumerate(opening,1):
       ra,cb=s2(a,b)
       for i,a2 in enumerate(split2_actions(a,split)):
        for j,b2 in enumerate(split2_actions(b,split)):
         q=pa*pb*ra[i]*cb[j]
         if q: x.append(q)
    z=np.sort(np.asarray(x))[::-1]; h=float(-(z*np.log(z)).sum())
    return {"split_path_entropy":h,"split_effective_paths":float(np.exp(h)),"top_10_split_paths":z[:10].sum(),"top_25_split_paths":z[:25].sum(),"top_50_split_paths":z[:50].sum()}

def run_ratio(split,turn,root=Path("output")):
    name=f"{split}_{turn}"; out=root/"phase_b_ratio_sweep"/name; out.mkdir(parents=True,exist_ok=True)
    checkpoint=out/"ratio_checkpoint.json"
    if checkpoint.exists(): return json.loads(checkpoint.read_text())
    started=time.time(); rows=[]
    for label,kind,band,perturb in PROFILES:
      # 80/20 is Phase-A regression: use its authoritative solved-game cache,
      # while independently propagating Phase-B's standard metrics.
      cache_root=root/"phase_a_80_20" if (split,turn)==(80,20) else None
      p=Profile(out,kind,band,perturb,split,turn,cache_root=cache_root)
      r=propagate(split,turn,p.opening(),p.opening(),p.split2,p.turn_policy,lambda stage,i,n: print(f"{name} {label} {stage} {i}/{n} {i/n:.0%}",flush=True))
      probs=np.sort(np.fromiter(r.turn_reach.values(),float))[::-1]
      rows.append({"ratio":f"{split}/{turn}","split":split,"turn":turn,"profile":label,"calculation_method":"EXACT_PROPAGATED","initial_value":p.init.value,"win_rate":r.wdl[0],"draw_rate":r.wdl[1],"loss_rate":r.wdl[2],"turn_action_count":len(turn_actions(turn)),"turn_reached_states":len(r.turn_reach),"turn_top10_concentration":probs[:10].sum(),"turn_top20_concentration":probs[:20].sum(),"turn_top50_concentration":probs[:50].sum(),"turn_top100_concentration":probs[:100].sum(),**r.metrics,**_path_metrics(split,p.opening(),p.split2)})
      if label=="EXACT_MAX_ENTROPY":
       rows[-1].update(p.entropy_refinement)
       rows[-1].update({f"opening_{k}":v for k,v in stats(p.opening()).items()}); values=p.m@p.exact
       rows[-1].update({"near_optimal_actions_005":int((values>=p.init.value-.005-1e-8).sum()),"near_optimal_actions_01":int((values>=p.init.value-.01-1e-8).sum()),"near_optimal_actions_02":int((values>=p.init.value-.02-1e-8).sum()),"near_optimal_actions_05":int((values>=p.init.value-.05-1e-8).sum())})
    df=pd.DataFrame(rows); df.to_csv(out/"profile_metrics.csv",index=False)
    meta={"ratio":f"{split}/{turn}","runtime_seconds":time.time()-started,"initial_value":float(rows[0]["initial_value"]),"turn_action_count":len(turn_actions(turn)),"status":"COMPLETE"}; checkpoint.write_text(json.dumps(meta,indent=2)); return meta

def run(root=Path("output")):
    results=[run_ratio(s,t,root) for s,t in RATIOS]
    from .phase_b_aggregate import run as aggregate
    aggregate(root)
    return results
