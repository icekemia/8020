from functools import lru_cache
@lru_cache(maxsize=None)
def turn_actions(turn:int=20) -> tuple[tuple[int,int,int], ...]:
    return tuple((a,b,turn-a-b) for a in range(turn+1) for b in range(turn-a+1))
