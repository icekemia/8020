from duel_solver.rules import *
def test_conservation_and_impossible_sweeps():
    for a1,a2,b1,b2 in [(1,1,78,1),(30,20,1,50),(78,1,1,78)]:
        a,b,d=split_position(a1,a2,b1,b2); assert sum(a)==sum(b)==80 and sum(d)==0
        f=final_margins(d,(20,0,0),(0,20,0)); assert sum(f)==0
        assert not (all(x>0 for x in f) or all(x<0 for x in f))
