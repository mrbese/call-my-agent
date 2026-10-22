# Security maintenance

The 2026-10-21 dependency repair updates Next.js to the patched 15.5 line and refreshes the lockfile. Production dependency auditing reports zero findings. ESLint, TypeScript and the production build pass.

The remaining five npm high groups describe one unpatched advisory, GHSA-vfj7-8cjw-p6xm, in braces 3.0.3 through Next ESLint, fast-glob and micromatch. The current Next lint configuration accepts trusted local glob settings and has no external rootDir input. This is a development-tool risk, not a fixed package. Recheck for an upstream patch by 2026-11-04. Avoid processing untrusted glob patterns, and do not downgrade Next merely to silence the report.

Remote phone access should remain within Tailscale Serve and the app should bind to loopback. A repository update does not update an existing local installation. Install from the committed lockfile, rebuild, and verify its binding before restarting an installed instance.
