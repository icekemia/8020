from __future__ import annotations
from itertools import permutations
from dataclasses import dataclass
@dataclass(frozen=True)
class CanonicalState:
    state:tuple[int,int,int]; permutation:tuple[int,int,int]; player_swapped:bool
def canonicalize_turn_state(d:tuple[int,int,int]) -> CanonicalState:
    candidates=[]
    for swapped, sign in ((False,1),(True,-1)):
        for p in permutations(range(3)):
            candidates.append((tuple(sign*d[i] for i in p),p,swapped))
    state,p,swapped=min(candidates)
    return CanonicalState(state,p,swapped)
def raw_turn_states(split:int=80) -> tuple[tuple[int,int,int],...]:
    return tuple((x,y,-x-y) for x in range(-split+3,split-2) for y in range(-split+3,split-2) if -(split-3)<=-x-y<=split-3)
def canonical_turn_states(split:int=80) -> tuple[tuple[int,int,int],...]: return tuple(sorted({canonicalize_turn_state(d).state for d in raw_turn_states(split)}))
