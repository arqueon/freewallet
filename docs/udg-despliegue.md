# Cartera UDGPlus: integración y despliegue

Esta versión se prepara localmente en `udg/cartera-udg`. El hostname propuesto
es `cartera-microcredenciales.arqueonautis.org`. No se ha publicado ni se ha
modificado Certo, DNS, proxy o servidor alguno.

## Botón de Certo

Genera el enlace con la URL de la oferta de un solo uso:

```js
const exchangeUrl = `https://microcredenciales.arqueonautis.org/api/exchanges/${id}`
const request = JSON.stringify({ protocols: { vcapi: exchangeUrl } })
const walletUrl =
  'https://cartera-microcredenciales.arqueonautis.org/#/request?request=' +
  encodeURIComponent(request)
```

Texto del botón: **Abrir en Cartera UDGPlus**. El fragmento `#/request` es
intencional: Freewallet usa HashRouter y el fragmento no llega al servidor
estático ni a sus registros de acceso. No registres ni compartas ofertas reales.

También funciona `/request?request=...` (y `/request.html` o `/exchange`),
mediante el fallback de la SPA y conversión al hash en el navegador. Ese alias
sí envía la query al proxy en la primera petición; prefiere el enlace con hash.
El valor de `request` puede ser el JSON anterior, la URL directa o un enlace
LCW `https://lcw.app/request.html?request=...`. Pegar o escanear esos formatos
en la cartera lleva al mismo reclamo. Las URL directas pegadas se reconocen
por `/exchanges/:id`; para otra ruta usa el JSON o el enlace propio.

Certo debe aceptar `OPTIONS` y `POST` con `Content-Type: application/json`
desde el origen de la cartera. Las peticiones no llevan cookies. El GET de
`?iuv=1` puede seguir existiendo para otros clientes; la cartera reconoce la
ruta de Certo y abre directamente el POST, sin consumir la oferta por GET.
La respuesta inicial esperada es:

```json
{
  "verifiablePresentationRequest": {
    "query": [
      {
        "type": "DIDAuthentication",
        "acceptedMethods": [{ "method": "key" }, { "method": "web" }],
        "acceptedCryptosuites": [{ "cryptosuite": "eddsa-rdfc-2022" }]
      }
    ],
    "challenge": "VALOR_UNICO_DEL_INTERCAMBIO",
    "domain": "microcredenciales.arqueonautis.org"
  }
}
```

La cartera responde `{"verifiablePresentation": <VP firmada>}` y espera
`{"verifiablePresentation": {"...": "...", "verifiableCredential": [<VC>]}}`.
Conserva el challenge y el domain. Solo acepta DIDAuthentication, sin permisos
de almacenamiento ni solicitud de credenciales previas. El domain debe ser el
origen del intercambio o su host, según la comprobación compartida de Freewallet;
el destino de presentación debe pertenecer al mismo origen. No se siguen
redirecciones. Certo debe anunciar `eddsa-rdfc-2022` si exige una VP VC 2.0;
sin esa negociación Freewallet conserva su prueba predeterminada
Ed25519Signature2020. La firma de la credencial recibida es independiente.

## Configuración de build

| Variable Vite           | Predeterminado         | Uso                                                                                                                               |
| ----------------------- | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `VITE_DEFAULT_LANGUAGE` | `es`                   | Primer inicio, independiente del navegador. `en` también admitido; prevalece la elección guardada del usuario.                    |
| `VITE_APP_THEME`        | `udg`                  | Tema inicial: `udg`, `default` o `west-coast`; conserva selector.                                                                 |
| `VITE_APP_NAME`         | `Cartera UDGPlus`      | Nombre de interfaz, título y manifiesto generado.                                                                                 |
| `VITE_APP_LOGO_URL`     | `/udg-placeholder.svg` | Ruta o URL de logo. Coloca el oficial en `public/udg-logo.svg` y configura esa ruta. El placeholder UDG+ no es el escudo oficial. |
| `VITE_UDG_SOURCE_URL`   | `/source.html`         | Enlace visible al código de esta versión. En Docker se pasa como `UDG_SOURCE_URL`.                                                |
| `VITE_WAS_SERVER_URL`   | sin valor              | Repositorio de Spaces WAS opcional.                                                                                               |
| `VITE_KMS_SERVER_URL`   | sin valor sin WAS      | KMS opcional; no se necesita para did:key.                                                                                        |
| `VITE_CORS_PROXY_URL`   | valor upstream         | Proxy para documentos y verificación; nunca para ofertas. Revisa la tabla completa del README.                                    |

Todas se incorporan al JavaScript al compilar. Cambiar variables al ejecutar
nginx no cambia la marca. Usa valores públicos, nunca secretos. El azul
institucional `#00427B` es el primario claro; en oscuro se usa `#9CCAFF` sobre
fondo oscuro para mantener contraste AA en texto y controles. Inter se sirve
localmente. El usuario puede cambiar tema y modo.

## Construcción fuera de Nextcloud

