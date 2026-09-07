"""Reproducible human-like/perturbation Phase-A Monte Carlo analysis."""
from __future__ import annotations
import json, math
from pathlib import Path
import numpy as np
import pandas as pd
from .turn_solver import TurnSolver
from .split2_solver import Split2Solver
from .split1_solver import solve_split1
from .reach_analysis import entropy_policy, split2_matrix
from .actions import turn_actions
from .canonical import canonicalize_turn_state
from .payoff import turn_payoff_matrix
from .rules import payoff_from_margins

SEED=802021; N=100; BANDS=(.005,.01,.02,.05); TEMPERATURE=.01
def _norm(x): x=np.maximum(x,0); return x/x.sum()
def _pick(rng,p): return int(rng.choice(len(p),p=_norm(p)))
def _soft(scores,best,temp=TEMPERATURE):
    z=np.exp(np.clip((scores-best)/temp,-700,0)); return _norm(z)
def _raw_turn(turn,d):
    c=canonicalize_turn_state(d); s=turn.solve_canonical(c.state); r,q=s.row,s.col
    if c.player_swapped:r,q=q,r
    acts=np.asarray(turn_actions(turn.turn)); amap={tuple(a):i for i,a in enumerate(acts)}; inv=np.argsort(c.permutation); ix=np.array([amap[tuple(a[inv])] for a in acts]); rr=np.zeros_like(r); qq=np.zeros_like(q); rr[ix]=r; qq[ix]=q
    return rr,qq,turn_payoff_matrix(d,turn.turn)
def _perturb_scalar(rng,x,lo,hi,k):
    choices=[z for z in (x-k,x+k) if lo<=z<=hi]; return int(rng.choice(choices)) if choices else x
def _perturb_turn(rng,a,k):
    a=a.copy(); donors=np.flatnonzero(a>=k)
    if len(donors)==0:return a
    i=int(rng.choice(donors)); rec=int(rng.choice([x for x in range(3) if x!=i])); a[i]-=k; a[rec]+=k; return a
def simulate(kind,band=None,perturb=(0,0.),seed=SEED,n=N):
    rng=np.random.default_rng(seed); turn=TurnSolver(cache_dir=Path('output')/'cache'); s2=Split2Solver(turn,cache_dir=Path('output')/'cache'); acts=np.arange(1,79); _,m,init=solve_split1(s2); exact,_=entropy_policy(m,init.value,'row')
    policy_cache={}; wdl=np.zeros(3); lead=np.zeros(3); full=outcome=match_change=decisive=0
    def pol_open():
      if kind=='exact':return exact
      scores=m@exact; allowed=scores>=init.value-band-1e-8
      return _norm(allowed.astype(float)) if kind=='uniform' else _soft(np.where(allowed,scores,-np.inf),init.value)
    op=pol_open()
    for _ in range(n):
      ia=_pick(rng,op); ib=_pick(rng,op); a1,b1=int(acts[ia]),int(acts[ib])
      if perturb[0] and rng.random()<perturb[1]: a1=_perturb_scalar(rng,a1,1,78,perturb[0])
      if perturb[0] and rng.random()<perturb[1]: b1=_perturb_scalar(rng,b1,1,78,perturb[0])
      key=(a1,b1,kind,band); 
      if key not in policy_cache:
        aa,bb,sm=split2_matrix(turn,a1,b1); sol=s2.solve(a1,b1); ra,cb=sol.row,sol.col
        if kind!='exact':
          rs=sm@cb; cs=-(ra@sm); ra=_norm((rs>=sol.value-band-1e-8).astype(float)) if kind=='uniform' else _soft(np.where(rs>=sol.value-band-1e-8,rs,-np.inf),sol.value)
          cb=_norm((cs>=-sol.value-band-1e-8).astype(float)) if kind=='uniform' else _soft(np.where(cs>=-sol.value-band-1e-8,cs,-np.inf),-sol.value)
        policy_cache[key]=(aa,bb,ra,cb)
      aa,bb,pa,pb=policy_cache[key]; a2=aa[_pick(rng,pa)]; b2=bb[_pick(rng,pb)]
      d=(a1-b1,a2-b2,b1+b2-a1-a2); rr,cc,tm=_raw_turn(turn,d); 
      if kind!='exact':
        rs=tm@cc; cs=-(rr@tm); val=float(np.min(rr@tm)); rr=_norm((rs>=val-band-1e-8).astype(float)) if kind=='uniform' else _soft(np.where(rs>=val-band-1e-8,rs,-np.inf),val); cc=_norm((cs>=-val-band-1e-8).astype(float)) if kind=='uniform' else _soft(np.where(cs>=-val-band-1e-8,cs,-np.inf),-val)
      ta=np.array(turn_actions()[_pick(rng,rr)]); tb=np.array(turn_actions()[_pick(rng,cc)])
      if perturb[0] and rng.random()<perturb[1]:ta=_perturb_turn(rng,ta,perturb[0])
      if perturb[0] and rng.random()<perturb[1]:tb=_perturb_turn(rng,tb,perturb[0])
      f=np.array(d)+ta-tb; result=payoff_from_margins(tuple(map(int,f))); wdl[{1:0,0:1,-1:2}[result]]+=1
      signs=np.sign(d); side=1 if (signs>0).sum()>(signs<0).sum() else (-1 if (signs<0).sum()>(signs>0).sum() else 0)
      if side==1:lead[{1:0,0:1,-1:2}[result]]+=1
      elif side==-1:lead[{-1:0,0:1,1:2}[result]]+=1
      full+=np.any(np.sign(d)*np.sign(f)==-1); outcome+=np.any(np.sign(d)!=np.sign(f)); prov=payoff_from_margins(d); match_change+=result!=prov; decisive+=prov*result==-1
    wdl/=n; den=lead.sum(); return {"win_rate":wdl[0],"draw_rate":wdl[1],"loss_rate":wdl[2],"hold_rate":lead[0]/den,"leader_to_draw_rate":lead[1]/den,"flip_rate":lead[2]/den,"any_manche_flip_rate":full/n,"any_manche_outcome_change_rate":outcome/n,"match_outcome_change_rate":match_change/n,"decisive_match_flip_rate":decisive/n,"sample_size":n,"seed":seed,"draw_standard_error":math.sqrt(wdl[1]*(1-wdl[1])/n)}
