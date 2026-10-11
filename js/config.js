// config.js — geographies, bundled datasets and guided recipes
export const GEO = {
  india: {
    name: 'India · Gurugram', center: [77.06, 28.46], zoom: 11.2,
    points: [
      { id: 'mdi', name: 'MDI Gurgaon campus centre', ll: [77.05850, 28.47229] },
      { id: 'cyberhub', name: 'Cyber Hub (business district)', ll: [77.0890, 28.4950] },
      { id: 'iffco', name: 'IFFCO Chowk metro', ll: [77.0723, 28.4722] },
    ],
    data: [
      { key: 'gurugram_cafes', name: 'Cafés & restaurants, Gurugram (OpenStreetMap)', kind: 'point', src: 'OpenStreetMap via Overpass, Oct 2026' },
      { key: 'ncr_metro_stations', name: 'Metro stations, Delhi NCR (OpenStreetMap)', kind: 'point', src: 'OpenStreetMap' },
      { key: 'ncr_districts', name: 'NCR districts (geoBoundaries)', kind: 'polygon', src: 'geoBoundaries IND ADM2' },
      { key: 'mdi_campus', name: 'MDI campus outline (OpenStreetMap)', kind: 'polygon', src: 'OSM way 23197218' },
      { key: 'mdi_ndvi_20241025', name: 'NDVI around MDI, Sentinel-2, 25 Oct 2024', kind: 'raster', src: 'Sentinel-2 L2A via Earth Search (AWS)', tif: true },
    ],
  },
  singapore: {
    name: 'Singapore', center: [103.83, 1.355], zoom: 10.8,
    points: [
      { id: 'raffles', name: 'Raffles Place MRT (CBD)', ll: [103.8515, 1.2840] },
      { id: 'orchard', name: 'Orchard MRT', ll: [103.8320, 1.3043] },
      { id: 'nus', name: 'NUS Kent Ridge', ll: [103.7764, 1.2966] },
      { id: 'sbg', name: 'Singapore Botanic Gardens', ll: [103.8159, 1.3138] },
    ],
    data: [
      { key: 'hdb_resale_blocks', name: 'HDB resale prices by block, last 12 months', kind: 'point', src: 'data.gov.sg HDB resale + OneMap geocoding' },
      { key: 'mrt_stations', name: 'MRT & LRT stations', kind: 'point', src: 'sgraildata (OpenStreetMap / LTA)' },
      { key: 'hawker_centres', name: 'Hawker centres (NEA)', kind: 'point', src: 'data.gov.sg NEA' },
      { key: 'planning_areas', name: 'URA planning areas (Master Plan 2019)', kind: 'polygon', src: 'data.gov.sg URA' },
      { key: 'botanic_gardens', name: 'Singapore Botanic Gardens outline', kind: 'polygon', src: 'OpenStreetMap way 47257476' },
      { key: 'botanic_gardens_ndvi_20251205', name: 'NDVI around the Botanic Gardens, Sentinel-2, 5 Dec 2025', kind: 'raster', src: 'Sentinel-2 L2A via Earth Search (AWS)', tif: true },
    ],
  },
};

