from __future__ import annotations
import json
from pathlib import Path
from .exact_phase_profiles import Profile
from .propagation import propagate
def run(output=Path("output")):
 p=Profile(output)
 def progress(stage,i,n): print(f"{stage.upper():5} {i:5}/{n:5} {100*i/n:6.2f}%",flush=True)
 r=propagate(80,20,p.opening(),p.opening(),p.split2,p.turn_policy,progress)
 target=output/"phase_a_80_20"/"exact_baseline_propagation.json"
 target.write_text(json.dumps({"leaf_mass":r.leaf_mass,"wdl":r.wdl.tolist(),"turn_states":len(r.turn_reach)},indent=2),encoding="utf-8")
 print("COMPLETE",flush=True)
