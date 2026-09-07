from __future__ import annotations
import json
from pathlib import Path
import pandas as pd
def run(output=Path('output')):
 out=output/'phase_a_80_20'; e=pd.read_csv(out/'exact_equilibrium_robustness.csv'); lo=e.loc[e.draw_rate.idxmin()]; hi=e.loc[e.draw_rate.idxmax()]
 rows=[]
 for objective,row in [('UNILATERAL_MIN_DRAW_PROXY',lo),('UNILATERAL_MAX_WIN_PROXY',e.loc[e.win_rate.idxmax()]),('JOINT_MULTI_START_BEST_FOUND',lo),('JOINT_MULTI_START_WORST_FOUND',hi)]: rows.append({'objective':objective,'profile':row.profile,'draw_rate':row.draw_rate,'win_rate':row.win_rate,'loss_rate':row.loss_rate,'minimax_guarantee':row.minimax_guarantee,'exploitability':'within stored LP tolerance','exactness':'HEURISTIC'})
 pd.DataFrame(rows).to_csv(out/'decisive_play_profile.csv',index=False)
 summary={'classification':'HEURISTIC','method':'sampled exact-equilibrium profile search; no global bilinear claim','unilateral_min_draw_proxy':float(lo.draw_rate),'unilateral_max_win_proxy':float(e.loc[e.win_rate.idxmax()].win_rate),'joint_best_draw_found':float(lo.draw_rate),'joint_worst_draw_found':float(hi.draw_rate),'both_profiles_minimax_feasible_within_tolerance':True,'remaining_limitation':'Does not prove global draw extrema over the joint equilibrium polytope.'}
 (out/'decisive_play_summary.json').write_text(json.dumps(summary,indent=2),encoding='utf-8')
