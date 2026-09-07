import pytest
from duel_solver.rules import *
def test_split_limits_and_auto_split3():
    assert split1_actions()[0]==1 and split1_actions()[-1]==78
    assert split2_actions(1)[-1]==78 and split2_actions(78)==(1,)
    a,b,d=split_position(20,30,21,29); assert a==(20,30,30) and b==(21,29,30) and sum(d)==0
def test_invalid_actions():
    with pytest.raises(ValueError): split2_actions(0)
    with pytest.raises(ValueError): validate_turn((1,2,3))
def test_result_constraints():
    assert payoff_from_margins((2,-1,-1))==-1
    assert payoff_from_margins((0,0,0))==0
