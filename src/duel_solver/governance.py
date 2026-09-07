from __future__ import annotations
import json, platform, sys
from pathlib import Path
import numpy, scipy, pandas
from . import GAME_SPEC_VERSION,SOLVER_SPEC_VERSION,EPS,LP_TOL
def run(output=Path('output')):
 p=output/'phase_a_80_20'; items=[]
 for f in sorted(p.iterdir()):
  if f.is_file(): items.append({'path':f.name,'data_type':f.suffix.lstrip('.'),'purpose':'Phase A analysis artefact','calculation_method':'see source report','row_count':sum(1 for _ in f.open(encoding='utf-8',errors='ignore'))-1 if f.suffix=='.csv' else None})
 (p/'analysis_manifest.json').write_text(json.dumps({'phase':'A','outputs':items},indent=2),encoding='utf-8')
 (p/'reproducibility.json').write_text(json.dumps({'python':sys.version,'platform':platform.platform(),'numpy':numpy.__version__,'scipy':scipy.__version__,'pandas':pandas.__version__,'game_spec_version':GAME_SPEC_VERSION,'solver_spec_version':SOLVER_SPEC_VERSION,'epsilon':EPS,'lp_tolerance':LP_TOL,'exact_policy_cache':'output/cache'},indent=2),encoding='utf-8')
