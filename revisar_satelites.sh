#!/usr/bin/env bash
# Revisa (solo lectura) en qué satélite está cada persona del equipo y cuántas emprendedoras hay por satélite y municipio.
# Lee Firestore con la sesión de Google Cloud Shell; no cambia nada y no muestra cédulas, correos ni celulares.
# Uso (en Cloud Shell, dentro de la carpeta del repositorio):  bash revisar_satelites.sh
set -euo pipefail
PROYECTO=cic-caribe
TOKEN=$(gcloud auth print-access-token)
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
leer() { # leer coleccion archivo: descarga todos los documentos (con paginación)
  local pagina="" n=0
  while :; do
    curl -s -H "Authorization: Bearer $TOKEN" \
      "https://firestore.googleapis.com/v1/projects/$PROYECTO/databases/(default)/documents/$1?pageSize=300${pagina:+&pageToken=$pagina}" > "$TMP/$1_$n.json"
    pagina=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1])).get("nextPageToken",""))' "$TMP/$1_$n.json")
    n=$((n+1)); [ -z "$pagina" ] && break
  done
}
leer directorio
leer perfiles
python3 - "$TMP" <<'PY'
import json, sys, glob, collections
def docs(nombre):
    for f in sorted(glob.glob(f"{sys.argv[1]}/{nombre}_*.json")):
        for d in json.load(open(f)).get("documents", []):
            yield {k: list(v.values())[0] for k, v in d.get("fields", {}).items()}
SAT = {"la-guajira": "La Guajira", "magdalena": "Magdalena", "valledupar": "Valledupar", "pueblo-bello": "Pueblo Bello",
       "atlantico": "Atlántico", "bolivar": "Bolívar", "sucre": "Sucre", "cordoba": "Córdoba"}
equipo = collections.defaultdict(list)
for d in docs("directorio"):
    roles = [(d.get("rol"), d)] + [(r, x if isinstance(x, dict) else {}) for r, x in (d.get("otros_roles") or {}).items()]
    for rol, x in roles:
        if rol != "dinamizadora": continue
        sat = (x.get("satelite") if isinstance(x, dict) else None) or d.get("satelite")
        if isinstance(sat, dict): sat = None
        equipo[sat or "sin-satelite"].append(f'{d.get("nombre")} · {x.get("cargo") or d.get("cargo") or ""}')
print("\n=== Dinamizadoras por satélite (directorio) ===")
for s in list(SAT) + ["sin-satelite"]:
    lista = equipo.get(s, [])
    print(f"\n{SAT.get(s, 'SIN SATÉLITE')}: {len(lista)}")
    for x in sorted(lista): print("   -", x)
emp = collections.Counter(); muni = collections.Counter()
for p in docs("perfiles"):
    if p.get("rol") == "emprendedora":
        emp[p.get("satelite") or "sin-satelite"] += 1
        if p.get("departamento") == "Cesar": muni[p.get("municipio") or "sin municipio"] += 1
print("\n=== Emprendedoras inscritas por satélite ===")
for s in list(SAT) + ["sin-satelite"]:
    if emp.get(s): print(f"   {SAT.get(s, 'Sin satélite')}: {emp[s]}")
print("\nEmprendedoras del Cesar por municipio:", dict(muni) or "ninguna")
PY
