from __future__ import annotations
import json
from pathlib import Path
import numpy as np
from .matrix_game import GameSolution,solve_zero_sum_game
from .rules import split2_actions
class Split2Solver:
    def __init__(self,turn_solver,split=80,cache_dir:Path|None=None):
        self.turn_solver,self.split=turn_solver,split; self.solutions={}; self.path=(cache_dir/"split2_solutions.json") if cache_dir else None
        if self.path and self.path.exists():
            data=json.loads(self.path.read_text())
            for k,v in data.items():
                a,b=map(int,k.split(",")); self.solutions[(a,b)]=GameSolution(v[0],np.array(v[1]),np.array(v[2]),v[3],v[4],v[5],v[6])
    def flush(self):
        if self.path:
            data={f"{a},{b}":[s.value,s.row.tolist(),s.col.tolist(),s.primal,s.dual,s.gap,s.exploitability] for (a,b),s in self.solutions.items()}
            temp=self.path.with_suffix(".tmp"); temp.write_text(json.dumps(data,separators=(",",":"))); temp.replace(self.path)
    def solve(self,a1:int,b1:int)->GameSolution:
        k=(a1,b1)
        if k not in self.solutions:
            aa=split2_actions(a1,self.split); bb=split2_actions(b1,self.split)
            m=np.empty((len(aa),len(bb)),dtype=float)
            for i,a2 in enumerate(aa):
                for j,b2 in enumerate(bb): m[i,j]=self.turn_solver.value((a1-b1,a2-b2,(self.split-a1-a2)-(self.split-b1-b2)))
            self.solutions[k]=solve_zero_sum_game(m)
        return self.solutions[k]
    def solve_all(self,progress=None):
        actions=range(1,self.split-1); n=(self.split-2)**2; done=0
        # Directly use antisymmetry to avoid duplicate LPs, preserving all ordered states.
        for a in actions:
            for b in actions:
                if (a,b) not in self.solutions:
                    s=self.solve(a,b); self.solutions[(b,a)]=GameSolution(-s.value,s.col,s.row,-s.dual,-s.primal,s.gap,s.exploitability)
                done+=1
            self.flush()
            if progress: progress(done,n)
        return self.solutions
