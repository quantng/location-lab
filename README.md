# Location Lab

A drag-and-drop workbench for spatial data and location analytics, built for the **Locational AI, Mapping and Geospatial Business (LMGB)** course at MDI Gurgaon.

**Open it:** https://quantng.github.io/location-lab/ — nothing to install.

**Watch first:** https://quantng.github.io/location-lab/explainer/ (animated explainer, 14 steps) · video: `explainer/Location-Analytics-Animated.mp4`

**Lab manual:** https://quantng.github.io/location-lab/lab/

Everything runs in your browser and files you upload never leave your laptop.

## What it does

Pick a geography (India · Gurugram or Singapore), then either follow a **guided recipe** or use **free play**. Drag blocks into the pipeline, press **Run**, and watch the map, charts and tables update.

| Family | Blocks |
|---|---|
| Data | Load sample data (GeoJSON, GeoParquet, FlatGeobuf, COG), upload your file, explore, colour, download |
| Spatial data | Nearest to a point, SQL (DuckDB in the browser), box filter then distance, spatial join, H3 hexagons, heatmap, NDVI zonal statistics |
| Neighbours | Spatial weights (k-nearest, distance band, queen contiguity, H3 contiguity), spatial lag |
| Patterns | Point pattern test (Clark–Evans, Ripley's L), global Moran's I |
| Hotspots & clusters | Local Moran (LISA), Getis-Ord Gi*, DBSCAN |
| Surfaces | Raster sampling, IDW, ordinary kriging with uncertainty |
| Explain | Distance features, OLS with residual Moran's I, spatial lag model, spatial error model, GWR |

## Data

Every vector dataset ships in three formats so you can compare them: GeoJSON, GeoParquet and FlatGeobuf. Rasters are Cloud-Optimised GeoTIFFs.

**India (Gurugram):** 459 cafés and restaurants and 275 NCR metro stations (OpenStreetMap), 25 NCR districts (geoBoundaries), the MDI campus outline (OpenStreetMap), and Sentinel-2 NDVI around MDI on 25 Oct 2024 (Earth Search, AWS Open Data).

**Singapore:** HDB resale prices aggregated to blocks for the last 12 months (data.gov.sg, geocoded with OneMap), MRT and LRT stations (sgraildata), hawker centres (NEA, data.gov.sg), URA Master Plan 2019 planning areas (data.gov.sg), the Singapore Botanic Gardens outline (OpenStreetMap), and Sentinel-2 NDVI on 5 Dec 2025.

## Checked against standard tools

Moran's I, Gi*, OLS, the spatial lag and spatial error models were checked against PySAL (esda, spreg); GWR against mgwr at the same bandwidth.

Data © their providers: OpenStreetMap contributors (ODbL), geoBoundaries (CC BY 4.0), Singapore Open Data Licence, Copernicus Sentinel data. Basemap © OpenFreeMap, OpenMapTiles, OpenStreetMap.
