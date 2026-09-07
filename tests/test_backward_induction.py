import numpy as np
from duel_solver.turn_solver import TurnSolver
from duel_solver.split2_solver import Split2Solver
def test_split2_antisymmetry_on_small_subset():
    t=TurnSolver(); s=Split2Solver(t)
    assert abs(s.solve(1,2).value+s.solve(2,1).value)<1e-8
