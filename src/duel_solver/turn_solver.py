from __future__ import annotations
import json
from pathlib import Path
import numpy as np
from . import GAME_SPEC_VERSION,SOLVER_SPEC_VERSION
from .actions import turn_actions
from .canonical import canonicalize_turn_state,canonical_turn_states
from .matrix_game import GameSolution,solve_zero_sum_game
from .payoff import turn_payoff_matrix
def _key(d): return ",".join(map(str,d))
class TurnSolver:
    def __init__(self, split=80,turn=20,cache_dir:Path|None=None):
        self.split,self.turn=split,turn; self.cache_dir=cache_dir; self.solutions={}
        if cache_dir:
            cache_dir.mkdir(parents=True,exist_ok=True); self.path=cache_dir/"turn_solutions.json"
            if self.path.exists():
                data=json.loads(self.path.read_text())
                meta=data.pop("_metadata",{})
                if meta==self.metadata: self.solutions=data
    @property
    def metadata(self): return {"game_spec_version":GAME_SPEC_VERSION,"solver_spec_version":SOLVER_SPEC_VERSION,"split":self.split,"turn":self.turn}
    def flush(self):
        if self.cache_dir:
            temp=self.path.with_suffix(".tmp")
            temp.write_text(json.dumps({"_metadata":self.metadata,**self.solutions},separators=(",",":")))
            temp.replace(self.path)
    def solve_canonical(self,d):
        k=_key(d)
        if k not in self.solutions:
            s=solve_zero_sum_game(turn_payoff_matrix(d,self.turn)); self.solutions[k]={"value":s.value,"row":s.row.tolist(),"col":s.col.tolist(),"primal":s.primal,"dual":s.dual,"gap":s.gap,"exploitability":s.exploitability}
        x=self.solutions[k]; return GameSolution(x["value"],np.array(x["row"]),np.array(x["col"]),x["primal"],x["dual"],x["gap"],x["exploitability"])
    def value(self,d):
        c=canonicalize_turn_state(d); v=self.solve_canonical(c.state).value; return -v if c.player_swapped else v
    def solve_all(self,progress=None):
        states=canonical_turn_states(self.split)
        for i,d in enumerate(states,1):
            self.solve_canonical(d)
            if i%25==0: self.flush()
            if progress and (i%25==0 or i==len(states)): progress(i,len(states))
        self.flush(); return states
