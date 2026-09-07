"""State-local exact policy providers for Phase-A propagation."""
from __future__ import annotations
import numpy as np
from .reach_analysis import entropy_policy, split2_matrix
from .human_phase import _raw_turn
from .split1_solver import solve_split1
from .turn_solver import TurnSolver
from .split2_solver import Split2Solver
from .actions import turn_actions

def norm(x):
 x=np.maximum(np.asarray(x,float),0); return x/x.sum()
def local(scores,value,band,kind):
 ok=scores>=value-band-1e-8
 if kind=="uniform": return norm(ok)
 z=np.where(ok,(scores-value)/.01,-np.inf); z-=np.max(z); return norm(np.exp(z))
def perturb_scalar(p,k,rate,lo,hi):
 out=(1-rate)*p.copy()
 for i,x in enumerate(range(lo,hi+1)):
  opts=[y for y in (x-k,x+k) if lo<=y<=hi]
  if opts:
   for y in opts: out[y-lo]+=rate*p[i]/len(opts)
  else: out[i]+=rate*p[i]
 return norm(out)
def perturb_turn(p,k,rate,turn=20):
 acts=turn_actions(turn); index={a:i for i,a in enumerate(acts)}; out=(1-rate)*p.copy()
 for i,a in enumerate(acts):
  opts=[]
  for donor in range(3):
   if a[donor]>=k:
    for rec in range(3):
     if rec!=donor:
      b=list(a); b[donor]-=k; b[rec]+=k; opts.append(tuple(b))
  if opts:
   for b in opts:out[index[b]]+=rate*p[i]/len(opts)
  else:out[i]+=rate*p[i]
 return norm(out)
class Profile:
 def __init__(self,output,kind="exact",band=0.,perturb=None,split=80,turn_units=20,cache_root=None):
  self.split,self.turn_units=split,turn_units
  cache=(cache_root or output)/"cache"
  self.turn=TurnSolver(split,turn_units,cache); self.s2=Split2Solver(self.turn,split,cache); self.acts=np.arange(1,split-1); _,self.m,self.init=solve_split1(self.s2,split); self.exact,_=entropy_policy(self.m,self.init.value,"row"); self.entropy_refinement=dict(entropy_policy.last_refinement); self.kind,self.band,self.perturb=kind,band,perturb; self.s2cache={}; self.tcache={}
 def opening(self,player="A"):
  p=self.exact if self.kind=="exact" else local(self.m@self.exact,self.init.value,self.band,self.kind)
  if self.perturb:p=perturb_scalar(p,*self.perturb,1,self.split-2)
  return p
 def split2(self,a,b):
  return self._split2_row(a,b),self._split2_row(b,a)
 def _split2_row(self,a,b):
  key=(a,b,"row")
  if key not in self.s2cache:
   aa,bb,mat=split2_matrix(self.turn,a,b); sol=self.s2.solve(a,b); r,c=sol.row,sol.col
   if self.kind!="exact": r=local(mat@c,sol.value,self.band,self.kind)
   if self.perturb:r=perturb_scalar(r,*self.perturb,1,self.split-1-a)
   self.s2cache[key]=r
  return self.s2cache[key]
 def turn_policy(self,d):
  return self._turn_row(d),self._turn_row(tuple(-x for x in d))
 def _turn_row(self,d):
  if d not in self.tcache:
   r,c,mat=_raw_turn(self.turn,d)
   if self.kind!="exact": r=local(mat@c,float(np.min(r@mat)),self.band,self.kind)
   if self.perturb:r=perturb_turn(r,*self.perturb,self.turn_units)
   self.tcache[d]=r
  return self.tcache[d]
