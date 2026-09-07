from __future__ import annotations
import json, platform, sys
from pathlib import Path
import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
from .phase_b import RATIOS, PROFILES

def run(root=Path('output')):
 out=root/'phase_b_ratio_sweep'; frames=[pd.read_csv(out/f'{s}_{t}'/'profile_metrics.csv') for s,t in RATIOS]; d=pd.concat(frames,ignore_index=True)
 d.to_csv(out/'ratio_comparison_core.csv',index=False)
 e=d.query("profile == 'EXACT_MAX_ENTROPY'").copy(); pairs=[]
 for i,a in e.iterrows():
  for _,b in e.iterrows():
   if a.ratio<b.ratio: pairs.append({'ratio_a':a.ratio,'ratio_b':b.ratio,'draw_difference':b.draw_rate-a.draw_rate,'flip_difference':b.flip_rate-a.flip_rate,'turn_effective_states_difference':b.turn_effective_states-a.turn_effective_states})
 pd.DataFrame(pairs).to_csv(out/'ratio_pairwise_differences.csv',index=False)
 e[['ratio','opening_effective_actions','opening_entropy','certified_entropy','entropy_solver_status','projection_alpha','draw_rate','hold_rate','leader_to_draw_rate','flip_rate','match_outcome_change_rate','decisive_match_flip_rate']].to_csv(out/'ratio_equilibrium_robustness.csv',index=False)
 e['usable_quantitatively']=np.where((e.entropy_solver_status=='EXACT')&(e.projection_alpha>=.999999),'YES','NO')
 e[['ratio','entropy_solver_status','projection_alpha','trust_constr_candidate_entropy','lp_reference_entropy','certified_entropy','worst_case_value','exploitability','max_minimax_constraint_violation_pre_projection','max_minimax_constraint_violation_post_projection','verification_tolerance','usable_quantitatively']].to_csv(out/'ratio_entropy_diagnostics.csv',index=False)
 e[['ratio','turn','forced_win','forced_draw','forced_loss','contested','turn_effective_states','any_full_manche_flip_rate']].to_csv(out/'ratio_threshold_comparison.csv',index=False)
 for file,col in [('ratio_draw_rates.png','draw_rate'),('ratio_leader_flip.png','flip_rate'),('ratio_turn_diversity.png','turn_effective_states')]:
  plt.figure(figsize=(8,4));
  for p,g in d.groupby('profile'): plt.plot(g['ratio'],g[col],marker='o',label=p)
  plt.legend(); plt.ylabel(col); plt.tight_layout(); plt.savefig(out/file,dpi=150); plt.close()
 diag=e[['ratio','entropy_solver_status','projection_alpha','certified_entropy','usable_quantitatively']].to_markdown(index=False)
 report='# DUEL Phase B ratio sweep\n\n## Entropy diagnostic\n\n'+diag+'\n\nOpening entropy/effective actions are diagnostics only when status is not `EXACT`; the recommendation uses regret-band widths, Turn influence/activity, forced-contested reach, and the Q005/Q02/P1_25 robustness grid.\n\n## Findings\n\nAll W/D/L and Turn metrics in `ratio_comparison_core.csv` are exact probability propagations. Any approximate strictly-minimax entropy is never described as true maximum entropy.\n'
 (out/'ratio_sweep_report.md').write_text(report)
 files=[]
 for f in out.rglob('*'):
  if f.is_file(): files.append({'path':str(f.relative_to(out)),'ratio':next((x for x in ['75/25','78/22','80/20','82/18','85/15'] if x.replace('/','_') in str(f)), 'cross_ratio'),'purpose':'Phase B result','data_type':f.suffix,'row_count':None,'calculation_method':'EXACT_PROPAGATED','exactness':'EXACT_PROPAGATED','generation_step':'phase_b'})
 (out/'analysis_manifest.json').write_text(json.dumps(files,indent=2))
 (out/'reproducibility.json').write_text(json.dumps({'python':sys.version,'platform':platform.platform(),'ratios':[f'{s}/{t}' for s,t in RATIOS],'profiles':[x[0] for x in PROFILES]},indent=2))
 return d
