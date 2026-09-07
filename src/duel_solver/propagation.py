"""Exact finite-tree propagation for fully specified local policy providers."""
from __future__ import annotations
from dataclasses import dataclass
from collections import defaultdict
import numpy as np
from .rules import split2_actions
from .actions import turn_actions
from .payoff import turn_payoff_matrix

@dataclass
class PropagationResult:
    wdl: np.ndarray
    turn_reach: dict
    leaf_mass: float
    metrics: dict

def propagate(split, turn, opening_a, opening_b, split2_policy, turn_policy, progress=None):
    """Enumerate all public-history branches; policy callbacks return normalized vectors."""
    states=defaultdict(float)
    for a1,pa in enumerate(opening_a,1):
      if pa==0: continue
      for b1,pb in enumerate(opening_b,1):
       if pb==0: continue
       aa=split2_actions(a1,split); bb=split2_actions(b1,split); ra,cb=split2_policy(a1,b1)
       if abs(ra.sum()-1)>1e-10 or abs(cb.sum()-1)>1e-10: raise ValueError("invalid Split2 policy")
       for i,a2 in enumerate(aa):
        if ra[i]==0: continue
        for j,b2 in enumerate(bb):
         if cb[j]: states[(a1-b1,a2-b2,b1+b2-a1-a2)]+=pa*pb*ra[i]*cb[j]
      if progress: progress("split",a1,len(opening_a))
    mass=sum(states.values())
    if abs(mass-1)>1e-9: raise RuntimeError(f"Split leaf mass {mass}")
    wdl=np.zeros(3); acts=np.asarray(turn_actions(turn)); leader=np.zeros(3); activity=np.zeros(12); forced={"forced_win":0.,"forced_draw":0.,"forced_loss":0.,"contested":0.}
    total=len(states)
    for count,(d,p) in enumerate(states.items(),1):
      ra,cb=turn_policy(d)
      if abs(ra.sum()-1)>1e-10 or abs(cb.sum()-1)>1e-10: raise ValueError("invalid Turn policy")
      f=np.asarray(d)[None,None,:]+acts[:,None,:]-acts[None,:,:]
      outcome=np.sign((f>0).sum(2)-(f<0).sum(2)); joint=ra[:,None]*cb[None,:]
      wdl += p*np.array([joint[outcome==1].sum(),joint[outcome==0].sum(),joint[outcome==-1].sum()])
      signs=np.sign(d); side=1 if (signs>0).sum()>(signs<0).sum() else (-1 if (signs<0).sum()>(signs>0).sum() else 0)
      if side==1: leader+=p*np.array([joint[outcome==1].sum(),joint[outcome==0].sum(),joint[outcome==-1].sum()])
      elif side==-1: leader+=p*np.array([joint[outcome==-1].sum(),joint[outcome==0].sum(),joint[outcome==1].sum()])
      full=(signs[None,None,:]*np.sign(f)==-1).sum(2); changed=(signs[None,None,:]!=np.sign(f)).sum(2)
      activity[:4]+=p*np.array([(joint*(full>0)).sum(),(joint*full).sum(),(joint*(changed>0)).sum(),(joint*changed).sum()])
      provisional=np.sign((np.asarray(d)>0).sum()-(np.asarray(d)<0).sum())
      activity[4]+=p*(joint*(outcome!=provisional)).sum(); activity[5]+=p*(joint*(outcome*provisional==-1)).sum()
      # Result transitions: win->draw, draw->win, draw->loss, loss->draw.
      activity[6]+=p*(joint*((provisional==1)&(outcome==0))).sum(); activity[7]+=p*(joint*((provisional==0)&(outcome==1))).sum(); activity[8]+=p*(joint*((provisional==0)&(outcome==-1))).sum(); activity[9]+=p*(joint*((provisional==-1)&(outcome==0))).sum()
      before=np.sign(d)[None,None,:]; after=np.sign(f)
      activity[10]+=p*(joint*((before==1)&(after==-1)).sum(2)).sum(); activity[11]+=p*(joint*((before==-1)&(after==1)).sum(2)).sum()
      mn=outcome.min(axis=1).max(); mx=outcome.max(axis=0).min(); forced["forced_win" if mn==1 else ("forced_loss" if mx==-1 else ("forced_draw" if mn==mx==0 else "contested"))]+=p
      if progress and (count==total or count%25==0): progress("turn",count,total)
    if abs(wdl.sum()-1)>1e-9: raise RuntimeError(f"WDL mass {wdl.sum()}")
    leader_reach=float(leader.sum())
    if leader_reach == 0:
      raise RuntimeError("no provisional-leader Turn states reached")
    probs=np.array(list(states.values())); h=float(-(probs*np.log(probs)).sum()); metrics={"hold_rate":leader[0]/leader_reach,"leader_to_draw_rate":leader[1]/leader_reach,"flip_rate":leader[2]/leader_reach,"provisional_leader_reach":leader_reach,"any_full_manche_flip_rate":activity[0],"avg_full_manche_flips":activity[1],"any_manche_outcome_change_rate":activity[2],"avg_manche_outcome_changes":activity[3],"match_outcome_change_rate":activity[4],"decisive_match_flip_rate":activity[5],"win_to_draw_rate":activity[6],"draw_to_win_rate":activity[7],"draw_to_loss_rate":activity[8],"loss_to_draw_rate":activity[9],"positive_to_negative_rate":activity[10],"negative_to_positive_rate":activity[11],"turn_state_entropy":h,"turn_effective_states":float(np.exp(h)),"zero_zero_zero_reach":states.get((0,0,0),0),**forced}
    return PropagationResult(wdl,dict(states),mass,metrics)
