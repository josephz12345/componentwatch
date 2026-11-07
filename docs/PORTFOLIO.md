# Presenting ComponentWatch

## Resume entry

**ComponentWatch — Hardware Price Monitoring Platform**  
*Node.js, JavaScript, SQLite, REST APIs, Docker, GitHub Actions*

- Built a VIPOutlet price monitor for RAM, SSDs, and GPUs with a five-second polling scheduler, variant-level normalization, and persistent SQLite price history.
- Implemented conditional HTTP requests, robots.txt-aware scheduling, exponential backoff, and transactional change detection with deduplicated price-target alerts.
- Developed a responsive dashboard with search, stock filters, watchlists, price-history charts, and CSV export; validated core ingestion and API behavior with automated tests.

Use these bullets once you can explain and demonstrate the implementation. Avoid claiming thousands of monitored products, latency improvements, production users, uptime, or cost savings without measuring them. Describe AI assistance honestly if asked, and make an enhancement of your own before presenting the project as a major personal accomplishment.

## A two-minute demo

1. Start `npm start` and identify the synthetic demo badge. Explain why a deterministic presentation mode is useful.
2. Filter to SSDs, search for `990`, and open the product's chart.
3. Set a target slightly above the current price. Show the `target hit` event in the activity log.
4. Open the watchlist, toggle a star, and refresh to demonstrate persistence.
5. Export the filtered data. Pause/resume the replay.
6. Show `npm test`, then explain the live mode using `npm run live` or the bounded `npm run check:live` command.

## Questions you should be able to answer

**Why use the JSON feed instead of Selenium?**  
The public collection response exposes stable structured fields and individual variants. It avoids browser rendering overhead and brittle selectors. The tradeoff is dependence on an unofficial storefront surface that may change.

**Why not write every five-second observation to history?**  
Repeated identical observations consume space without adding information. The current row carries freshness; history records changes. This supports charts and alerts while keeping storage growth tied to actual change.

**Does five-second polling mean a five-second detection guarantee?**  
No. The scheduler rotates pages across two collections. Coverage time includes pagination, response duration, robots delays, backoff, and another dashboard refresh. Measure latency rather than equating it with the timer value.

**How do you avoid duplicate alerts?**  
The watch stores a `triggered` state. It emits once when the product is in stock at or below the target, then rearms when that condition becomes false. Transactional ingestion couples the observation with its event.

**What happens if the feed returns 429 or changes shape?**  
429 honors Retry-After and backs off. Invalid schemas produce an error without overwriting inventory. Authentication/access failures pause the collector. The dashboard exposes the failure and retains the last known observations.

**Why SQLite and a single process?**  
It keeps setup small and makes state durable with simple transactions. It suits a personal monitor. Multiple users and larger ingestion volumes would justify separating the collector, API, database, and notification queue.

## Your next personal contribution

Choose one extension, implement it yourself, and document a before/after measurement. Examples: improve classification against a curated fixture set, add configurable collection coverage, build a historical price comparison view, or instrument detection latency using a local mock feed. This gives you a concrete design decision and result to discuss in interviews.
