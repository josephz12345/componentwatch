# Verification record

Verified on November 7, 2026 using Node.js 24.14.1 on Windows.

- Automated suite: 18 tests passed, including an HTTP server integration test.
- Static build: `npm run build` completed.
- Bounded live check: robots.txt returned HTTP 200; the components feed returned HTTP 200 after a five-second request gap.
- Live normalization result: 26 matching condition variants — 12 RAM, 10 SSD, 4 GPU.
- The live counts are a point-in-time sample of the first components page, not the site's total inventory and not a performance benchmark.

Docker and GitHub-hosted CI were not executed in this environment. The source includes their configurations for reproducible setup.
