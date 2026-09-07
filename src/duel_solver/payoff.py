from __future__ import annotations
import numpy as np
from .actions import turn_actions
def turn_payoff_matrix(d:tuple[int,int,int], turn:int=20) -> np.ndarray:
    a=np.asarray(turn_actions(turn),dtype=np.int16)
    f=np.asarray(d,dtype=np.int16)+a[:,None,:]-a[None,:,:]
    wins=(f>0).sum(axis=2); losses=(f<0).sum(axis=2)
    return np.sign(wins-losses).astype(np.int8)
