# Isolíneas reales de radiación solar (GHI, kWh/m²/día) a partir de los 1.122 municipios de Radar Solar
# Uso: python3 server/etl/isolineas.py . web/public/isolineas.svg  (requiere numpy, scipy, matplotlib y shapely)
import json, sys, numpy as np
from scipy.interpolate import griddata
from scipy.ndimage import gaussian_filter
from matplotlib.path import Path
import matplotlib; matplotlib.use('Agg')
import matplotlib.pyplot as plt
root = sys.argv[1]; out = sys.argv[2]
m = json.load(open(f'{root}/data/built/municipios.json'))
pts = np.array([[x['lon'], x['lat']] for x in m if x.get('ghi')]); val = np.array([x['ghi'] for x in m if x.get('ghi')])
geo = json.load(open(f'{root}/data/built/geo_dptos.json'))
polys = []
for f in geo['features']:
    g = f['geometry']; rings = [g['coordinates']] if g['type'] == 'Polygon' else g['coordinates']
    for r in rings: polys.append(np.array(r[0]))
lon0, lon1, lat0, lat1 = -79.2, -66.7, -4.4, 12.6
W = 560; H = int(W * (lat1 - lat0) / (lon1 - lon0) * 1.0)
gx, gy = np.meshgrid(np.linspace(lon0, lon1, W), np.linspace(lat1, lat0, H))
z = griddata(pts, val, (gx, gy), method='linear')
zn = griddata(pts, val, (gx, gy), method='nearest'); z = np.where(np.isnan(z), zn, z)
z = gaussian_filter(z, 7)
inside = np.zeros(gx.shape, bool); P = np.c_[gx.ravel(), gy.ravel()]
for p in polys: inside |= Path(p).contains_points(P).reshape(gx.shape)
levels = np.arange(3.8, 5.81, 0.1)
cs = plt.contour(np.arange(W), np.arange(H), np.where(inside, z, np.nan), levels=levels)
def fmt(v): return f'{v:.1f}'
paths = []
for lv, segs in zip(cs.levels, cs.allsegs):
    for s in segs:
        if len(s) < 6: continue
        d = 'M' + 'L'.join(f'{fmt(x)} {fmt(y)}' for x, y in s[::2])
        major = abs(lv * 2 - round(lv * 2)) < 1e-6
        cls = ('hi' if lv >= 5.35 else 'mj' if major else 'mn')
        paths.append(f'<path d="{d}" class="{cls}" data-ghi="{lv:.1f}"/>')
outline = []
try:
    from shapely.geometry import Polygon
    from shapely.ops import unary_union
    u = unary_union([Polygon(p).buffer(0) for p in polys]).simplify(0.02)
    geoms = getattr(u, 'geoms', [u])
    polys_out = [np.array(g.exterior.coords) for g in geoms if g.area > 0.05]
except Exception:
    polys_out = polys
for p in polys_out:
    xs = (p[:, 0] - lon0) / (lon1 - lon0) * (W - 1); ys = (lat1 - p[:, 1]) / (lat1 - lat0) * (H - 1)
    outline.append('M' + 'L'.join(f'{fmt(x)} {fmt(y)}' for x, y in zip(xs, ys)) + 'Z')
top = m[int(np.argmax([x.get('ghi') or 0 for x in m]))]
tx = (top['lon'] - lon0) / (lon1 - lon0) * (W - 1); ty = (lat1 - top['lat']) / (lat1 - lat0) * (H - 1)
svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" fill="none" stroke-linecap="round" stroke-linejoin="round">
<!-- Isolíneas de radiación solar global horizontal (kWh/m²/día) interpoladas de los municipios de Radar Solar; contorno departamental DANE. Máximo: {top['name']}, {top['dpto']} ({top['ghi']:.2f}). -->
<style>.mn{{stroke:#8FA6FF;stroke-opacity:.30;stroke-width:.75}}.mj{{stroke:#BFCDFF;stroke-opacity:.55;stroke-width:1.1}}.hi{{stroke:#FFA24D;stroke-opacity:.75;stroke-width:1.1}}.ol{{stroke:#E4E9F7;stroke-opacity:.45;stroke-width:1.2}}</style>
<path class="ol" d="{' '.join(outline)}"/>
{chr(10).join(paths)}
<circle cx="{tx:.1f}" cy="{ty:.1f}" r="5" fill="#FF7A00" stroke="none"/>
</svg>'''
open(out, 'w').write(svg)
print(W, H, len(paths), 'paths', round(len(svg)/1024), 'KB', top['name'], f'{tx:.0f},{ty:.0f}')
