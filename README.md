# DUEL 80/20 solver and local prototype

Exact backward-induction solver for the mathematical DUEL rules: Split 80, Turn 20.

Requires Python 3.12+, NumPy, SciPy and pandas. Install with `pip install -e .`.

Run tests with `pytest`. Generate/resume the complete analysis with:

```bash
python -m duel_solver solve --split 80 --turn 20 --output output
```

## Local prototype

Install with `npm install`. Export the offline Difficult policy with `npm run export:policy`, validate it with `npm run verify:policy`, run the browser with `npm run dev`, and run the reproducible verification chain with `npm run complete:prototype`. The validation result is written to `output/prototype_validation.json`.

The Turn-state cache is stored under `output/cache`; metadata rejects incompatible rule or solver versions. The command solves canonical Turn games, then Split 2 and Split 1, and writes CSV/JSON/Markdown outputs under `output/`.
