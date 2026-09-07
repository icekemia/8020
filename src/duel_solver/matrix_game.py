from __future__ import annotations
from dataclasses import dataclass
import numpy as np
from scipy.optimize import linprog
from . import EPS,PROBABILITY_TOL,LP_TOL
@dataclass
class GameSolution:
    value:float; row:np.ndarray; col:np.ndarray; primal:float; dual:float; gap:float; exploitability:float
def _clean(p:np.ndarray)->np.ndarray:
    if np.min(p)<-PROBABILITY_TOL: raise RuntimeError(f"materially negative probability: {np.min(p)}")
    p=np.maximum(p,0); return p/p.sum()
def solve_zero_sum_game(matrix:np.ndarray) -> GameSolution:
    m=np.asarray(matrix,dtype=float); rows,cols=m.shape
    # maximize v: M^T p >= v, sum(p)=1
    rp=linprog(np.r_[np.zeros(rows),-1.], A_ub=np.c_[-m.T,np.ones(cols)], b_ub=np.zeros(cols), A_eq=np.array([np.r_[np.ones(rows),0.]]), b_eq=[1.], bounds=[(0,None)]*rows+[(None,None)], method="highs")
    # minimize w: M q <= w, sum(q)=1
    cp=linprog(np.r_[np.zeros(cols),1.], A_ub=np.c_[m,-np.ones(rows)], b_ub=np.zeros(rows), A_eq=np.array([np.r_[np.ones(cols),0.]]), b_eq=[1.], bounds=[(0,None)]*cols+[(None,None)], method="highs")
    if not rp.success or not cp.success: raise RuntimeError(f"LP failed: {rp.message}; {cp.message}")
    row,col=_clean(rp.x[:-1]),_clean(cp.x[:-1]); primal=float(rp.x[-1]); dual=float(cp.x[-1]); gap=abs(primal-dual)
    if gap>LP_TOL: raise RuntimeError(f"primal/dual gap {gap}")
    lower=float(np.min(row@m)); upper=float(np.max(m@col)); exploit=max(abs(lower-primal),abs(upper-dual),gap)
    return GameSolution((primal+dual)/2,row,col,primal,dual,gap,exploit)
