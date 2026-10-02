# ADR 0003: Resolution-independent portion estimates

**Status:** accepted · **Date:** 2026-10-02

## Context

v1 computed `grams = 100 × box_pixels / reference_pixels`. A 12 MP phone photo has about 30× more
pixels than the 640 × 640 images the references were measured on, so the same pizza came out as
8,000+ kcal.

## Decision

- Measure the box as a **fraction of the image area**.
- `grams = typical_serving_g[dish] × clamp(area_fraction / reference_fraction[dish], 0.3, 3.0)`.
- Reference fractions come from the v1 calibration, converted by assuming it was measured on
  640 × 640 images.
- Typical servings are kept per dish in `api/app/data/nutrition_food101.json`.
- The UI always shows the estimate as editable, and saved meals keep both `estimatedGrams` and the
  final `grams`, so the calibration can be improved later from real corrections.

## Consequences

Estimates are now stable across devices. They are still a heuristic, since one photo cannot measure
depth, and the product says so honestly.
