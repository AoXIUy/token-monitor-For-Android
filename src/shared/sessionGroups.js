'use strict';

(function expose(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.TokenMonitorSessionGroups = api;
})(typeof window !== 'undefined' ? window : null, function createSessionGroups() {
  function conversationIdentity(row) {
    if (row.t3ThreadId) return `t3:${row.t3ThreadId}`;
    return row.client === 'codex' && row.nativeSessionId ? `codex:${row.nativeSessionId}` : row.key;
  }

  // Presentation only: every accounting row belongs to exactly one family.
  // Callers supply keys and parentKey in the same namespace and retain their
  // own rendering, totals and activity policy.
  function sessionFamilies(rows, eligible = () => true) {
    const list = Array.isArray(rows) ? rows : [];
    const singleton = parent => ({ parent, members: [] });
    const identities = new Set();
    let needsGrouping = false;
    for (const row of list) {
      if (!eligible(row)) continue;
      const id = conversationIdentity(row);
      if (row.parentKey || identities.has(id)) { needsGrouping = true; break; }
      identities.add(id);
    }
    if (!needsGrouping) return list.map(singleton);
    const byKey = new Map(list.filter(eligible).map(row => [row.key, row]));
    // Resolve verified continuations through any visible accounting alias.
    const aliases = new Map();
    for (const row of byKey.values()) {
      const id = conversationIdentity(row);
      const previous = aliases.get(id);
      if (!previous || row.key.localeCompare(previous.key) < 0) aliases.set(id, row);
    }
    const parentLinks = new Map();
    const conflicts = new Set();
    for (const row of byKey.values()) {
      if (!row.parentKey) continue;
      const id = conversationIdentity(row);
      const parent = byKey.get(row.parentKey);
      const link = parent ? conversationIdentity(parent) : row.parentKey;
      if (link === id) continue;
      if (parentLinks.has(id) && parentLinks.get(id).link !== link) conflicts.add(id);
      else parentLinks.set(id, { link, parentKey: row.parentKey, subagentLabel: row.subagentLabel });
    }
    // Contradictory links do not justify collapsing otherwise equal identities.
    const canonical = row => conflicts.has(conversationIdentity(row)) ? row : aliases.get(conversationIdentity(row));
    const rootOf = row => {
      const seen = new Set();
      let current = canonical(row);
      while (!seen.has(current.key)) {
        const parentKey = conflicts.has(conversationIdentity(current)) ? current.parentKey
          : parentLinks.get(conversationIdentity(current))?.parentKey;
        if (!parentKey) break;
        seen.add(current.key);
        const parent = byKey.get(parentKey);
        if (!parent) break;
        const next = canonical(parent);
        if (seen.has(next.key)) return canonical(row);
        current = next;
      }
      return current;
    };
    const children = new Map();
    const grouped = new Set();
    for (const row of byKey.values()) {
      const parent = rootOf(row);
      if (parent.key === row.key) continue;
      if (!children.has(parent.key)) children.set(parent.key, []);
      children.get(parent.key).push(row);
      grouped.add(row.key);
    }
    return list.filter(row => !grouped.has(row?.key)).map(parent => {
      if (!children.has(parent?.key)) return singleton(parent);
      return {
        parent,
        members: children.get(parent.key),
        splitIdentity: conflicts.has(conversationIdentity(parent)),
        rootSubagentLabel: conflicts.has(conversationIdentity(parent)) ? undefined
          : parentLinks.get(conversationIdentity(parent))?.subagentLabel,
      };
    });
  }

  return { conversationIdentity, sessionFamilies };
});
