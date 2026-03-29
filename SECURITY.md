# Security Policy

If you discover a security issue in LLM Chat Benchmark, do not post exploit details, sensitive prompts, or private sample data in a normal public issue.

## Preferred reporting path

- If GitHub Private Vulnerability Reporting is enabled for this repository, use it.
- Otherwise, open a minimal public issue that states a security-sensitive problem exists and request a private follow-up channel.

Keep the initial report high level until a private path is established.

Good reports include:

- affected browser and extension version
- affected site, if relevant
- clear reproduction steps
- impact summary
- any proof-of-concept details needed to understand the issue

Areas of particular interest:

- unintended retention of sensitive user content
- unsafe handling of imported data
- extension permission misuse
- DOM injection or script execution issues
- export/import behavior that could expose local data unexpectedly

Public issues are still fine for non-sensitive defects, regressions, and site breakage that do not expose user data or create a meaningful security risk.
