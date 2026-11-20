# Convierte a JSON los Excel descargados del geoportal de la UPME, de PARATEC y de XM.
# Algunos de estos archivos traen rutas absolutas dentro del .xlsx que exceljs no abre; openpyxl sí.
#   python3 server/etl/fuentes_xlsx.py data/raw/fuentes data/raw
# Entradas (en data/raw/fuentes):
#   upme_proyectos_generacion_xm.xlsx    geoportal UPME, capa proyectos_generacion_xm (plantas con coordenadas)
#   upme_subestaciones_construidas.xlsx  geoportal UPME, capa sistema_transmision_subestaciones_construidas
#   paratec_agpe.xlsx                    PARATEC (XM), detalle de autogeneradores a pequeña escala
#   xm_listado_recursos_agpe.xlsx        XM, listado de recursos AGPE con Id del ASIC
# Salidas (en data/raw): upme_plantas.json, upme_subestaciones.json, paratec_agpe.json
import datetime
import json
import os
import sys

import openpyxl

SRC = sys.argv[1] if len(sys.argv) > 1 else 'data/raw/fuentes'
OUT = sys.argv[2] if len(sys.argv) > 2 else 'data/raw'


def hoja(nombre):
    p = os.path.join(SRC, nombre)
    if not os.path.exists(p):
        return None
    return list(openpyxl.load_workbook(p, read_only=True, data_only=True).worksheets[0].iter_rows(values_only=True))


def txt(v):
    return '' if v is None else str(v).strip()


def num(v):
    if v is None or v == '':
        return None
    try:
        return float(str(v).replace(',', '.'))
    except ValueError:
        return None


def fecha(v):
    if isinstance(v, datetime.datetime):
        return v.date().isoformat()
    s = txt(v)
    parts = s.split('/')
    if len(parts) == 3 and all(x.isdigit() for x in parts):
        d, m, y = parts
        return f'{int(y):04d}-{int(m):02d}-{int(d):02d}'
    return s or None


def tabla(rows, clave):
    """Ubica la fila de encabezados (la que contiene `clave`) y devuelve meta + filas como diccionarios."""
    meta = {}
    for i, r in enumerate(rows):
        vals = [txt(c) for c in r]
        if clave in vals:
            head = vals
            out = []
            for r2 in rows[i + 1:]:
                if all(c is None or txt(c) == '' for c in r2):
                    continue
                out.append({h: r2[j] for j, h in enumerate(head) if h})
            return meta, out
        if vals and vals[0] and len(vals) > 1 and vals[1]:
            meta[vals[0]] = vals[1]
    raise SystemExit(f'No se encontró el encabezado "{clave}"')


def guardar(nombre, data):
    with open(os.path.join(OUT, nombre), 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, separators=(',', ':'))
    n = len(data.get('items', []))
    print(f'{nombre}: {n} registros')


rows = hoja('upme_proyectos_generacion_xm.xlsx')
if rows:
    meta, filas = tabla(rows, 'codigo_sic')
    items = []
    for r in filas:
        lat, lon = num(r.get('latitud_wgs84')), num(r.get('longitud_wgs84'))
        if lat is None or lon is None:
            continue
        items.append({
            'sic': txt(r.get('codigo_sic')), 'n': txt(r.get('nombre_recurso')), 'mw': num(r.get('capacidad_efectiva_neta_mw')) or 0,
            'menor': txt(r.get('es_menor')) == 'SI', 'despacho': txt(r.get('tipo_despacho')), 'comb': txt(r.get('combustible_defecto')),
            'desde': fecha(r.get('fecha_operacion')), 'agente': txt(r.get('agente_representante')), 'estado': txt(r.get('estado_recurso')),
            'tipo': txt(r.get('tipo_generacion')), 'clas': txt(r.get('clasificacion')), 'mun': txt(r.get('municipio_oficial')),
            'code': txt(r.get('cod_mpio')).zfill(5), 'dpto': txt(r.get('departamento_oficial')), 'lat': round(lat, 6), 'lon': round(lon, 6),
        })
    guardar('upme_plantas.json', {'fuente': meta.get('Fuente'), 'consulta': meta.get('Consulta'), 'items': items})

rows = hoja('upme_subestaciones_construidas.xlsx')
if rows:
    meta, filas = tabla(rows, 'nombre_subestacion')
    items = []
    for r in filas:
        lon, lat = num(r.get('este')), num(r.get('norte'))
        if lat is None or lon is None:
            continue
        items.append({
            'n': txt(r.get('nombre_subestacion')), 'kv': num(r.get('tension')), 'sistema': txt(r.get('sistema')).split(' ')[0],
            'tipo': txt(r.get('tipo_subestacion')), 'config': txt(r.get('configuracion')), 'prop': txt(r.get('nombre_propietario')),
            'mun': txt(r.get('municipio')), 'code': txt(r.get('cod_mpio')).zfill(5), 'dpto': txt(r.get('departamento')),
            'desde': fecha(r.get('fecha_operacion')), 'lat': round(lat, 6), 'lon': round(lon, 6),
        })
    guardar('upme_subestaciones.json', {'fuente': meta.get('Fuente'), 'consulta': meta.get('Consulta'), 'items': items})

rows = hoja('paratec_agpe.xlsx')
if rows:
    corte = next((txt(c) for r in rows[:6] for c in r if txt(c).startswith('Fecha generación')), '')
    _, filas = tabla(rows, 'Nombre')
    # Id del ASIC y combustible del listado de recursos de XM, cruzados por nombre
    ids = {}
    lr = hoja('xm_listado_recursos_agpe.xlsx')
    if lr:
        _, rec = tabla(lr, 'Nombre AGPE')
        for r in rec:
            ids[' '.join(txt(r.get('Nombre AGPE')).upper().split())] = (txt(r.get('Id asignado por el ASIC')), txt(r.get('Combustible')))
    items = []
    for r in filas:
        n = txt(r.get('Nombre'))
        if not n:
            continue
        idc = ids.get(' '.join(n.upper().split()), ('', ''))
        items.append({
            'n': n, 'op': txt(r.get('Operador')), 'estado': txt(r.get('Estado')), 'desde': fecha(r.get('Fecha de puesta en operación FPO')),
            'tipo': txt(r.get('Tipo de generación')) or idc[1], 'mw': num(r.get('Capacidad instalada o nominal [MW]')) or num(r.get('Potencia máxima declarada [MW]')) or 0,
            'dpto': txt(r.get('Departamento')), 'mun': txt(r.get('Municipio')), 'subarea': txt(r.get('Subárea operativa')).replace('SubArea ', ''), 'asic': idc[0],
        })
    guardar('paratec_agpe.json', {'fecha': corte.replace('Fecha generación:', '').strip(), 'recursos_xm': len(ids), 'items': items})
