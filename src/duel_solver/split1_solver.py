from __future__ import annotations
import numpy as np
from .matrix_game import solve_zero_sum_game
def solve_split1(split2,split=80):
    acts=tuple(range(1,split-1)); m=np.array([[split2.solve(a,b).value for b in acts] for a in acts])
    return acts,m,solve_zero_sum_game(m)
