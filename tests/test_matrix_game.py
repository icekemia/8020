import numpy as np
from duel_solver.matrix_game import solve_zero_sum_game
def test_known_games():
    for m,v in [(np.array([[1,-1],[-1,1]]),0), (np.array([[0,-1,1],[1,0,-1],[-1,1,0]]),0), (np.array([[2,1],[3,0]]),1)]:
        s=solve_zero_sum_game(m); assert abs(s.value-v)<1e-8 and s.gap<1e-8 and abs(s.row.sum()-1)<1e-10
