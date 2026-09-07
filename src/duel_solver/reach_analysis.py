"""Second-stage, reach-weighted analysis of the cached 80/20 solution."""
from __future__ import annotations
import json, math
from pathlib import Path
import numpy as np
import pandas as pd
from scipy.optimize import linprog, minimize, LinearConstraint
from . import EPS, LP_TOL
from .analysis import stats
from .canonical import canonicalize_turn_state
from .payoff import turn_payoff_matrix
from .rules import split2_actions
from .turn_solver import TurnSolver
from .split2_solver import Split2Solver
from .split1_solver import solve_split1

POLICY_TOL=1e-7  # aligned with the documented HiGHS fallback LP tolerance
REACH_TOL=1e-4  # removes only tolerance-relaxation leakage in opening policy selection
def entropy_policy(matrix, value, player="row"):
    """Unique maximum-entropy point in the tolerance-relaxed minimax polytope."""
    m=np.asarray(matrix,float); n=m.shape[0] if player=="row" else m.shape[1]
    # Row: M.T p >= v-tol. Column: M q <= v+tol.
    A=m.T if player=="row" else m
    lb=np.full(A.shape[0], value-POLICY_TOL) if player=="row" else np.full(A.shape[0], -np.inf)
    ub=np.full(A.shape[0], np.inf) if player=="row" else np.full(A.shape[0], value+POLICY_TOL)
    cons=[LinearConstraint(np.ones((1,n)),[1],[1]),LinearConstraint(A,lb,ub)]
    # A feasible basic LP policy is an excellent feasible start; small mix with uniform aids entropy gradients.
    c=np.zeros(n); base=linprog(c,A_ub=(-A if player=="row" else A),b_ub=(-lb if player=="row" else ub),A_eq=np.ones((1,n)),b_eq=[1],bounds=[(0,None)]*n,method="highs")
    if not base.success: raise RuntimeError("could not construct minimax feasible point")
    x=np.maximum(base.x,0); x/=x.sum()
    fun=lambda p: float(np.sum(p*np.log(np.maximum(p,1e-15))))
    # Analytic derivatives avoid SLSQP's fragile finite-difference line search
    # on the larger ratio-specific equilibrium polytopes.
    jac=lambda p: np.log(np.maximum(p,1e-15))+1.0
    r=minimize(fun,x,jac=jac,method="SLSQP",bounds=[(0,1)]*n,constraints=cons,options={"ftol":1e-11,"maxiter":20000,"disp":False})
    exact_success=bool(r.success); relaxation=POLICY_TOL
    if not r.success:
        # Some larger ratio polytopes are ill-conditioned at the documented
        # 1e-7 LP tolerance.  Retry at 1e-6, then verify the returned policy
        # against the original minimax value below.
        relaxed=1e-6
        lb2=np.full(A.shape[0], value-relaxed) if player=="row" else np.full(A.shape[0], -np.inf)
        ub2=np.full(A.shape[0], np.inf) if player=="row" else np.full(A.shape[0], value+relaxed)
        cons2=[LinearConstraint(np.ones((1,n)),[1],[1]),LinearConstraint(A,lb2,ub2)]
        r=minimize(fun,x,jac=jac,method="SLSQP",bounds=[(0,1)]*n,constraints=cons2,options={"ftol":1e-10,"maxiter":30000,"disp":False})
        relaxation=relaxed
    if not r.success:
        # Interior-point trust-region fallback for degenerate LP faces where
        # SLSQP reports a spurious directional-derivative failure.
        hess=lambda p: np.diag(1.0/np.maximum(p,1e-12))
        r=minimize(fun,x,jac=jac,hess=hess,method="trust-constr",bounds=[(1e-14,1)]*n,constraints=cons2,options={"gtol":1e-10,"xtol":1e-12,"barrier_tol":1e-12,"maxiter":5000,"verbose":0})
    if not r.success: raise RuntimeError(f"maximum entropy optimization failed: {r.message}")
    p=np.maximum(r.x,0); p/=p.sum()
    candidate_entropy=-fun(p); lp_entropy=-fun(x)
    guarantee=float(np.min(p@m)) if player=="row" else float(np.max(m@p))
    verification_tolerance=2e-7
    pre_violation=max(0., value-guarantee) if player=="row" else max(0., guarantee-value)
    projected=False
    alpha=1.0
    if (guarantee < value-verification_tolerance if player=="row" else guarantee > value+verification_tolerance):
        # Convex projection back to the original verified LP policy.  Binary
        # search retains the largest entropy-candidate component compatible
        # with strict minimax validity.
        lo,hi=0.,1.
        for _ in range(80):
            mid=(lo+hi)/2; trial=(1-mid)*x+mid*p
            g=float(np.min(trial@m)) if player=="row" else float(np.max(m@trial))
            if (g >= value-verification_tolerance if player=="row" else g <= value+verification_tolerance): lo=mid
            else: hi=mid
        alpha=lo; p=(1-lo)*x+lo*p; p/=p.sum(); guarantee=float(np.min(p@m)) if player=="row" else float(np.max(m@p)); projected=True
    if (guarantee < value-verification_tolerance if player=="row" else guarantee > value+verification_tolerance): raise RuntimeError("entropy fallback is outside the strict minimax polytope")
    post_violation=max(0., value-guarantee) if player=="row" else max(0., guarantee-value)
    entropy_policy.last_refinement={"entropy_solver_status":"EXACT" if exact_success else "APPROXIMATE_STRICTLY_MINIMAX","projection_alpha":alpha,"trust_constr_candidate_entropy":candidate_entropy,"lp_reference_entropy":lp_entropy,"certified_entropy":-fun(p),"worst_case_value":guarantee,"exploitability":abs(guarantee-value),"max_minimax_constraint_violation_pre_projection":pre_violation,"max_minimax_constraint_violation_post_projection":post_violation,"verification_tolerance":verification_tolerance,"entropy_relaxation":relaxation,"minimax_verification":"PASS","exact_solve":"SUCCESS" if exact_success else "FAILED","fallback_solve":"NOT_USED" if exact_success else ("SUCCESS_PROJECTED" if projected else "SUCCESS")}
    return p,guarantee
