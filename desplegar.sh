#!/usr/bin/env bash
# Publica la Cloud Function «cicAcceso» desde Google Cloud Shell sin escribir ninguna clave a mano y sin perder
# los archivos privados (guías y material en functions/archivos, que no están en GitHub):
#   1. copia las variables CIC_* de la versión publicada en Cloud Run a functions/.env (sin mostrarlas);
#   2. recupera functions/archivos del código fuente de la versión publicada;
#   3. comprueba que estén todos los archivos del catálogo, instala y despliega;
#   4. borra functions/.env al terminar.
# Uso (en Cloud Shell, dentro de la carpeta del repositorio):  bash desplegar.sh
set -euo pipefail
PROYECTO=cic-caribe
REGION=us-central1
cd "$(dirname "$0")"
TMP=$(mktemp -d)
umask 077
trap 'rm -f functions/.env; rm -rf "$TMP"' EXIT

echo "1/4 · Copiando la configuración de la función publicada…"
gcloud run services describe cicacceso --region "$REGION" --project "$PROYECTO" --format=json > "$TMP/servicio.json"
python3 - "$TMP/servicio.json" > functions/.env <<'PY'
import json, sys
env = json.load(open(sys.argv[1]))["spec"]["template"]["spec"]["containers"][0].get("env", [])
print("\n".join(e["name"] + "=" + e.get("value", "") for e in env if e["name"].startswith("CIC_")))
PY
echo "    Variables: $(cut -d= -f1 functions/.env | tr '\n' ' ')"
grep -q '^CIC_API_KEY=.\+' functions/.env || { echo "Falta CIC_API_KEY en la función publicada. Se detiene."; exit 1; }

echo "2/4 · Recuperando los archivos privados de la versión publicada…"
read -r BUCKET OBJETO < <(gcloud functions describe cicAcceso --gen2 --region "$REGION" --project "$PROYECTO" \
  --format='value(buildConfig.source.storageSource.bucket,buildConfig.source.storageSource.object)')
gsutil -q cp "gs://$BUCKET/$OBJETO" "$TMP/fuente.zip" || gcloud storage cp "gs://$BUCKET/$OBJETO" "$TMP/fuente.zip" --quiet
mkdir -p "$TMP/fuente" && unzip -q "$TMP/fuente.zip" -d "$TMP/fuente"
if [ -d "$TMP/fuente/archivos" ]; then rm -rf functions/archivos && cp -r "$TMP/fuente/archivos" functions/archivos; fi
python3 - <<'PY'
import json, os, sys
cat = json.load(open("functions/archivos_catalogo.json"))
items = cat.get("archivos", cat) if isinstance(cat, dict) else cat
rutas = [v["archivo"] for v in (items.values() if isinstance(items, dict) else items) if isinstance(v, dict) and "archivo" in v]
faltan = [r for r in rutas if not os.path.isfile(os.path.join("functions/archivos", r))]
print(f"    Archivos del catálogo: {len(rutas)} · presentes: {len(rutas) - len(faltan)}")
if faltan:
    print("    Faltan: " + ", ".join(faltan[:10]) + ("…" if len(faltan) > 10 else ""))
    sys.exit("Faltan archivos privados: no se publica para no dejar la plataforma sin ellos.")
PY

echo "3/4 · Instalando dependencias…"
(cd functions && npm ci --no-audit --no-fund --loglevel=error)

echo "4/4 · Publicando la función…"
if command -v firebase >/dev/null 2>&1; then FB=firebase; else FB="npx -y firebase-tools@latest"; fi
$FB deploy --only functions --project "$PROYECTO" --non-interactive
echo "Listo: función publicada."