Node 24 o posterior, pnpm según `packageManager`. Desde el checkout:

```sh
build_dir=$(mktemp -d /tmp/cartera-udg-build.XXXXXX)
rsync -a --exclude=.git --exclude=node_modules --exclude=dist --exclude='.env*' ./ "$build_dir/"
cd "$build_dir"
pnpm install --frozen-lockfile
APP_VERSION=udg-local pnpm run typecheck
APP_VERSION=udg-local pnpm run test:unit
APP_VERSION=udg-local pnpm run build
```

Para una imagen estática sin WAS:

```sh
docker build --target udg-static \
  --build-arg APP_VERSION=udg-local \
  --build-arg VITE_APP_THEME=udg \
  --build-arg VITE_APP_NAME='Cartera UDGPlus' \
  --build-arg VITE_DEFAULT_LANGUAGE=es \
  --build-arg VITE_APP_LOGO_URL=/udg-placeholder.svg \
  --build-arg UDG_SOURCE_URL='https://REPOSITORIO-POR-DEFINIR' \
  -t cartera-udgplus:local .
```

Sustituye el marcador del repositorio antes de construir una versión pública.
El enlace visible debe llevar al código completo de esta versión y sus
instrucciones de construcción, conservando LICENSE y avisos AGPL-3.0; el enlace
al proyecto upstream por sí solo no identifica tus cambios. `/source.html`
es un aviso local pendiente de configurar, no una publicación del código.

La imagen escucha en 8080. El proxy debe terminar TLS, reenviar al contenedor
y preservar el origen público. Los archivos `/assets/` inexistentes devuelven
404; las rutas SPA devuelven `index.html`. HTML se revalida y los assets con
hash se almacenan un año. El target `was-proxy` conserva el despliegue anterior
de `docs/deployment-fly.io.md`, que requiere `WAS_UPSTREAM`; `udg-static` no lo
requiere. Se pueden servir los archivos `dist/` con cualquier servidor estático.

## Cabeceras y servicios externos

`deploy/nginx-static.conf` incluye CSP, `nosniff`, `Referrer-Policy: no-referrer`
y permisos de cámara propia para QR, sin micrófono ni geolocalización. La CSP
admite estilos MUI en línea, el pequeño script inicial de tema, WASM para
Argon2, workers blob para QR y el iframe del mediador `authn.io`. Permite
conexiones e imágenes HTTPS porque una cartera recibe emisores, DID documents,
contextos y listas de estado de distintos sitios. Se puede restringir esa lista
tras inventariar los emisores y WAS del despliegue. El proxy no debe imponer
`X-Frame-Options: DENY` si se quiere conservar CHAPI. Activa HSTS en el proxy
cuando HTTPS esté comprobado. Revisa CSP con el navegador tras desplegar;
las pruebas de desarrollo no validan las cabeceras del proxy de producción.

El DID `did:web:microcredenciales.arqueonautis.org`, sus contextos y su Bitstring
Status List deben poder resolverse desde el navegador (CORS). El verificador
real del checkout es `@interop/verifier-core`, adaptado por `src/lib/verify.ts`;
la descripción antigua del repo aún menciona `@digitalcredentials/verifier-core`.
La consulta de registros no convierte automáticamente el emisor UDGPlus en
conocido: se mantiene el aviso español aunque la firma sea válida.

El upstream usa un proxy público de respaldo (`corsproxy.io`) cuando no hay
WAS. Evalúa un proxy propio si lo necesitas para documentos sin CORS; los
intercambios y las VP firmadas del nuevo reclamo nunca pasan por ese proxy.

## Sin WAS

Puedes crear una cartera, reclamar, verificar y guardar credenciales sin backend
propio. IndexedDB conserva las credenciales cifradas en ese perfil de navegador.
Se pierden si borras sus datos o pierdes el dispositivo; no hay sincronización,
restauración desde WAS ni enlaces públicos alojados en WAS. El modo invitado
pierde sus credenciales al cerrar sesión y se advierte antes del reclamo.
No confundas el almacenamiento del navegador con una copia de respaldo duradera.
La verificación de DID, registros y listas de estado todavía necesita red.

## Validación local

```sh
APP_VERSION=udg-local pnpm run test:unit
APP_VERSION=udg-local pnpm run typecheck
APP_VERSION=udg-local pnpm run build
pnpm exec playwright install chromium
APP_VERSION=udg-local pnpm exec playwright test --workers=2
APP_VERSION=udg-local pnpm exec playwright test --config playwright.udg.config.ts --workers=1
```

La suite upstream fija inglés y marca Freewallet explícitamente para mantener
sus escenarios. La suite UDG usa los valores predeterminados de esta versión
en un navegador configurado en inglés. El intercambio simulado firma con un
did:key de prueba, comprueba criptográficamente la VP del titular y emite OB3
más una Bitstring Status List firmadas. No contacta Certo ni usa ofertas reales.
El escaneo comparte el normalizador probado; la cámara física no se automatiza.
