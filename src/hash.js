const crypto = require('crypto');

/** Deterministic hash of a JS value: sorts object keys so key order never
 * causes a false "stale" verdict in `check`. */
function stableHash(value) {
  const json = JSON.stringify(sortKeys(value));
  return crypto.createHash('sha256').update(json).digest('hex').slice(0, 16);
}

function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object') {
    return Object.keys(value)
      .sort()
      .reduce((acc, k) => {
        acc[k] = sortKeys(value[k]);
        return acc;
      }, {});
  }
  return value;
}

module.exports = { stableHash };
