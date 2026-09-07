from __future__ import annotations
import json
from pathlib import Path
import numpy as np
import pandas as pd
REQUIRED=["phase_a_report.md","phase_a_summary.json","exact_equilibrium_profiles.csv","exact_equilibrium_robustness.csv","equilibrium_draw_range.csv","near_optimal_policy_definitions.json","near_optimal_matchups.csv","human_like_draw_comparison.csv","perturbation_definitions.json","perturbation_results.csv","decisive_play_profile.csv","decisive_play_summary.json","draw_structural_assessment.json","provisional_leader_analysis.csv","turn_activity_metrics.csv","draw_decomposition.csv","margin_threshold_analysis.csv","analysis_manifest.json","reproducibility.json","near_optimal_draw_rates.png","near_optimal_flip_rates.png","perturbation_draw_rates.png","perturbation_flip_rates.png","exact_vs_human_like_wdl.png","draw_rate_by_regret_band.png","flip_rate_by_regret_band.png"]
def run(output=Path("output")):
    p=output/"phase_a_80_20"
    missing=[x for x in REQUIRED if not (p/x).exists()]
    errors=[]; warnings=[]
    propagated=("near_optimal_matchups.csv","perturbation_results.csv","human_like_draw_comparison.csv")
    required_metrics=["hold_rate","leader_to_draw_rate","flip_rate","provisional_leader_reach","any_full_manche_flip_rate","avg_full_manche_flips","any_manche_outcome_change_rate","avg_manche_outcome_changes","match_outcome_change_rate","decisive_match_flip_rate","turn_state_entropy","turn_effective_states","forced_win_reach","forced_draw_reach","forced_loss_reach","contested_reach","zero_zero_zero_reach"]
    for n in propagated:
        f=p/n
        if not f.exists():
            continue
        d=pd.read_csv(f)
        if "calculation_method" not in d.columns or not d.calculation_method.eq("EXACT_PROPAGATED").all():
            errors.append(f"{n}: exact propagation required; current file is not wholly EXACT_PROPAGATED")
        if {"win_rate","draw_rate","loss_rate"}.issubset(d.columns) and not ((d.win_rate+d.draw_rate+d.loss_rate-1).abs()<1e-8).all():
            errors.append(f"{n}: W+D+L invariant failed")
        absent=[c for c in required_metrics if c not in d.columns or d[c].isna().any()]
        if absent:
            errors.append(f"{n}: missing/NaN required metrics: {', '.join(absent)}")
        else:
            if not np.allclose(d.decisive_match_flip_rate, d.flip_rate*d.provisional_leader_reach, rtol=0, atol=1e-9):
                errors.append(f"{n}: provisional-leader flip is inconsistent with decisive match-result transition")
            if (d.decisive_match_flip_rate > d.match_outcome_change_rate + 1e-12).any():
                errors.append(f"{n}: decisive match-result transition exceeds all match-result transitions")
        if n=="near_optimal_matchups.csv":
            needed={f"exact_vs_Q{x}_{k}" for x in ("005","010","020","050") for k in ("uniform","softmax")}
            miss=sorted(needed-set(d.profile.astype(str)))
            if miss: errors.append("near_optimal_matchups.csv: missing asymmetric matchups: "+", ".join(miss))
        if n=="perturbation_results.csv":
            needed={f"exact_vs_P{k}_{rate}" for k in (1,2) for rate in (10,25)}
            miss=sorted(needed-set(d.profile.astype(str)))
            if miss: errors.append("perturbation_results.csv: missing asymmetric matchups: "+", ".join(miss))
    exact_file=p/"exact_equilibrium_robustness.csv"
    if exact_file.exists():
        d=pd.read_csv(exact_file)
        absent=[c for c in ("flip_rate","provisional_leader_reach","match_outcome_change_rate","decisive_match_flip_rate") if c not in d.columns or d[c].isna().any()]
        if absent:
            errors.append("exact_equilibrium_robustness.csv: missing/NaN transition metrics: "+", ".join(absent))
        elif not np.allclose(d.decisive_match_flip_rate, d.flip_rate*d.provisional_leader_reach, rtol=0, atol=1e-9):
            errors.append("exact_equilibrium_robustness.csv: provisional-leader flip is inconsistent with decisive match-result transition")
    decisive=p/"decisive_play_summary.json"
    if decisive.exists() and "NOT SOLVED" in decisive.read_text(encoding="utf-8"):
        errors.append("decisive_play_summary.json: decisive refinement not completed")
    result={"status":"PASS" if not missing and not errors else "FAIL","missing_files":missing,"missing_columns":[],"missing_matchups":[],"empty_files":[],"invalid_metrics":[],"validation_errors":errors,"warnings":warnings}
    (p/"output_completeness.json").write_text(json.dumps(result,indent=2),encoding="utf-8")
    return result
