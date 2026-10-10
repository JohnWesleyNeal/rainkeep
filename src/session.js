export const SAVE = "rainkeep.run.v1";
export const BEST = "rainkeep.best.v1";
export const CAMPAIGN = "rainkeep.campaign.v1";
export const NEW_BEST = "rainkeep.best.rules2";
export function createStorage(onUnavailable) {
  let warned = false;
  return {
    read(key) {
      try {
        return localStorage.getItem(key);
      } catch {
        return null;
      }
    },
    write(key, value) {
      try {
        localStorage.setItem(key, value);
      } catch {
        if (!warned) {
          warned = true;
          onUnavailable();
        }
      }
    },
  };
}
export function readBests(raw) {
  const result = { classic: 0, daydream: 0 };
  try {
    const data = JSON.parse(raw);
    for (const mode of Object.keys(result))
      if (Number.isFinite(data?.[mode]) && data[mode] >= 0)
        result[mode] = data[mode];
  } catch {}
  return result;
}
