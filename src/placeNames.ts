export interface PlaceName {
  name: string;
  region: string;
  resolved: boolean;
}

const cache = new Map<string, PlaceName>();

// Only explicit map selections trigger a lookup. Cache repeated selections.
export async function resolvePlaceName(lat: number, lon: number, signal: AbortSignal): Promise<PlaceName> {
  const key = `${lat.toFixed(4)},${lon.toFixed(4)}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const fallback = { name: "Selected location", region: "Place name unavailable", resolved: false };
  try {
    const params = new URLSearchParams({ lat: String(lat), lon: String(lon), lang: "en", limit: "1", radius: "5" });
    const response = await fetch(`https://photon.komoot.io/reverse?${params}`, {
      signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]),
    });
    if (!response.ok) return fallback;
    const json = await response.json();
    const properties = json.features?.[0]?.properties;
    if (!properties) return fallback;
    const locality = properties.city || properties.district || properties.county || properties.name;
    if (!locality) return fallback;
    const name = [...new Set([properties.district, locality].filter(Boolean))].join(", ");
    const region = [...new Set([properties.county, properties.state, properties.country].filter(Boolean))].join(", ");
    const place = { name, region: region || "Selected area", resolved: true };
    cache.set(key, place);
    return place;
  } catch {
    return fallback;
  }
}
