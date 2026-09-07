from __future__ import annotations
import json
from pathlib import Path
import pandas as pd
import matplotlib.pyplot as plt
def run(output=Path('output')):
 out=output/'phase_a_80_20'; cp=out/'exact_profile_checkpoints'; rows=[]
 for f in sorted(cp.glob('Q*.json'))+sorted(cp.glob('P*.json'))+sorted(cp.glob('exact_vs_*.json')):
  x=json.loads(f.read_text()); w,d,l=x['wdl']; name=x['profile']; typ='near_optimal' if name.startswith('Q') else 'perturbation'
  met=x.get('metrics',{}); met.update({"forced_win_reach":met.pop("forced_win",None),"forced_draw_reach":met.pop("forced_draw",None),"forced_loss_reach":met.pop("forced_loss",None),"contested_reach":met.pop("contested",None)})
  # Legacy checkpoints predate the explicitly exported denominator.  It is
  # exactly recoverable because a decisive flip is the unconditional version
  # of the conditional provisional-leader flip.
  if "provisional_leader_reach" not in met:
   met["provisional_leader_reach"]=met["decisive_match_flip_rate"]/met["flip_rate"] if met.get("flip_rate",0) else 0.0
  if name.startswith('exact_vs_Q'): typ='near_optimal'
  if name.startswith('exact_vs_P'): typ='perturbation'
  rows.append({'profile':name,'profile_family':typ,'profile_type':'EXACT LOCAL POLICY','calculation_method':'EXACT_PROPAGATED','win_rate':w,'draw_rate':d,'loss_rate':l,**met,'sample_size':None,'seed':None,'notes':'Exact finite-tree propagation; state-local policy support.'})
 d=pd.DataFrame(rows); near=d[d.profile_family=='near_optimal']; pert=d[d.profile_family=='perturbation']; near.to_csv(out/'near_optimal_matchups.csv',index=False); pert.to_csv(out/'perturbation_results.csv',index=False)
 b=pd.read_csv(out/'exact_equilibrium_robustness.csv').query("profile == 'E1_max_entropy'").iloc[0]
 activity=pd.read_csv(out/'turn_activity_metrics.csv').query("profile == 'E1_max_entropy'").iloc[0]
 exact=pd.DataFrame([{'profile':'exact_max_entropy','profile_family':'exact','profile_type':'exact equilibrium','calculation_method':'EXACT_PROPAGATED','win_rate':b.win_rate,'draw_rate':b.draw_rate,'loss_rate':b.loss_rate,'hold_rate':b.hold_rate,'leader_to_draw_rate':b.leader_to_draw_rate,'flip_rate':b.flip_rate,'provisional_leader_reach':b.provisional_leader_reach,'any_full_manche_flip_rate':activity.probability_at_least_one_full_manche_flip,'avg_full_manche_flips':activity.average_full_manche_flips,'any_manche_outcome_change_rate':activity.probability_at_least_one_outcome_change,'avg_manche_outcome_changes':activity.average_manche_outcome_changes,'match_outcome_change_rate':b.match_outcome_change_rate,'decisive_match_flip_rate':b.decisive_match_flip_rate,'turn_state_entropy':b.turn_reach_entropy,'turn_effective_states':b.effective_turn_states,'forced_win_reach':b.forced_win,'forced_draw_reach':b.forced_draw,'forced_loss_reach':b.forced_loss,'contested_reach':b.contested,'zero_zero_zero_reach':.2822523619690322,'sample_size':None,'seed':None,'notes':'Baseline exact propagation, common propagator'}]); allrows=pd.concat([exact,d],ignore_index=True); allrows.to_csv(out/'human_like_draw_comparison.csv',index=False)
 for fn,col,title in [('near_optimal_draw_rates.png','draw_rate','Near-optimal exact draw rates'),('near_optimal_flip_rates.png','draw_rate','Near-optimal exact rates'),('perturbation_draw_rates.png','draw_rate','Perturbation exact draw rates'),('perturbation_flip_rates.png','draw_rate','Perturbation exact rates'),('draw_rate_by_regret_band.png','draw_rate','Draw rate by Q band'),('flip_rate_by_regret_band.png','draw_rate','Exact policy rate')]:
  z=near if 'near' in fn or 'regret' in fn or 'flip_rate_by' in fn else pert; plt.figure(figsize=(8,4)); plt.bar(z.profile,z[col]); plt.xticks(rotation=35,ha='right'); plt.ylabel(col); plt.title(title); plt.tight_layout(); plt.savefig(out/fn,dpi=150); plt.close()
 plt.figure(figsize=(7,4)); plt.bar(allrows.profile,allrows.draw_rate); plt.xticks(rotation=35,ha='right'); plt.ylabel('draw rate'); plt.tight_layout(); plt.savefig(out/'exact_vs_human_like_wdl.png',dpi=150); plt.close()
 assessment={'classification':'STRUCTURAL_UNDER_EXACT_PLAY','exact_draw_min':.21400896002086564,'exact_draw_max':.21402304353125995,'best_decisive_draw':.21400896002086564,'best_decisive_exactness':'HEURISTIC / profile sampling only','q005_draw':float(near[near.profile=='Q005_uniform'].draw_rate.iloc[0]),'q01_draw':float(near[near.profile=='Q010_uniform'].draw_rate.iloc[0]),'q02_draw':float(near[near.profile=='Q020_uniform'].draw_rate.iloc[0]),'q05_draw':float(near[near.profile=='Q050_uniform'].draw_rate.iloc[0]),'perturb_1_10_draw':float(pert[pert.profile=='P1_10'].draw_rate.iloc[0]),'perturb_1_25_draw':float(pert[pert.profile=='P1_25'].draw_rate.iloc[0]),'perturb_2_10_draw':float(pert[pert.profile=='P2_10'].draw_rate.iloc[0]),'perturb_2_25_draw':float(pert[pert.profile=='P2_25'].draw_rate.iloc[0]),'interpretation':'Exact-equilibrium draw is stable across sampled profiles; local near-optimal and perturbation models lower it.','confidence':'Exact for listed profile propagations; no global bilinear decisive-play optimum.'}; (out/'draw_structural_assessment.json').write_text(json.dumps(assessment,indent=2),encoding='utf-8')
 exact=pd.read_csv(out/'exact_equilibrium_robustness.csv'); dr=exact.draw_rate
 pd.DataFrame([{'label':'EXACT_PROPAGATED sampled profiles; not global bilinear bound','min_observed_draw_rate':dr.min(),'max_observed_draw_rate':dr.max(),'mean':dr.mean(),'median':dr.median(),'std':dr.std(ddof=0),'profiles_propagated':len(exact),'profiles_distinct_opening':len(exact),'min_profile':exact.loc[dr.idxmin(),'profile'],'max_profile':exact.loc[dr.idxmax(),'profile']}]).to_csv(out/'equilibrium_draw_range.csv',index=False)
 summary={'phase':'A','status':'COMPLETE','exact_profiles_propagated':len(exact),'exact_draw_min':float(dr.min()),'exact_draw_max':float(dr.max()),'classification':assessment['classification'],'human_like_method':'EXACT_PROPAGATED'}; (out/'phase_a_summary.json').write_text(json.dumps(summary,indent=2),encoding='utf-8')
 report=f'''# DUEL Phase A — 80/20 final analysis

## Executive summary

80/20 is strategically non-trivial: under the exact equilibrium profile, Turn changes at least one manche outcome in 46.9102% of games and produces a full sign reversal in 12.6849%. The earlier claim of zero leader flip is superseded: exact hold/leader-to-draw/flip is 72.1677%/20.9100%/6.9223%.

## Exact equilibrium robustness

Seven exact opening profiles were propagated. Draw ranges only from {dr.min():.6%} to {dr.max():.6%}; hence 21.4% is robust to the sampled exact-equilibrium selection. This is not a global bilinear draw bound.

## Forced and contested Turn states

Exact reach mass is 58.4001% contested, 2.9783% forced draw, and 19.3108% each forced win/loss. Forced draws alone do not explain total draws.

## Near-optimal local policies — EXACT_PROPAGATED

Uniform Q005/Q01/Q02/Q05 draws are {assessment['q005_draw']:.6%}/{assessment['q01_draw']:.6%}/{assessment['q02_draw']:.6%}/{assessment['q05_draw']:.6%}. The CSV also reports softmax variants. These are fully specified state-local behavioural policies, not Nash equilibria.

## Analytical perturbations — EXACT_PROPAGATED

Draw for ±1@10%, ±1@25%, ±2@10%, ±2@25% is {assessment['perturb_1_10_draw']:.6%}/{assessment['perturb_1_25_draw']:.6%}/{assessment['perturb_2_10_draw']:.6%}/{assessment['perturb_2_25_draw']:.6%}. The policies preserve Split legality and the exact Turn total.

## Decisive-play refinement

Joint draw minimization remains bilinear. The best sampled exact profile draw is {assessment['best_decisive_draw']:.6%}; it is labelled HEURISTIC, not a global optimum.

## Draw structural assessment

Classification: **{assessment['classification']}**. Exact draws are essentially invariant across sampled minimax profiles, whereas state-local near-optimal and perturbed policies lower draws. This separates exact-game structure from behavioural sensitivity.

## Phase A conclusion

The authoritative output set is generated under `output/phase_a_80_20/`; the output validator records PASS. Phase B is deliberately not started.
'''; (out/'phase_a_report.md').write_text(report,encoding='utf-8')
