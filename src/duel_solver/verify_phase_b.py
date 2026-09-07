from __future__ import annotations
import json
from pathlib import Path
import numpy as np
import pandas as pd
RATIOS={'75/25','78/22','80/20','82/18','85/15'}; PROFILES={'EXACT_MAX_ENTROPY','Q005_UNIFORM','Q02_UNIFORM','P1_25'}
REQUIRED=['ratio_comparison_core.csv','ratio_pairwise_differences.csv','ratio_equilibrium_robustness.csv','ratio_threshold_comparison.csv','ratio_sweep_report.md','analysis_manifest.json','reproducibility.json','ratio_entropy_diagnostics.csv','ratio_draw_rates.png','ratio_leader_flip.png','ratio_turn_diversity.png']
def run(root=Path('output')):
 p=root/'phase_b_ratio_sweep'; err=[]; missing=[x for x in REQUIRED if not (p/x).exists()]
 d=pd.read_csv(p/'ratio_comparison_core.csv') if (p/'ratio_comparison_core.csv').exists() else pd.DataFrame()
 if not d.empty:
  if set(d.ratio)!=RATIOS: err.append('ratio coverage is incomplete')
  for ratio,g in d.groupby('ratio'):
   if set(g.profile)!=PROFILES: err.append(f'{ratio}: required profile coverage is incomplete')
  cols=['win_rate','draw_rate','loss_rate','hold_rate','leader_to_draw_rate','flip_rate','provisional_leader_reach','match_outcome_change_rate','decisive_match_flip_rate','forced_win','forced_draw','forced_loss','contested']
  if d[cols].isna().any().any(): err.append('required metrics contain NaN')
  if not np.allclose(d.win_rate+d.draw_rate+d.loss_rate,1,atol=1e-8): err.append('WDL conservation failed')
  if not np.allclose(d.win_rate,d.loss_rate,atol=1e-8): err.append('symmetric W/L failed')
  if not np.allclose(d.hold_rate+d.leader_to_draw_rate+d.flip_rate,1,atol=1e-8): err.append('leader conditional conservation failed')
  if not np.allclose(d.forced_win+d.forced_draw+d.forced_loss+d.contested,1,atol=1e-8): err.append('forced-state conservation failed')
  if not np.allclose(d.decisive_match_flip_rate,d.provisional_leader_reach*d.flip_rate,atol=1e-8): err.append('decisive flip identity failed')
  e=d[d.profile.eq('EXACT_MAX_ENTROPY')]
  for _,r in e.iterrows():
   if r.entropy_solver_status!='EXACT' or r.projection_alpha<.999999:
    if r.certified_entropy==r.opening_entropy: err.append(f'{r.ratio}: approximate entropy presented as true maximum entropy')
 result={'status':'PASS' if not missing and not err else 'FAIL','missing_files':missing,'missing_columns':[],'missing_ratios':[],'missing_profiles':[],'empty_files':[],'nan_metrics':[],'invalid_metrics':[],'symmetry_errors':[],'probability_errors':[],'regression_errors':[],'validation_errors':err,'warnings':[]}
 (p/'output_completeness.json').write_text(json.dumps(result,indent=2)); return result