const L = (dataset, format = 'geojson') => ({ b: 'load', p: { dataset, format } });
export const RECIPES = {
  india: [
    { id: 'i1', name: '1 · Spatial data in seven moves', why: 'Recap of the last session on one dataset: load, measure, filter, join, bin, smooth and read a satellite image.', steps: [
      { ...L('gurugram_cafes'), say: 'Load the 459 cafés and restaurants.' },
      { b: 'explore', p: { colour: 'type' }, say: 'Explore the table: fields, blanks, colour by type.' },
      { b: 'nearest', p: { point: 'mdi', k: 5 }, say: 'Nearest places to MDI, with 1, 3 and 5 km rings.' },
      { b: 'sql', say: 'Ask the same question in SQL.' },
      { b: 'boxdist', p: { point: 'mdi', km: 3 }, say: 'Box filter, then exact 3 km distance (150 → 124).' },
      { ...L('ncr_districts'), say: 'Load the NCR district outlines.' },
      { b: 'join', say: 'Spatial join: which district is each place in?' },
      { b: 'h3bin', p: { res: 8, zeros: 'no', extrude: 'yes' }, say: 'Bin into H3 hexagons and raise them in 3D.' },
      { b: 'heat', say: 'Smooth the points into a heatmap.' },
      { ...L('mdi_ndvi_20241025', 'tif'), say: 'Load the NDVI satellite raster (COG).' },
      { ...L('mdi_campus'), say: 'Load the MDI campus outline.' },
      { b: 'ndvi', p: { thr: 0.3 }, say: 'Zonal statistics: how green is the campus?' },
    ] },
    { id: 'i2', name: '2 · Neighbours and spatial lag', why: 'Before testing any pattern, decide who counts as a neighbour. Everything after this reuses that choice.', steps: [
      { ...L('gurugram_cafes'), say: 'Load the cafés.' },
      { b: 'h3bin', p: { res: 8, zeros: 'yes', extrude: 'no' }, say: 'Count cafés per hexagon, including empty hexagons.' },
      { b: 'weights', p: { method: 'h3' }, say: 'Build contiguity weights: each hexagon’s 6 touching cells. Click a hexagon to see them.' },
      { b: 'lag', p: { field: 'count' }, say: 'Spatial lag: the average café count of each hexagon’s neighbours.' },
    ] },
    { id: 'i3', name: '3 · Is the pattern random?', why: 'Compare the real cafés with what pure chance would give, at many distances.', steps: [
      { ...L('gurugram_cafes'), say: 'Load the cafés.' },
      { b: 'pattern', say: 'Nearest-neighbour ratio and Ripley’s L against 19 random patterns.' },
    ] },
    { id: 'i4', name: '4 · Autocorrelation and hotspots', why: 'Do busy hexagons sit next to busy hexagons? Where exactly are the significant hotspots?', steps: [
      { ...L('gurugram_cafes'), say: 'Load the cafés.' },
      { b: 'h3bin', p: { res: 8, zeros: 'yes', extrude: 'no' }, say: 'Count per hexagon, empty cells included.' },
      { b: 'weights', p: { method: 'h3' }, say: 'Contiguity weights.' },
      { b: 'moran', p: { field: 'count' }, say: 'Global Moran’s I with 999 random shuffles.' },
      { b: 'lisa', p: { field: 'count' }, say: 'Local Moran (LISA): hotspots, coldspots and outliers.' },
      { b: 'gistar', p: { field: 'count' }, say: 'Getis-Ord Gi*: hotspots at 90/95/99% confidence.' },
    ] },
    { id: 'i5', name: '5 · Clusters for territories', why: 'Group nearby outlets into market clusters and flag isolated ones.', steps: [
      { ...L('gurugram_cafes'), say: 'Load the cafés.' },
      { b: 'dbscan', p: { eps: 0.4, minpts: 6 }, say: 'DBSCAN: clusters of at least 6 places within 400 m.' },
    ] },
    { id: 'i6', name: '6 · From samples to surfaces', why: 'Estimate a value everywhere from a few samples, then check against the truth.', steps: [
      { ...L('mdi_ndvi_20241025', 'tif'), say: 'Load the NDVI raster: this is the truth.' },
      { b: 'sample', p: { n: 300 }, say: 'Keep only 300 random sample points.' },
      { b: 'idw', p: { field: 'value' }, say: 'IDW: rebuild the surface from the 300 samples.' },
      { b: 'krige', p: { field: 'value' }, say: 'Kriging: a surface plus its uncertainty.' },
    ] },
    { id: 'i7', name: '7 · What explains café density?', why: 'Regress café counts on access, then check whether space is still hiding in the errors.', steps: [
      { ...L('gurugram_cafes'), say: 'Load the cafés.' },
      { b: 'h3bin', p: { res: 8, zeros: 'yes', extrude: 'no' }, say: 'Count per hexagon.' },
      { ...L('ncr_metro_stations'), say: 'Load the metro stations.' },
      { b: 'distto', p: { to: 'layer', name: 'metro' }, say: 'Distance from each hexagon to its nearest metro station.' },
      { b: 'distto', p: { to: 'point', point: 'cyberhub', name: 'cyberhub' }, say: 'Distance to Cyber Hub, the business district.' },
      { b: 'weights', p: { method: 'h3' }, say: 'Contiguity weights.' },
      { b: 'ols', p: { y: 'count', xs: ['dist_metro_km', 'dist_cyberhub_km'] }, say: 'Ordinary regression, then Moran’s I on its residuals.' },
      { b: 'slm', p: { y: 'count', xs: ['dist_metro_km', 'dist_cyberhub_km'] }, say: 'Spatial lag model (spillover).' },
      { b: 'sem', p: { y: 'count', xs: ['dist_metro_km', 'dist_cyberhub_km'] }, say: 'Spatial error model (clustered missing factors).' },
      { b: 'gwr', p: { y: 'count', xs: ['dist_metro_km', 'dist_cyberhub_km'] }, say: 'GWR: does the metro effect change across the city?' },
    ] },
  ],
  singapore: [
    { id: 's1', name: '1 · Spatial data in seven moves', why: 'The same seven moves on Singapore’s hawker centres, URA planning areas and a Sentinel-2 image of the Botanic Gardens.', steps: [
      { ...L('hawker_centres'), say: 'Load the hawker centres.' },
      { b: 'explore', say: 'Explore the table.' },
      { b: 'nearest', p: { point: 'raffles', k: 5 }, say: 'Nearest hawker centres to Raffles Place.' },
      { b: 'sql', say: 'Ask the same question in SQL.' },
      { b: 'boxdist', p: { point: 'orchard', km: 2 }, say: 'Box filter, then exact 2 km around Orchard.' },
      { ...L('planning_areas'), say: 'Load the 55 URA planning areas.' },
      { b: 'join', say: 'Spatial join: planning area of each hawker centre.' },
      { b: 'h3bin', p: { res: 7, zeros: 'no', extrude: 'yes' }, say: 'H3 hexagons in 3D.' },
      { b: 'heat', say: 'Heatmap.' },
      { ...L('botanic_gardens_ndvi_20251205', 'tif'), say: 'Load the NDVI raster (COG).' },
      { ...L('botanic_gardens'), say: 'Load the Botanic Gardens outline.' },
      { b: 'ndvi', p: { thr: 0.3 }, say: 'Zonal statistics for the Gardens.' },
    ] },
    { id: 's2', name: '2 · Neighbours and spatial lag', why: 'Each HDB block’s neighbours are its 8 nearest blocks. Lag = their average price.', steps: [
      { ...L('hdb_resale_blocks', 'parquet'), say: 'Load HDB resale blocks (GeoParquet).' },
      { b: 'weights', p: { method: 'knn', k: 8 }, say: '8-nearest-neighbour weights. Click a block to see its neighbours.' },
      { b: 'lag', p: { field: 'price_psm' }, say: 'Spatial lag of price per m².' },
    ] },
    { id: 's3', name: '3 · Is the pattern random?', why: 'Are hawker centres clustered, spread out, or random across the island?', steps: [
      { ...L('hawker_centres'), say: 'Load the hawker centres.' },
      { b: 'pattern', say: 'Nearest-neighbour ratio and Ripley’s L.' },
    ] },
    { id: 's4', name: '4 · Autocorrelation and hotspots', why: 'Where are prices significantly high or low, given their neighbours?', steps: [
      { ...L('hdb_resale_blocks', 'parquet'), say: 'Load HDB resale blocks.' },
      { b: 'weights', p: { method: 'knn', k: 8 }, say: '8-nearest-neighbour weights.' },
      { b: 'moran', p: { field: 'price_psm' }, say: 'Global Moran’s I.' },
      { b: 'lisa', p: { field: 'price_psm' }, say: 'LISA clusters and outliers.' },
      { b: 'gistar', p: { field: 'price_psm' }, say: 'Gi* hotspots.' },
    ] },
    { id: 's5', name: '5 · Clusters for territories', why: 'DBSCAN finds HDB estates from block locations alone.', steps: [
      { ...L('hdb_resale_blocks', 'parquet'), say: 'Load HDB resale blocks.' },
      { b: 'dbscan', p: { eps: 0.25, minpts: 12 }, say: 'DBSCAN: 12+ blocks within 250 m.' },
    ] },
    { id: 's6', name: '6 · From samples to surfaces', why: 'A continuous price surface from block-level sales.', steps: [
      { ...L('hdb_resale_blocks', 'parquet'), say: 'Load HDB resale blocks.' },
      { b: 'idw', p: { field: 'price_psm', cell: 300 }, say: 'IDW price surface.' },
      { b: 'krige', p: { field: 'price_psm', cell: 400 }, say: 'Kriging surface and its uncertainty.' },
    ] },
    { id: 's7', name: '7 · What explains resale prices?', why: 'Does price per m² rise near MRT, hawker centres and the CBD, and is that effect the same island-wide?', steps: [
      { ...L('hdb_resale_blocks', 'parquet'), say: 'Load HDB resale blocks.' },
      { ...L('mrt_stations'), say: 'Load MRT & LRT stations.' },
      { b: 'distto', p: { to: 'layer', name: 'mrt' }, say: 'Distance from each block to the nearest station.' },
      { ...L('hawker_centres'), say: 'Load hawker centres.' },
      { b: 'distto', p: { to: 'layer', name: 'hawker' }, say: 'Distance to the nearest hawker centre.' },
      { b: 'distto', p: { to: 'point', point: 'raffles', name: 'cbd' }, say: 'Distance to Raffles Place (CBD).' },
      { b: 'weights', p: { method: 'knn', k: 8 }, say: '8-nearest-neighbour weights.' },
      { b: 'ols', p: { y: 'price_psm', xs: ['dist_mrt_km', 'dist_hawker_km', 'dist_cbd_km', 'lease_start', 'storey_mid'] }, say: 'Ordinary regression and residual Moran’s I.' },
      { b: 'slm', p: { y: 'price_psm', xs: ['dist_mrt_km', 'dist_hawker_km', 'dist_cbd_km', 'lease_start', 'storey_mid'] }, say: 'Spatial lag model.' },
      { b: 'sem', p: { y: 'price_psm', xs: ['dist_mrt_km', 'dist_hawker_km', 'dist_cbd_km', 'lease_start', 'storey_mid'] }, say: 'Spatial error model.' },
      { b: 'gwr', p: { y: 'price_psm', xs: ['dist_mrt_km', 'dist_cbd_km', 'lease_start'], sample: 1500 }, say: 'GWR: where does MRT access matter most?' },
    ] },
  ],
};
