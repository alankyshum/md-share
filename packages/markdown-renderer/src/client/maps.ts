interface MapStop { lng: number; lat: number; label?: string; }
interface MapDay { color: string; profile?: 'driving-car'|'foot-walking'|'cycling-regular'; stops: MapStop[]; }
interface MapSpec {
  height?: number;
  center?: [number, number];
  zoom?: number;
  days: MapDay[];
}

interface Keys { maptiler: string; ors: string; }

let keysPromise: Promise<Keys> | null = null;
function loadKeys(): Promise<Keys> {
  if (!keysPromise) {
    keysPromise = fetch('/api/keys')
      .then(r => {
        if (!r.ok) throw new Error(`/api/keys returned ${r.status}`);
        return r.json() as Promise<Keys>;
      })
      .catch(err => {
        keysPromise = null;
        throw err;
      });
  }
  return keysPromise;
}

export async function replaceMapBlocks(target: HTMLElement, dark: boolean): Promise<void> {
  const blocks = target.querySelectorAll<HTMLElement>('.custom-map');
  if (blocks.length === 0) return;

  const [{ default: maplibregl }, yaml, keys] = await Promise.all([
    import('maplibre-gl'),
    import('js-yaml'),
    loadKeys(),
  ]);

  if (!document.querySelector('link[data-maplibre-css]')) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://unpkg.com/maplibre-gl@^4/dist/maplibre-gl.css';
    link.setAttribute('data-maplibre-css', '');
    document.head.appendChild(link);
  }

  for (const block of Array.from(blocks)) {
    if (block.querySelector('.maplibregl-map')) continue;

    let spec: MapSpec;
    try {
      const raw = decodeURIComponent(block.getAttribute('data-source') || '');
      spec = yaml.load(raw) as MapSpec;
      if (!spec || !Array.isArray(spec.days) || spec.days.length === 0) {
        throw new Error('missing days[]');
      }
    } catch (e) {
      block.textContent = '';
      const pre = document.createElement('pre');
      pre.style.cssText = 'color:#c33;padding:0.5rem;white-space:pre-wrap;';
      pre.textContent = `map parse error: ${(e as Error).message}`;
      block.appendChild(pre);
      continue;
    }

    const height = spec.height ?? 400;
    block.style.cssText = `height:${height}px;width:100%;`;

    const styleName = dark ? 'streets-v2-dark' : 'streets-v2';
    const style = `https://api.maptiler.com/maps/${styleName}/style.json?key=${keys.maptiler}`;

    const map = new maplibregl.Map({
      container: block,
      style,
      center: spec.center ?? [0, 0],
      zoom: spec.zoom ?? 2,
    });

    map.addControl(new maplibregl.NavigationControl(), 'top-right');

    map.on('load', async () => {
      const allCoords: [number, number][] = [];

      for (let d = 0; d < spec.days.length; d++) {
        const day = spec.days[d];
        const profile = day.profile ?? 'driving-car';
        const coords: [number, number][] = day.stops.map(s => [s.lng, s.lat]);
        allCoords.push(...coords);

        for (const stop of day.stops) {
          const el = document.createElement('div');
          el.style.cssText = `width:18px;height:18px;border-radius:50%;background:${day.color};border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,0.4);cursor:pointer;`;
          const marker = new maplibregl.Marker({ element: el })
            .setLngLat([stop.lng, stop.lat])
            .addTo(map);
          if (stop.label) {
            marker.setPopup(new maplibregl.Popup({ offset: 14 }).setText(stop.label));
            el.addEventListener('mouseenter', () => { el.style.cursor = 'pointer'; });
          }
        }

        const layerId = `day-${d}-route`;
        let routeGeoJSON: any;
        let fallback = false;

        if (coords.length >= 2) {
          try {
            const resp = await fetch(
              `https://api.openrouteservice.org/v2/directions/${profile}/geojson`,
              {
                method: 'POST',
                headers: {
                  'Authorization': keys.ors,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({ coordinates: coords }),
              }
            );
            if (!resp.ok) throw new Error(`ORS ${resp.status}`);
            interface ORSResponse {
              features?: Array<{ geometry?: unknown; properties?: unknown; type?: string }>;
              type?: string;
              geometry?: unknown;
            }
            const data = (await resp.json()) as ORSResponse;
            routeGeoJSON = data.features?.[0] ?? data;
            if (!routeGeoJSON?.geometry) throw new Error('ORS returned no geometry');
          } catch (e) {
            console.warn(`[md-share] day ${d} ORS routing failed, falling back to straight line:`, e);
            fallback = true;
            routeGeoJSON = {
              type: 'Feature',
              geometry: { type: 'LineString', coordinates: coords },
              properties: {},
            };
          }

          map.addSource(layerId, { type: 'geojson', data: routeGeoJSON });
          map.addLayer({
            id: layerId,
            type: 'line',
            source: layerId,
            layout: { 'line-cap': 'round', 'line-join': 'round' },
            paint: {
              'line-color': day.color,
              'line-width': 4,
              ...(fallback ? { 'line-dasharray': [2, 2] } : {}),
            },
          });
        }
      }

      if (!spec.center && allCoords.length > 0) {
        const lngs = allCoords.map(c => c[0]);
        const lats = allCoords.map(c => c[1]);
        const bounds: [[number, number], [number, number]] = [
          [Math.min(...lngs), Math.min(...lats)],
          [Math.max(...lngs), Math.max(...lats)],
        ];
        map.fitBounds(bounds, { padding: 40, duration: 0 });
      }
    });
  }
}
