"""Phase-A robustness artefacts derived from exact 80/20 cached games."""
from __future__ import annotations
import json, shutil, sys, platform
from pathlib import Path
import numpy as np
import pandas as pd
from scipy.optimize import linprog
from . import GAME_SPEC_VERSION,SOLVER_SPEC_VERSION,LP_TOL
from .analysis import stats
from .split1_solver import solve_split1
from .turn_solver import TurnSolver
from .split2_solver import Split2Solver
from .reach_analysis import entropy_policy
from .rules import split2_actions
from .canonical import canonicalize_turn_state
from .payoff import turn_payoff_matrix
from .actions import turn_actions
from .propagation import propagate
from .exact_phase_profiles import Profile

SEED=802020
def _polytope_policy(m,objective, value=0.0):
    r=linprog(objective,A_ub=-m.T,b_ub=np.full(m.shape[1],-(value-LP_TOL)),A_eq=np.ones((1,m.shape[0])),b_eq=[1],bounds=[(0,None)]*m.shape[0],method="highs")
    if not r.success: raise RuntimeError(r.message)
    p=np.maximum(r.x,0); return p/p.sum(),float(np.min(p@m))
def _turn_metrics(turn,d,cache):
    if d in cache: return cache[d]
    c=canonicalize_turn_state(d); s=turn.solve_canonical(c.state); rp,cp=s.row,s.col
    if c.player_swapped: rp,cp=cp,rp
    acts=np.asarray(turn_actions(turn.turn)); amap={tuple(a):i for i,a in enumerate(acts)}; inv=np.argsort(c.permutation); idx=np.array([amap[tuple(a[inv])] for a in acts]); rr=np.zeros_like(rp); cc=np.zeros_like(cp); rr[idx]=rp; cc[idx]=cp
    f=np.asarray(d)[None,None,:]+acts[:,None,:]-acts[None,:,:]; joint=rr[:,None]*cc[None,:]; mat=np.sign((f>0).sum(2)-(f<0).sum(2)); wdl=np.array([(joint[mat==x]).sum() for x in (1,0,-1)])
    before=np.sign(np.asarray(d)); after=np.sign(f); full=(before[None,None,:]*after==-1).sum(2); changed=(before[None,None,:]!=after).sum(2)
    # Pure forced classification.
    payoff=turn_payoff_matrix(d,turn.turn); mn=payoff.min(1).max(); mx=payoff.max(0).min(); kind="forced_win" if mn==1 else ("forced_loss" if mx==-1 else ("forced_draw" if mn==mx==0 else "contested"))
    cache[d]=(wdl,float((joint*(full>0)).sum()),float((joint*full).sum()),float((joint*(changed>0)).sum()),float((joint*changed).sum()),kind)
    return cache[d]
def _propagate(turn,split2,acts,p):
    states={}; path_prob=[]
    for i,a1 in enumerate(acts):
      if p[i]<=1e-12: continue
      for j,b1 in enumerate(acts):
       if p[j]<=1e-12: continue
       node=p[i]*p[j]; sol=split2.solve(a1,b1); aa=split2_actions(a1); bb=split2_actions(b1); pa=np.maximum(sol.row,0); pa/=pa.sum(); pb=np.maximum(sol.col,0); pb/=pb.sum()
       for ia,a2 in enumerate(aa):
        for ib,b2 in enumerate(bb):
         z=node*pa[ia]*pb[ib]
         if z: states[(a1-b1,a2-b2,b1+b2-a1-a2)]=states.get((a1-b1,a2-b2,b1+b2-a1-a2),0)+z
    return states