def run(output=Path('output')):
 out=output/'phase_a_80_20'; rows=[]
 for b in BANDS:
  for kind in ('uniform','softmax'): rows.append({"profile":f"Q{int(b*1000):03d}_{kind}","profile_type":"HUMAN-LIKE / NEAR-OPTIMAL","exact_or_simulated":"MONTE-CARLO",**simulate(kind,b,seed=SEED+len(rows))})
 for k,p in ((1,.1),(1,.25),(2,.1),(2,.25)):
  rows.append({"profile":f"perturb_{k}_{int(p*100)}","profile_type":"PERTURBED EXACT","exact_or_simulated":"MONTE-CARLO",**simulate('exact',perturb=(k,p),seed=SEED+len(rows))})
 df=pd.DataFrame(rows); df.to_csv(out/'near_optimal_matchups.csv',index=False); df[df.profile.str.startswith('perturb')].to_csv(out/'perturbation_results.csv',index=False)
 base=pd.read_csv(out/'exact_equilibrium_robustness.csv').iloc[1]; exact={"profile":"exact_max_entropy","profile_type":"EXACT","exact_or_simulated":"EXACT-PROPAGATED","win_rate":base.win_rate,"draw_rate":base.draw_rate,"loss_rate":base.loss_rate,"hold_rate":base.hold_rate,"leader_to_draw_rate":base.leader_to_draw_rate,"flip_rate":base.flip_rate,"any_manche_flip_rate":np.nan,"match_outcome_change_rate":np.nan,"sample_size":0,"seed":SEED}; pd.concat([pd.DataFrame([exact]),df],ignore_index=True).to_csv(out/'human_like_draw_comparison.csv',index=False)
 (out/'near_optimal_policy_definitions.json').write_text(json.dumps({"bands":list(BANDS),"uniform":"equal weight over actions within statewise regret band","softmax_temperature":TEMPERATURE,"seed":SEED,"label":"HUMAN-LIKE / NEAR-OPTIMAL, not Nash"},indent=2),encoding='utf-8')
 (out/'perturbation_definitions.json').write_text(json.dumps({"seed":SEED,"scalar":"unbiased legal ±k","turn":"move k units from random legal donor to random recipient","levels":[[1,.1],[1,.25],[2,.1],[2,.25]]},indent=2),encoding='utf-8')
 return df
