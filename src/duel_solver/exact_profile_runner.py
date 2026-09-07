from __future__ import annotations
import json
from pathlib import Path
from .exact_phase_profiles import Profile
from .propagation import propagate
def run(name,kind,band,perturb,output=Path("output")):
 p=Profile(output,kind=kind,band=band,perturb=perturb)
 def progress(stage,i,n): print(f"{name} {stage.upper()} {i}/{n} {100*i/n:.2f}%",flush=True)
 r=propagate(80,20,p.opening(),p.opening(),p.split2,p.turn_policy,progress)
 d=output/"phase_a_80_20"/"exact_profile_checkpoints"; d.mkdir(parents=True,exist_ok=True)
 (d/f"{name}.json").write_text(json.dumps({"profile":name,"method":"EXACT_PROPAGATED","leaf_mass":r.leaf_mass,"wdl":r.wdl.tolist(),"turn_states":len(r.turn_reach),"metrics":r.metrics},indent=2),encoding="utf-8")
 print(f"{name} COMPLETE",flush=True)