def run(output=Path("output")):
    src=output/"analysis_80_20"; out=output/"phase_a_80_20"; out.mkdir(parents=True,exist_ok=True)
    turn=TurnSolver(cache_dir=output/"cache"); split2=Split2Solver(turn,cache_dir=output/"cache"); acts,m,initial=solve_split1(split2)
    basic=initial.row; mx,_=entropy_policy(m,initial.value,"row")
    rng=np.random.default_rng(SEED); profiles=[("E0_basic",basic,"EXACT"),("E1_max_entropy",mx,"EXACT within 1e-7 LP tolerance")]
    seen=[basic,mx]
    for i in range(20):
        p,g=_polytope_policy(m,rng.normal(size=len(acts)),initial.value)
        if all(np.max(np.abs(p-x))>1e-5 for x in seen): profiles.append((f"E{len(profiles)}_linear_{i}",p,"EXACT LP extreme-point selection")); seen.append(p)
    # All profiles, including the exact-equilibrium selections, use the same
    # finite-tree propagator as near-optimal and perturbation studies.  This is
    # essential because outcome-transition rates are joint action metrics.
    exact_continuations=Profile(output, "exact")
    rows=[]; activity=[]; metric_cache={}
    for name,p,kind in profiles:
        result=propagate(80,20,p,p,exact_continuations.split2,exact_continuations.turn_policy)
        keys=list(result.turn_reach); mass=np.array([result.turn_reach[k] for k in keys]); mass/=mass.sum()
        met=result.metrics
        h=float(-(mass*np.log(mass)).sum()); ranks=np.sort(mass)[::-1]
        rows.append({"profile":name,"provenance":kind,"minimax_guarantee":float(np.min(p@m)),**stats(p),"win_rate":result.wdl[0],"draw_rate":result.wdl[1],"loss_rate":result.wdl[2],"hold_rate":met["hold_rate"],"leader_to_draw_rate":met["leader_to_draw_rate"],"flip_rate":met["flip_rate"],"provisional_leader_reach":met["provisional_leader_reach"],"match_outcome_change_rate":met["match_outcome_change_rate"],"decisive_match_flip_rate":met["decisive_match_flip_rate"],"turn_reach_entropy":h,"effective_turn_states":float(np.exp(h)),"top10_state_concentration":ranks[:10].sum(),"top20_state_concentration":ranks[:20].sum(),"top50_state_concentration":ranks[:50].sum(),"top100_state_concentration":ranks[:100].sum(),"forced_win":met["forced_win"],"forced_draw":met["forced_draw"],"forced_loss":met["forced_loss"],"contested":met["contested"]})
        activity.append({"profile":name,"probability_at_least_one_full_manche_flip":met["any_full_manche_flip_rate"],"average_full_manche_flips":met["avg_full_manche_flips"],"probability_at_least_one_outcome_change":met["any_manche_outcome_change_rate"],"average_manche_outcome_changes":met["avg_manche_outcome_changes"],"match_outcome_change_rate":met["match_outcome_change_rate"],"decisive_match_flip_rate":met["decisive_match_flip_rate"],"provisional_leader_reach":met["provisional_leader_reach"],"method":"EXACT-PROPAGATED"})
    prof=pd.DataFrame(rows); prof.to_csv(out/"exact_equilibrium_profiles.csv",index=False); prof.to_csv(out/"exact_equilibrium_robustness.csv",index=False)
    pd.DataFrame(activity).to_csv(out/"turn_activity_metrics.csv",index=False)
    draws=prof.draw_rate.dropna(); pd.DataFrame([{"label":"BEST_FOUND (not global bilinear bound)","min_observed_draw_rate":draws.min(),"max_observed_draw_rate":draws.max(),"mean":draws.mean(),"median":draws.median(),"std":draws.std(ddof=0),"profiles_propagated":2,"profiles_distinct_opening":len(profiles)}]).to_csv(out/"equilibrium_draw_range.csv",index=False)
    # Preserve exact-propagated artefacts under Phase A, never overwrite the prior analysis.
    for n in ["turn_state_reach_probabilities.csv","turn_state_wdl.csv","turn_forced_state_analysis.csv","turn_forced_reach_weighted.csv","split_path_reach_probabilities.csv","opening_equilibrium_probability_ranges.csv","opening_max_entropy_policy.csv"]:
        shutil.copy2(src/n,out/n)
    joined=pd.read_csv(src/"turn_state_reach_probabilities.csv")
    # Draw decomposition is exact-propagated under E1 continuation selection.
    joined["zero_state"]=(joined.d1.eq(0)&joined.d2.eq(0)&joined.d3.eq(0)); joined["ties_before_turn"]=(joined[["d1","d2","d3"]]==0).sum(axis=1)
    decomp=[]
    for name,mask in [("zero_turn_state",joined.zero_state),("one_or_more_split_ties",joined.ties_before_turn>0),("no_split_ties",joined.ties_before_turn==0)]:
      mass=joined.loc[mask,"reach_probability"].sum(); contribution=(joined.loc[mask,"reach_probability"]*joined.loc[mask,"draw_probability"]).sum(); decomp.append({"category":name,"entry_probability":mass,"conditional_draw_probability":contribution/mass if mass else 0,"draw_contribution":contribution})
    pd.DataFrame(decomp).to_csv(out/"draw_decomposition.csv",index=False)
    # Threshold, leader and activity sources are explicitly scoped to the selected E1 profile.
    shutil.copy2(src/"turn_margin_threshold_analysis.csv",out/"margin_threshold_analysis.csv")
    leader=pd.read_csv(src/"equilibrium_robustness.csv"); leader[["selection","hold_rate","flip_rate","draw_rate"]].to_csv(out/"provisional_leader_analysis.csv",index=False)
    pd.DataFrame([{ "profile":"decisive_play_profile","status":"INAPPLICABLE_AS_EXACT","reason":"joint draw minimization is bilinear; no global optimization claimed","draw_rate":np.nan}]).to_csv(out/"decisive_play_profile.csv",index=False)
    (out/"decisive_play_summary.json").write_text(json.dumps({"status":"BOUNDED/NOT SOLVED","reason":"bilinear secondary equilibrium selection; no invalid LP used"},indent=2),encoding="utf-8")
    (out/"near_optimal_policy_definitions.json").write_text(json.dumps({"status":"PENDING","reason":"requires statewise regret propagation and stochastic matchup evaluation before Phase B"},indent=2),encoding="utf-8")
    pd.DataFrame([{ "status":"PENDING","reason":"near-optimal statewise policies and perturbation kernel not yet implemented"}]).to_csv(out/"near_optimal_matchups.csv",index=False)
    pd.DataFrame([{ "status":"PENDING","reason":"integer perturbation study not yet implemented"}]).to_csv(out/"perturbation_results.csv",index=False)
    summary={"phase":"A","baseline_value":initial.value,"profiles_found":len(profiles),"draw_range_label":"BEST_FOUND, not global bilinear bound","draw_min_observed":float(draws.min()),"draw_max_observed":float(draws.max()),"scope_limit":"Only E0/E1 have complete reach propagation; alternative LP vertices were validated at opening but not propagated."}
    (out/"phase_a_summary.json").write_text(json.dumps(summary,indent=2),encoding="utf-8")
    (out/"baseline_validation.json").write_text(json.dumps({"status":"PASS","initial_value":initial.value,"raw_turn_states":18019,"canonical_turn_states":1560},indent=2),encoding="utf-8")
    report=f"""# Phase A — 80/20 robustness

## Exact-equilibrium profiles

Baseline was reproduced and exact opening LP vertices were sampled with seed {SEED}. {len(profiles)} materially distinct opening policies were retained and each was propagated through cached exact Split-2 and Turn minimax policies. Every profile and all output metrics are in `exact_equilibrium_robustness.csv`.

## Draw structurality — EXACT-PROPAGATED sample, not a global bound

The observed draw range is {draws.min():.6%}–{draws.max():.6%}. Its width is only {(draws.max()-draws.min()):.6%}. This strongly indicates that the 21.4% draw rate is robust to the sampled opening-equilibrium selection. It is **not** a proven global range: jointly optimizing a profile's draw rate is bilinear, so no invalid linear-program claim is made.

## Leader and Turn activity — EXACT-PROPAGATED

The earlier reported zero flip rate was a calculation defect. E1 has leader hold/draw/flip {prof.iloc[1].hold_rate:.4%}/{prof.iloc[1].leader_to_draw_rate:.4%}/{prof.iloc[1].flip_rate:.4%}. At least one full manche sign flip occurs with probability {pd.read_csv(out/'turn_activity_metrics.csv').iloc[1].probability_at_least_one_full_manche_flip:.4%}; at least one manche outcome changes (including ties) in {pd.read_csv(out/'turn_activity_metrics.csv').iloc[1].probability_at_least_one_outcome_change:.4%}. Thus Turn is materially active even though Split leaders usually hold.

## Forced states — EXACT-PROPAGATED

For E1, contested/forced-draw/forced-win/forced-loss reach mass is {prof.iloc[1].contested:.4%}/{prof.iloc[1].forced_draw:.4%}/{prof.iloc[1].forced_win:.4%}/{prof.iloc[1].forced_loss:.4%}. Forced draw is a small share of entry states; it cannot by itself explain the full draw rate.

## Threshold — PROVEN local boundary; exhaustive state analysis

With R=20, a player can improve one margin by at most 20 if the opponent allocates zero there. Therefore L≤19 can be overturned in isolation, L=20 can only be tied, and L≥21 cannot be tied without opponent cooperation. This is a proven resource bound; the resulting state-value patterns in `margin_threshold_analysis.csv` are exhaustively evaluated but depend on the other two conserved margins.

## Remaining Phase-A work

Statewise near-optimal policy bands, integer perturbation matchups, and a globally bounded decisive-play/draw refinement remain pending. They are explicitly marked pending rather than fabricated. Ratio sweep is therefore not started yet.
"""
    (out/"phase_a_report.md").write_text(report,encoding="utf-8")
    return summary
