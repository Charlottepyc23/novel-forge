# Desktop Baseline

This desktop branch is based on upstream tag `v1.7.3`:

```text
30dc61a27a1249dc45bfd6388771c565f7df8c37
```

The original plugin source remains under `src/`. Desktop-specific code lives
under `desktop/` and is built with `electron-vite`.

The `main` branch in the upstream repository currently points to version
`1.5.0`; use release tag `v1.7.3` when comparing or importing upstream fixes.

The standalone desktop migration intentionally keeps the existing
`novel-project.json` and Markdown storage format for its first version.
