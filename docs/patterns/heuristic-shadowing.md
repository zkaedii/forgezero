# Heuristic Shadowing

Two safety heuristics layered in defense-in-depth can silently disable each
other when they fire on the same input. The placeholder gate "this looks
like fake test data" and the denylist gate "this looks like a real secret"
both correctly fire on `ghp_xxxxxxxxxxxx`. Whichever fires first absorbs
the input; the other never runs. The test passes (placeholder absorbed it)
or fails (denylist never fired) depending on order, with no signal that
the *other gate is silently dead*.

Diagnostic: a green-red-green sequence on the same code as test inputs change
shape. Test passes with placeholder fixture (gate A absorbs). Test fails
when fixture changes to real-shaped value (gate A skips, gate B never wired
properly to fire). Test passes again when gate B is wired correctly. The
red phase reveals that gate B was never running.

Mitigation: each defense layer must observably fire even when an earlier
layer absorbs the input. Either log every gate's verdict (so missing
verdicts surface) or design layers to AND their checks rather than
fall-through.

Caught during ForgeZero secret-scrub development, 2026-04-28.
