from itertools import permutations
from duel_solver.rules import payoff
def test_turn_symmetries():
    d=(7,-11,4); a=(4,10,6); b=(9,1,10)
    assert payoff(d,a,b)==-payoff(tuple(-x for x in d),b,a)
    for p in permutations(range(3)):
        assert payoff(tuple(d[i] for i in p),tuple(a[i] for i in p),tuple(b[i] for i in p))==payoff(d,a,b)
