from duel_solver.actions import turn_actions
from duel_solver.canonical import raw_turn_states,canonical_turn_states
from duel_solver.payoff import turn_payoff_matrix
def test_actions_states_and_matrix():
    assert len(turn_actions())==231 and all(sum(a)==20 for a in turn_actions())
    assert len(raw_turn_states())==18019
    assert len(canonical_turn_states())==1560
    assert turn_payoff_matrix((0,0,0)).dtype.name=="int8"
