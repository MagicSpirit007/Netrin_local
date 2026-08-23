# Netrin offline map package

Put the campus PMTiles basemap here:

```text
public/maps/donghu-campus.pmtiles
```

Runtime URL:

```text
/maps/donghu-campus.pmtiles
```

Source plan:

- Basemap: Protomaps / OpenStreetMap vector PMTiles.
- Bounding box: `119.6900,30.2250,119.7750,30.2950`.
- Generated max zoom: `15` for the current Protomaps source build.
- Current package size: about `1.7 MB`.
- PWA cache budget: keep the package under `80 MB`.
- Attribution: OpenStreetMap attribution must remain visible in the MapLibre map.

If this file is missing or damaged, `NetrinMap` falls back to the built-in
offline dark canvas so the route and stop overlays do not blank out.
