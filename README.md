# DUEL 80/20 solver

Exact backward-induction solver for the mathematical DUEL rules: Split 80, Turn 20.

Requires Python 3.12+, NumPy, SciPy and pandas. Install with `pip install -e .`.

Run tests with `pytest`. Generate/resume the complete analysis with:

```bash
python -m duel_solver solve --split 80 --turn 20 --output output
```

The Turn-state cache is stored under `output/cache`; metadata rejects incompatible rule or solver versions. The command solves canonical Turn games, then Split 2 and Split 1, and writes CSV/JSON/Markdown outputs under `output/`.
