from __future__ import annotations
import json,math
from datetime import datetime,timezone
from pathlib import Path
import numpy as np
import pandas as pd
from .actions import turn_actions
from .canonical import canonical_turn_states,raw_turn_states
def stats(p):
    p=np.asarray(p); nz=p[p>1e-10]; h=float(-(nz*np.log(nz)).sum())
    q=np.sort(p)[::-1]; return {"entropy":h,"effective_actions":math.exp(h),"max_probability":float(q[0]),"top3":float(q[:3].sum()),"top5":float(q[:5].sum()),"support_size":int((p>1e-10).sum())}
def write_outputs(output:Path,turn_solver,split2,opening_actions,initial_matrix,initial):
    output.mkdir(parents=True,exist_ok=True); p=initial.row; ost=stats(p)
    exp=initial_matrix@initial.col; vals=[]
    for i,a in enumerate(opening_actions): vals.append({"action":a,"equilibrium_probability":p[i],"expected_value_against_equilibrium":exp[i],"regret":initial.value-exp[i],"rank":int(np.argsort(-exp).tolist().index(i)+1)})
    pd.DataFrame({"action":opening_actions,"probability":p}).to_csv(output/"opening_policy.csv",index=False)
    pd.DataFrame(vals).sort_values("rank").to_csv(output/"opening_action_values.csv",index=False)
    rows=[]
    for d in canonical_turn_states(turn_solver.split):
        s=turn_solver.solve_canonical(d); z=stats(s.row); rows.append({"d1":d[0],"d2":d[1],"d3":d[2],"value":s.value,"gap":s.gap,"exploitability":s.exploitability,**z})
    td=pd.DataFrame(rows); td.to_csv(output/"turn_state_values.csv",index=False); td[["d1","d2","d3","entropy","effective_actions","max_probability","support_size"]].to_csv(output/"turn_policy_stats.csv",index=False)
    summary={"generated_at":datetime.now(timezone.utc).isoformat(),"split":turn_solver.split,"turn":turn_solver.turn,"initial_value":initial.value,"opening":ost,"raw_turn_states":len(raw_turn_states(turn_solver.split)),"canonical_turn_states":len(rows),"turn_value_distribution":td.value.describe().to_dict(),"near_zero_fraction":float((td.value.abs()<=1e-8).mean()),"favorable_fraction":float((td.value>1e-8).mean()),"unfavorable_fraction":float((td.value<-1e-8).mean())}
    (output/"summary.json").write_text(json.dumps(summary,indent=2))
    top=pd.DataFrame(vals).sort_values("equilibrium_probability",ascending=False).head(10)
    report=f'''# DUEL 80/20 exact analysis\n\n## Status\n\nReference rules, exhaustive canonical Turn games, Split 2 and Split 1 backward induction completed.\n\n## Exact result\n\nInitial game value (A payoff): `{initial.value:.12g}`.\n\n## Opening equilibrium\n\nSupport: {ost["support_size"]} of {len(opening_actions)} actions. Shannon entropy: {ost["entropy"]:.6f}; effective actions: {ost["effective_actions"]:.3f}; maximum action probability: {ost["max_probability"]:.6f}; top-3/top-5 concentration: {ost["top3"]:.6f}/{ost["top5"]:.6f}.\n\nTop opening actions:\n\n{top.to_markdown(index=False, floatfmt=".8f")}\n\n## Turn-state structure\n\nRaw states: {summary["raw_turn_states"]}; canonical states: {summary["canonical_turn_states"]}. Near-zero values: {summary["near_zero_fraction"]:.2%}; positive/negative canonical values: {summary["favorable_fraction"]:.2%}/{summary["unfavorable_fraction"]:.2%}.\n\nValues and policy diagnostics are exported to CSV. These results are exact LP solutions up to the recorded numerical tolerance; policy selection is one HiGHS optimal solution, not a maximum-entropy refinement.\n\n## Interpretation\n\nThe opening concentration metrics quantify whether equilibrium is degenerate or varied. Turn-state value and support distributions quantify how often the Turn subgame is constrained; no alternative Split/Turn ratio or bot policy is analysed here.\n\n## Reproduction\n\n`python -m duel_solver solve --split 80 --turn 20 --output output`\n'''
    (output/"report_80_20.md").write_text(report)
    return summary
