from __future__ import annotations
import argparse
from pathlib import Path
import numpy as np
from .turn_solver import TurnSolver
from .split2_solver import Split2Solver
from .split1_solver import solve_split1
from .analysis import write_outputs
from .reach_analysis import run as reach_analysis
from .phase_a import run as phase_a
from .human_phase import run as human_phase
from .verify_phase_a import run as verify_phase_a
from .exact_runner import run as exact_runner
from .exact_profile_runner import run as exact_profile_runner
from .finalize_phase_a import run as finalize_phase_a
from .governance import run as governance
from .exact_matchup_runner import run as exact_matchup_runner
from .decisive_refinement import run as decisive_refinement
from .phase_b import run as phase_b
from .phase_b_aggregate import run as phase_b_aggregate
from .verify_phase_b import run as verify_phase_b
from .phase_b_robustness import run_ratio as phase_b_robustness
from .runtime_policy import export as export_runtime_policy,verify as verify_runtime_policy
def main(argv=None):
    parser=argparse.ArgumentParser(); sub=parser.add_subparsers(dest="command",required=True)
    s=sub.add_parser("solve"); s.add_argument("--split",type=int,default=80); s.add_argument("--turn",type=int,default=20); s.add_argument("--output",type=Path,default=Path("output"))
    r=sub.add_parser("reach-analysis"); r.add_argument("--output",type=Path,default=Path("output"))
    pa=sub.add_parser("phase-a"); pa.add_argument("--output",type=Path,default=Path("output"))
    ph=sub.add_parser("phase-a-human"); ph.add_argument("--output",type=Path,default=Path("output"))
    va=sub.add_parser("verify-analysis-output"); va.add_argument("--output",type=Path,default=Path("output"))
    er=sub.add_parser("run-exact-baseline"); er.add_argument("--output",type=Path,default=Path("output"))
    ep=sub.add_parser("run-exact-profile"); ep.add_argument("name"); ep.add_argument("--kind",choices=["uniform","softmax","exact"],default="exact"); ep.add_argument("--band",type=float,default=0.0); ep.add_argument("--perturb-k",type=int,default=0); ep.add_argument("--perturb-rate",type=float,default=0.0); ep.add_argument("--output",type=Path,default=Path("output"))
    fa=sub.add_parser("finalize-phase-a"); fa.add_argument("--output",type=Path,default=Path("output"))
    gv=sub.add_parser("phase-a-governance"); gv.add_argument("--output",type=Path,default=Path("output"))
    em=sub.add_parser("run-exact-matchup"); em.add_argument("name"); em.add_argument("--kind",choices=["uniform","softmax","exact"],default="exact"); em.add_argument("--band",type=float,default=0.0); em.add_argument("--perturb-k",type=int,default=0); em.add_argument("--perturb-rate",type=float,default=0.0); em.add_argument("--output",type=Path,default=Path("output"))
    dr=sub.add_parser("decisive-refinement"); dr.add_argument("--output",type=Path,default=Path("output"))
    pb=sub.add_parser("complete-phase-b"); pb.add_argument("--output",type=Path,default=Path("output"))
    pba=sub.add_parser("aggregate-phase-b"); pba.add_argument("--output",type=Path,default=Path("output"))
    vpb=sub.add_parser("verify-phase-b"); vpb.add_argument("--output",type=Path,default=Path("output"))
    rb=sub.add_parser("phase-b-robustness"); rb.add_argument("split",type=int); rb.add_argument("turn",type=int); rb.add_argument("--output",type=Path,default=Path("output"))
    rp=sub.add_parser("export-runtime-policy"); rp.add_argument("--output",type=Path,default=Path("public/policies"))
    vp=sub.add_parser("verify-runtime-policy"); vp.add_argument("policy",type=Path)
    a=parser.parse_args(argv)
    if a.command=="solve":
        if (a.split,a.turn)!=(80,20): raise ValueError("this deliverable is intentionally limited to 80/20")
        turn=TurnSolver(a.split,a.turn,a.output/"cache")
        turn.solve_all(lambda i,n: print(f"Turn {i}/{n}",flush=True))
        split2=Split2Solver(turn,a.split,a.output/"cache"); split2.solve_all(lambda i,n: print(f"Split2 {i}/{n}",flush=True))
        acts,m,initial=solve_split1(split2,a.split)
        if abs(initial.value)>1e-8 or abs(m+m.T).max()>1e-8 or abs(np.diag(m)).max()>1e-8: raise RuntimeError("initial symmetry invariant failed")
        write_outputs(a.output,turn,split2,acts,m,initial); print(f"Done: value={initial.value:.12g}")
    if a.command=="reach-analysis":
        summary=reach_analysis(a.output); print(f"Done: reached effective states={summary['reach']['effective_states']:.3f}")
    if a.command=="phase-a":
        summary=phase_a(a.output); print(f"Done: Phase A profiles={summary['profiles_found']}")
    if a.command=="phase-a-human":
        rows=human_phase(a.output); print(f"Done: human-like matchups={len(rows)}")
    if a.command=="verify-analysis-output":
        result=verify_phase_a(a.output); print(f"{result['status']}: {len(result['validation_errors'])} validation errors")
    if a.command=="run-exact-baseline": exact_runner(a.output)
    if a.command=="run-exact-profile": exact_profile_runner(a.name,a.kind,a.band,(a.perturb_k,a.perturb_rate) if a.perturb_k else None,a.output)
    if a.command=="finalize-phase-a": finalize_phase_a(a.output)
    if a.command=="phase-a-governance": governance(a.output)
    if a.command=="run-exact-matchup": exact_matchup_runner(a.name,a.kind,a.band,(a.perturb_k,a.perturb_rate) if a.perturb_k else None,a.output)
    if a.command=="decisive-refinement": decisive_refinement(a.output)
    if a.command=="complete-phase-b": phase_b(a.output)
    if a.command=="aggregate-phase-b": phase_b_aggregate(a.output)
    if a.command=="verify-phase-b":
        result=verify_phase_b(a.output); print(f"{result['status']}: {len(result['validation_errors'])} validation errors")
    if a.command=="phase-b-robustness": phase_b_robustness(a.split,a.turn,a.output)
    if a.command=="export-runtime-policy": print(export_runtime_policy(a.output))
    if a.command=="verify-runtime-policy": print(verify_runtime_policy(a.policy))
if __name__=="__main__": main()
