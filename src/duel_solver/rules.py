from __future__ import annotations
from dataclasses import dataclass

SPLIT_UNITS, TURN_UNITS = 80, 20

def split1_actions(split: int = SPLIT_UNITS) -> tuple[int, ...]: return tuple(range(1, split - 1))
def split2_actions(m1: int, split: int = SPLIT_UNITS) -> tuple[int, ...]:
    if m1 not in split1_actions(split): raise ValueError("illegal Split 1 allocation")
    return tuple(range(1, split - m1))
def validate_turn(t: tuple[int, int, int], turn: int = TURN_UNITS) -> None:
    if len(t) != 3 or any(x < 0 or int(x) != x for x in t) or sum(t) != turn: raise ValueError("illegal Turn allocation")
def split_position(a1:int,a2:int,b1:int,b2:int,split:int=SPLIT_UNITS) -> tuple[tuple[int,int,int],tuple[int,int,int],tuple[int,int,int]]:
    if a2 not in split2_actions(a1,split) or b2 not in split2_actions(b1,split): raise ValueError("illegal Split 2 allocation")
    a=(a1,a2,split-a1-a2); b=(b1,b2,split-b1-b2); return a,b,tuple(x-y for x,y in zip(a,b))
def final_margins(d:tuple[int,int,int], a:tuple[int,int,int], b:tuple[int,int,int]) -> tuple[int,int,int]:
    validate_turn(a); validate_turn(b); return tuple(x+y-z for x,y,z in zip(d,a,b))
def manche_results(m:tuple[int,int,int]) -> tuple[int,int,int]: return tuple((x>0)-(x<0) for x in m)
def payoff_from_margins(m:tuple[int,int,int]) -> int:
    # Conservation excludes a 3-0 sweep; count wins still precisely defines the result.
    r=manche_results(m); return (sum(x>0 for x in r)>sum(x<0 for x in r))-(sum(x>0 for x in r)<sum(x<0 for x in r))
def payoff(d:tuple[int,int,int],a:tuple[int,int,int],b:tuple[int,int,int]) -> int: return payoff_from_margins(final_margins(d,a,b))
@dataclass(frozen=True)
class Result:
    split_a:tuple[int,int,int]; split_b:tuple[int,int,int]; final:tuple[int,int,int]; payoff:int
def play(a1:int,a2:int,b1:int,b2:int,ta:tuple[int,int,int],tb:tuple[int,int,int]) -> Result:
    a,b,d=split_position(a1,a2,b1,b2); f=final_margins(d,ta,tb); return Result(a,b,f,payoff_from_margins(f))
