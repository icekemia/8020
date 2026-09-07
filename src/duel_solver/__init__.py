"""Exact reference solver for DUEL."""

GAME_SPEC_VERSION = "0.2"
SOLVER_SPEC_VERSION = "0.1"
EPS = 1e-8
PROBABILITY_TOL = 1e-7
LP_TOL = 1e-7  # HiGHS observed a 5.91e-8 gap on an 80/20 Split 2 LP.
