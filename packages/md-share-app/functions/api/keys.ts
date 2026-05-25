// /api/keys — returns MapTiler + OpenRouteService keys for the browser map renderer.
// Keys are referrer-restricted in their respective dashboards; serving them
// publicly via this endpoint is the intended design.
// Cached 1 day at the edge so rotation requires a manual cache purge.

interface Env {
  MAPTILER_KEY: string;
  ORS_KEY: string;
}

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  return new Response(
    JSON.stringify({
      maptiler: env.MAPTILER_KEY || "",
      ors: env.ORS_KEY || "",
    }),
    {
      headers: {
        'content-type': 'application/json',
        'cache-control': 'public, max-age=86400, s-maxage=86400',
      },
    }
  );
};
