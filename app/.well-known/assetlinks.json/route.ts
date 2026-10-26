// Vincula la app de Android (APK / Play Store) con este sitio, así se abre sin la barra del navegador.
// Las huellas SHA-256 se cargan en Cloudflare como variable ANDROID_SHA256 (separadas por coma):
// la de la clave del APK y, si se publica en Play Store, la de "App signing key" de Play Console.
export const dynamic = "force-dynamic";

export function GET() {
  const huellas = (process.env.ANDROID_SHA256 ?? "").split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
  const paquete = process.env.ANDROID_PACKAGE ?? "com.amorypunk.gestion";
  const body = huellas.length
    ? [{ relation: ["delegate_permission/common.handle_all_urls"], target: { namespace: "android_app", package_name: paquete, sha256_cert_fingerprints: huellas } }]
    : [];
  return Response.json(body, { headers: { "cache-control": "public, max-age=300" } });
}
