// RFC-style longest matching path, wildcard and end-anchor support.
// Crawl-delay is a nonstandard extension; we honor it when present.
export function parseRobots(text, agent = 'componentwatch') {
  const groups = [];
  let group = null, hasRules = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.split('#')[0].trim();
    const colon = line.indexOf(':');
    if (colon < 0) continue;
    const key = line.slice(0, colon).toLowerCase().trim();
    const value = line.slice(colon + 1).trim();
    if (key === 'user-agent') {
      if (!group || hasRules) { group = { agents: [], rules: [], delay: 0 }; groups.push(group); hasRules = false; }
      group.agents.push(value.toLowerCase());
    } else if (group && ['allow', 'disallow', 'crawl-delay'].includes(key)) {
      hasRules = true;
      if (key === 'crawl-delay') group.delay = Math.max(group.delay, Number(value) * 1000 || 0);
      else if (value) group.rules.push({ allow: key === 'allow', pattern: value });
    }
  }
  const score = g => Math.max(-1, ...g.agents.map(a => a === '*' ? 0 : agent.toLowerCase().includes(a) ? a.length : -1));
  const best = Math.max(-1, ...groups.map(score));
  const selected = groups.filter(g => score(g) === best && best >= 0);
  const rules = selected.flatMap(g => g.rules).map(rule => {
    const end = rule.pattern.endsWith('$');
    const path = end ? rule.pattern.slice(0, -1) : rule.pattern;
    const escaped = path.split('*').map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*');
    return { ...rule, length: path.replaceAll('*', '').length, regex: new RegExp('^' + escaped + (end ? '$' : '')) };
  });
  return {
    delay: Math.max(0, ...selected.map(g => g.delay)),
    allowed(path) {
      const matches = rules.filter(r => r.regex.test(path)).sort((a, b) => b.length - a.length || Number(b.allow) - Number(a.allow));
      return matches[0]?.allow ?? true;
    },
  };
}
