/** WeatherAPI participant of the sequence diagram: current conditions from Open-Meteo (free, no key). */
const CACHE = new Map();
const TTL_MS = 10 * 60 * 1000;

async function getLocalWeather(location) {
  const lat = location?.latitude;
  const lon = location?.longitude;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return { available: false, reason: 'This plant has no coordinates yet' };
  const key = `${lat.toFixed(2)},${lon.toFixed(2)}`;
  const hit = CACHE.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,cloud_cover,wind_speed_10m&wind_speed_unit=ms`;
    const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const { current: c } = await res.json();
    const value = { available: true, source: 'Open-Meteo', observedAt: c.time, temperature: c.temperature_2m, humidity: c.relative_humidity_2m, cloudCover: c.cloud_cover, windSpeed: c.wind_speed_10m };
    CACHE.set(key, { at: Date.now(), value });
    return value;
  } catch {
    return { available: false, reason: 'Weather service unreachable' };
  }
}

module.exports = { getLocalWeather };
