"""Lecture locale JSON, CSV/TSV ou premier onglet XLSX, bibliothèque standard uniquement.
Aucun accès réseau. Les cellules numériques des numéros doivent porter un format 00.
"""
import csv
import io
import json
import re
import sys
import unicodedata
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path

NS = {'s': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}

def key(value):
    return ''.join(c for c in unicodedata.normalize('NFKD', str(value).lower()) if not unicodedata.combining(c)).strip()

ALIASES = {'appartement':'num','numero':'num','num':'num','etage':'etage','type':'type','locataire':'locataire','loyer da':'loyer','loyer':'loyer'}

def read_rows(path):
    path = Path(path)
    if path.suffix.lower() == '.json':
        return json.loads(path.read_text(encoding='utf-8-sig'))
    numeric_cells = {}
    if path.suffix.lower() == '.xlsx':
        with zipfile.ZipFile(path) as z:
            shared = []
            if 'xl/sharedStrings.xml' in z.namelist():
                shared = [''.join(si.itertext()) for si in ET.fromstring(z.read('xl/sharedStrings.xml')).findall('s:si', NS)]
            styles = []
            if 'xl/styles.xml' in z.namelist():
                root = ET.fromstring(z.read('xl/styles.xml'))
                formats = {x.attrib['numFmtId']:x.attrib['formatCode'] for x in root.findall('s:numFmts/s:numFmt', NS)}
                styles = [formats.get(x.attrib.get('numFmtId'), '') for x in root.findall('s:cellXfs/s:xf', NS)]
            book = ET.fromstring(z.read('xl/workbook.xml'))
            first = book.find('s:sheets/s:sheet', NS)
            rid = first.attrib['{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id']
            rels = ET.fromstring(z.read('xl/_rels/workbook.xml.rels'))
            target = next(r.attrib['Target'] for r in rels if r.attrib['Id'] == rid)
            target = target.lstrip('/') if target.startswith('/') else 'xl/' + target
            sheet = ET.fromstring(z.read(target))
            matrix = []
            for row in sheet.findall('s:sheetData/s:row', NS):
                values = {}
                for cell in row.findall('s:c', NS):
                    ref = cell.attrib['r']
                    index = 0
                    for c in re.match(r'[A-Z]+', ref)[0]: index = index * 26 + ord(c)-64
                    kind = cell.attrib.get('t')
                    if cell.find('s:f', NS) is not None: raise ValueError('Formule XLSX interdite : ' + ref)
                    node = cell.find('s:v', NS)
                    value = node.text if node is not None else ''
                    if kind == 's': value = shared[int(value)]
                    elif kind == 'inlineStr': value = ''.join(cell.find('s:is', NS).itertext())
                    elif kind in ('b','e'): raise ValueError('Cellule booléenne/erreur interdite : ' + ref)
                    elif value:
                        numeric_cells[(len(matrix), index-1)] = True
                        style = int(cell.attrib.get('s', '0'))
                        if style < len(styles) and re.fullmatch(r'0{2,}', styles[style]) and value.isdigit():
                            value = value.zfill(len(styles[style]))
                            numeric_cells.pop((len(matrix), index-1), None)
                    values[index-1] = value or ''
                matrix.append([values.get(i, '') for i in range(max(values, default=-1)+1)])
    else:
        content = path.read_text(encoding='utf-8-sig')
        dialect = csv.Sniffer().sniff(content[:8192], delimiters=';,\t')
        matrix = list(csv.reader(io.StringIO(content), dialect))
    indexed = [(i, r) for i, r in enumerate(matrix) if any(r)]
    if not indexed: raise ValueError('Fichier vide')
    headers = [ALIASES.get(key(h)) for h in indexed[0][1]]
    required = {'num','type','etage','locataire','loyer'}
    if not required.issubset(headers) or any(headers.count(h) != 1 for h in required):
        raise ValueError('Colonnes requises : Appartement, Étage, Type, Locataire, Loyer DA')
    result = []
    for i, row in indexed[1:]:
        item = {field:row[j] if j < len(row) else '' for j, field in enumerate(headers) if field}
        if (i, headers.index('num')) in numeric_cells:
            raise ValueError('Numéro numérique sans format textuel/00 : ligne ' + str(i+1))
        item['loyer'] = str(item['loyer']).replace(',', '.')
        result.append(item)
    return result

if __name__ == '__main__':
    try:
        print(json.dumps(read_rows(sys.argv[1]), ensure_ascii=False))
    except Exception as exc:
        print('Lecture refusée : ' + str(exc), file=sys.stderr)
        sys.exit(1)