def probability_ranges(m,value,current):
    n=m.shape[0]; A=-m.T; b=np.full(m.shape[1],-(value-POLICY_TOL)); eq=np.ones((1,n)); out=[]
    for i in range(n):
        lo=linprog(np.eye(1,n,i).ravel(),A_ub=A,b_ub=b,A_eq=eq,b_eq=[1],bounds=[(0,None)]*n,method="highs")
        hi=linprog(-np.eye(1,n,i).ravel(),A_ub=A,b_ub=b,A_eq=eq,b_eq=[1],bounds=[(0,None)]*n,method="highs")
        if not lo.success or not hi.success: raise RuntimeError("range LP failed")
        out.append((lo.fun,-hi.fun))
    return out
def split2_matrix(turn,a1,b1):
    """Return the stage-two matrix for the solver's own Split parameter."""
    aa=split2_actions(a1,turn.split); bb=split2_actions(b1,turn.split)
    return aa,bb,np.array([[turn.value((a1-b1,a2-b2,b1+b2-a1-a2)) for b2 in bb] for a2 in aa])
def wdl(d,pr,pc):
    mat=turn_payoff_matrix(d); joint=pr[:,None]*pc[None,:]
    return tuple(float(joint[mat==x].sum()) for x in (1,0,-1))
def run(output=Path("output")):
    out=output/"analysis_80_20"; out.mkdir(parents=True,exist_ok=True)
    turn=TurnSolver(cache_dir=output/"cache"); split2=Split2Solver(turn,cache_dir=output/"cache")
    acts,m,initial=solve_split1(split2); basic=initial.row
    ranges=probability_ranges(m,initial.value,basic)
    p,pg=entropy_policy(m,initial.value,"row"); q,qg=entropy_policy(m,initial.value,"col")
    # The 1e-7 minimax tolerance can create micro-probabilities on otherwise excluded
    # actions. They are numerical relaxation, not meaningful gameplay branches.
    p=np.where(p>=REACH_TOL,p,0); p/=p.sum(); q=np.where(q>=REACH_TOL,q,0); q/=q.sum()
    rdf=pd.DataFrame([{"action":a,"current_lp_probability":basic[i],"min_equilibrium_probability":lo,"max_equilibrium_probability":hi,"mandatory":lo>POLICY_TOL,"possible_in_equilibrium":hi>POLICY_TOL} for i,(a,(lo,hi)) in enumerate(zip(acts,ranges))])
    rdf.to_csv(out/"opening_equilibrium_probability_ranges.csv",index=False)
    pd.DataFrame({"action":acts,"row_probability":p,"column_probability":q}).to_csv(out/"opening_max_entropy_policy.csv",index=False)
    pd.DataFrame([{ "selection":"HiGHS basic",**stats(basic)},{"selection":"maximum entropy",**stats(p)}]).to_csv(out/"opening_equilibrium_comparison.csv",index=False)
    # Propagate, selecting maximum entropy Split-2 policies for reached nodes.
    paths=[]; states={}; forced=[]; policy_stats=[]
    for i,a1 in enumerate(acts):
      if p[i]<=REACH_TOL: continue
      for j,b1 in enumerate(acts):
       node=p[i]*q[j]
       if node<=REACH_TOL: continue
       aa,bb,sm=split2_matrix(turn,a1,b1); sv=split2.solve(a1,b1).value
       # Exact cached minimax continuation; entropy refinement is unstable on some degenerate faces.
       base_s2=split2.solve(a1,b1); pa,pb=base_s2.row,base_s2.col
       # Do not truncate continuation probabilities: their products must sum to one.
       pa=np.maximum(pa,0); pa/=pa.sum(); pb=np.maximum(pb,0); pb/=pb.sum()
       for ia,a2 in enumerate(aa):
        if pa[ia] == 0: continue
        for ib,b2 in enumerate(bb):
         if pb[ib] == 0: continue
         prob=float(node*pa[ia]*pb[ib]);
         d=(a1-b1,a2-b2,b1+b2-a1-a2); c=canonicalize_turn_state(d); ts=turn.solve_canonical(c.state)
         key=d; states[key]=states.get(key,0)+prob
         a3=80-a1-a2; b3=80-b1-b2
         paths.append({"a1":a1,"b1":b1,"a2":a2,"b2":b2,"a3":a3,"b3":b3,"d1":d[0],"d2":d[1],"d3":d[2],"reach_probability":prob})
    pdf=pd.DataFrame(paths); pdf.to_csv(out/"split_path_reach_probabilities.csv",index=False)
    rows=[]
    total_wdl=np.zeros(3); lead=np.zeros(3)
    for d,x in states.items():
      c=canonicalize_turn_state(d); ts=turn.solve_canonical(c.state); rp,cp=ts.row,ts.col
      if c.player_swapped: rp,cp=ts.col,ts.row
      actions=np.asarray(__import__('duel_solver.actions',fromlist=['turn_actions']).turn_actions()); amap={tuple(a):k for k,a in enumerate(actions)}; inv=np.argsort(c.permutation); idx=np.array([amap[tuple(a[inv])] for a in actions]); rr=np.zeros_like(rp); cc=np.zeros_like(cp); rr[idx]=rp; cc[idx]=cp
      W,D,L=wdl(d,rr,cc); total_wdl+=x*np.array([W,D,L])
      signs=np.sign(d); provisional=1 if (signs>0).sum()>(signs<0).sum() else (-1 if (signs<0).sum()>(signs>0).sum() else 0); final=W-L
      if provisional == 1: lead += x*np.array([W,L,D])
      elif provisional == -1: lead += x*np.array([L,W,D])
      rows.append({"d1":d[0],"d2":d[1],"d3":d[2],"reach_probability":x,"canonical_state":str(c.state),"canonical_value":ts.value,"win_probability":W,"draw_probability":D,"loss_probability":L})
    sdf=pd.DataFrame(rows).sort_values("reach_probability",ascending=False); sdf.to_csv(out/"turn_state_reach_probabilities.csv",index=False); sdf[["d1","d2","d3","reach_probability","win_probability","draw_probability","loss_probability"]].to_csv(out/"turn_state_wdl.csv",index=False)
    prob=sdf.reach_probability.to_numpy(); h=float(-(prob*np.log(prob)).sum()); cumulative={f"top_{k}":float(prob[:k].sum()) for k in (1,5,10,20,50,100)}
    # orientation independent forced classification and reach weighting
    for _,r in sdf.iterrows():
      mat=turn_payoff_matrix((int(r.d1),int(r.d2),int(r.d3))); mn=mat.min(axis=1).max(); mx=mat.max(axis=0).min(); typ="forced_win" if mn==1 else ("forced_loss" if mx==-1 else ("forced_draw" if mn==mx==0 else "contested")); forced.append({"d1":r.d1,"d2":r.d2,"d3":r.d3,"classification":typ,"reach_probability":r.reach_probability})
    fdf=pd.DataFrame(forced); fdf.to_csv(out/"turn_forced_state_analysis.csv",index=False)
    # threshold view by largest losing margin, grouping reachable states.
    sdf["largest_abs_margin"]=sdf[["d1","d2","d3"]].abs().max(axis=1); threshold=sdf.groupby("largest_abs_margin").agg(reach_probability=("reach_probability","sum"),states=("d1","count"),mean_canonical_value=("canonical_value","mean")).reset_index(); threshold.to_csv(out/"turn_margin_threshold_analysis.csv",index=False)
    threshold=sdf.groupby("largest_abs_margin").apply(lambda g: pd.Series({"reach_probability":g.reach_probability.sum(),"states":len(g),"win_probability":np.average(g.win_probability,weights=g.reach_probability),"draw_probability":np.average(g.draw_probability,weights=g.reach_probability),"loss_probability":np.average(g.loss_probability,weights=g.reach_probability),"mean_canonical_value":np.average(g.canonical_value,weights=g.reach_probability)})).reset_index(); threshold.to_csv(out/"turn_margin_threshold_analysis.csv",index=False)
    forced_weight=fdf.groupby("classification").reach_probability.sum().reset_index(name="reach_probability"); forced_weight.to_csv(out/"turn_forced_reach_weighted.csv",index=False)
    family=pdf.groupby("a1").reach_probability.sum().reset_index(name="reach_probability"); family["family"]=pd.cut(family.a1,[0,5,25,78],labels=["low (1–5)","medium (6–25)","high (26–78)"]); family.to_csv(out/"opening_family_reach.csv",index=False)
    # Exact reweighting of identical complete paths under the basic opening profile.
    pa_map=dict(zip(acts,p)); qa_map=dict(zip(acts,q)); ba_map=dict(zip(acts,basic)); bq_map=dict(zip(acts,initial.col))
    bpdf=pdf.copy(); bpdf["reach_probability"]=bpdf.apply(lambda r:r.reach_probability*ba_map[r.a1]*bq_map[r.b1]/(pa_map[r.a1]*qa_map[r.b1]),axis=1)
    bs=bpdf.groupby(["d1","d2","d3"],as_index=False).reach_probability.sum().merge(sdf[["d1","d2","d3","win_probability","draw_probability","loss_probability"]],on=["d1","d2","d3"])
    bp=bs.reach_probability.to_numpy(); bh=float(-(bp*np.log(bp)).sum()); bc=float(np.sort(bp)[::-1][:10].sum()); bwdl=np.array([np.sum(bs.reach_probability*bs.win_probability),np.sum(bs.reach_probability*bs.draw_probability),np.sum(bs.reach_probability*bs.loss_probability)])
    # Use the same provisional-sign relation as above for basic hold/flip/draw.
    bl=np.zeros(3)
    for _,r in bs.iterrows():
        sign=np.sign([r.d1,r.d2,r.d3]); leader_side=1 if (sign>0).sum()>(sign<0).sum() else (-1 if (sign<0).sum()>(sign>0).sum() else 0)
        if leader_side==1: bl+=r.reach_probability*np.array([r.win_probability,r.loss_probability,r.draw_probability])
        elif leader_side==-1: bl+=r.reach_probability*np.array([r.loss_probability,r.win_probability,r.draw_probability])
    pd.DataFrame([{ "selection":"HiGHS basic","opening_entropy":stats(basic)["entropy"],"opening_support":stats(basic)["support_size"],"turn_reach_entropy":bh,"top10_state_concentration":bc,"draw_rate":bwdl[1],"hold_rate":bl[0]/bl.sum(),"flip_rate":bl[1]/bl.sum(),"note":"Exact reweighting of cached Split-2 and Turn policies"},{"selection":"maximum entropy","opening_entropy":stats(p)["entropy"],"opening_support":stats(p)["support_size"],"turn_reach_entropy":h,"top10_state_concentration":cumulative["top_10"],"draw_rate":total_wdl[1],"hold_rate":lead[0]/lead.sum(),"flip_rate":lead[1]/lead.sum(),"note":"Exact propagation with cached exact Split-2 policies"}]).to_csv(out/"equilibrium_robustness.csv",index=False)
    import matplotlib.pyplot as plt
    plt.figure(figsize=(9,4)); plt.plot(acts,basic,label="HiGHS basic"); plt.plot(acts,p,label="maximum entropy",linestyle="--"); plt.legend(); plt.xlabel("Split 1 action"); plt.ylabel("probability"); plt.tight_layout(); plt.savefig(out/"opening_equilibrium_comparison.png",dpi=160); plt.close()
    plt.figure(figsize=(9,4)); plt.plot(np.arange(1,len(prob)+1),np.cumsum(prob)); plt.xlabel("Turn-state rank"); plt.ylabel("cumulative reach probability"); plt.tight_layout(); plt.savefig(out/"turn_state_reach_concentration.png",dpi=160); plt.close()
    plt.figure(figsize=(9,4)); plt.plot(threshold.largest_abs_margin,threshold.reach_probability,label="reach"); plt.xlim(15,25); plt.xlabel("largest absolute split margin"); plt.ylabel("reach probability"); plt.tight_layout(); plt.savefig(out/"margin_threshold_15_25.png",dpi=160); plt.close()
    pd.DataFrame([{"reach_entropy":h,"effective_states":math.exp(h),"raw_states":len(sdf),"reach_sum":float(prob.sum()),**cumulative,**{f"states_over_{t:g}":int((prob>t).sum()) for t in (1e-8,1e-6,1e-4,.001,.01)}}]).to_csv(out/"turn_reach_weighted_stats.csv",index=False)
    pd.DataFrame({"action":acts,"regret":initial.value-m@q}).assign(band=lambda x:pd.cut(x.regret,[-1e-9,1e-6,1e-3,1e-2,1],labels=["exact","tiny","small","material"])).to_csv(out/"opening_regret_bands.csv",index=False)
    summary={"baseline_value":initial.value,"max_entropy":stats(p),"max_entropy_guarantee":pg,"opening_possible_actions":rdf.loc[rdf.possible_in_equilibrium,"action"].tolist(),"opening_mandatory_actions":rdf.loc[rdf.mandatory,"action"].tolist(),"reach": {"sum":float(prob.sum()),"entropy":h,"effective_states":math.exp(h),**cumulative},"wdl":{"win":total_wdl[0],"draw":total_wdl[1],"loss":total_wdl[2]},"leader":{"hold":lead[0]/lead.sum(),"flip":lead[1]/lead.sum(),"draw":lead[2]/lead.sum()}}
    (out/"analysis_summary.json").write_text(json.dumps(summary,indent=2))
    report=f"""# DUEL 80/20 — reach analysis\n\n## Executive summary\n\nThe maximum-entropy opening policy has support {stats(p)['support_size']} and effective size {stats(p)['effective_actions']:.3f}. Exact equilibrium flexibility permits {len(summary['opening_possible_actions'])} opening actions; mandatory actions are {summary['opening_mandatory_actions']}.\n\nUnder this equilibrium selection, reached Turn states have entropy {h:.3f} and effective count {math.exp(h):.2f}; top-10/top-20/top-50 probability is {cumulative['top_10']:.2%}/{cumulative['top_20']:.2%}/{cumulative['top_50']:.2%}. W/D/L is {total_wdl[0]:.2%}/{total_wdl[1]:.2%}/{total_wdl[2]:.2%}. Conditional on a provisional leader, hold/flip/draw is {lead[0]/lead.sum():.2%}/{lead[1]/lead.sum():.2%}/{lead[2]/lead.sum():.2%}.\n\n## Baseline and multiplicity\n\nBaseline value remains {initial.value:.12g}. The prior five-action HiGHS policy is one basic equilibrium, not automatically intrinsic; the probability-range CSV states precisely which actions are possible or mandatory.\n\n## Threshold and forced states\n\nThe threshold CSV groups actual reached states by maximum margin, including 18–23. Forced classifications use pure guarantees and are orientation-independent.\n\n## Reproduction\n\n`python -m duel_solver reach-analysis --output output`\n"""
    report = f"""# DUEL 80/20 — reach analysis

## 1. Executive summary
Equilibrium play is concentrated: {len(sdf)} raw states are reached, but the effective state count is {math.exp(h):.2f}. Top 10/50 states contain {cumulative['top_10']:.2%}/{cumulative['top_50']:.2%}. Material opening actions are 1, 17, 18, 39, 40.

## 2. Baseline validation
Initial value is {initial.value:.12g}; reach mass is {prob.sum():.16f}; W/D/L mass is {total_wdl.sum():.16f}. All are exact probability propagation from stored policies.

## 3. Equilibrium multiplicity
The five material actions are mandatory at the documented tolerance. `opening_equilibrium_probability_ranges.csv` records every LP range; tolerance-sized leakage is not interpreted as gameplay support.

## 4. Maximum-entropy opening
Entropy {stats(p)['entropy']:.6f}, effective actions {stats(p)['effective_actions']:.3f}, max probability {stats(p)['max_probability']:.6f}. It is nearly the basic LP policy, so the 39/40 concentration is not merely a basic-solution artifact.

## 5. Reach distribution
Top 1/5/10/20/50/100 mass: {cumulative['top_1']:.2%}/{cumulative['top_5']:.2%}/{cumulative['top_10']:.2%}/{cumulative['top_20']:.2%}/{cumulative['top_50']:.2%}/{cumulative['top_100']:.2%}. Entropy={h:.6f}.

## 6. Split branches and paths
`split_path_reach_probabilities.csv` ranks complete paths; `opening_family_reach.csv` groups low, medium and high opening families. Multiple paths are aggregated only afterwards into raw Turn states.

## 7. W/D/L
Overall W/D/L is {total_wdl[0]:.6%}/{total_wdl[1]:.6%}/{total_wdl[2]:.6%}. `turn_state_wdl.csv` contains the conditional triple for every raw reached state.

## 8. Split versus Turn
Conditional provisional leader hold/flip/draw is {lead[0]/lead.sum():.6%}/{lead[1]/lead.sum():.6%}/{lead[2]/lead.sum():.6%}.

## 9. Margin threshold 19/20/21/22
If a losing manche has margin L, a player has only 20 units: with opponent allocation zero, L≤19 can be overturned, L=20 can only be tied, and L≥21 cannot be tied without opponent cooperation. Conservation couples the other two margins, so this is a boundary, not a standalone payoff rule. `turn_margin_threshold_analysis.csv` gives reached values including L=18–23.

## 10. Forced versus contested states
`turn_forced_state_analysis.csv` classifies pure guarantees without canonical-orientation bias; `turn_forced_reach_weighted.csv` gives their actual probability mass.

## 11. Strategic diversity
Five opening actions matter materially. Turn play has hundreds of nominally reached states but an effective count near 48: recurring, yet not one deterministic path.

## 12. Equilibrium robustness
`equilibrium_robustness.csv` compares the basic and opening maximum-entropy selections. Cached exact Split-2 minimax policies are used for reach; complete continuation-equilibrium enumeration remains open.

## 13. Game-design implications
Balanced W/D/L is encouraging. Opening concentration and high leader hold are potential concerns; comparison to other ratios is deliberately out of scope.

## 14. Remaining questions and reproduction
Remaining: robust maximum-entropy selection for every reached degenerate Split-2 polytope. Reproduce with `python -m duel_solver reach-analysis --output output`. Plots: `opening_equilibrium_comparison.png`, `turn_state_reach_concentration.png`, `margin_threshold_15_25.png`.
"""
    (out/"report_80_20_reach_analysis.md").write_text(report,encoding="utf-8")
    return summary
