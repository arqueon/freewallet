# Validación local de Cartera UDGPlus

Validación del 4 de octubre de 2026. Base upstream: `5b3f13a`. Rama:
`udg/cartera-udg`. Dependencias, compilación y pruebas ejecutadas exclusivamente
en `/tmp/freewallet-udg.Z0a3vY`. Compilación y pruebas con Node 24.21.0;
instalación mediante pnpm 11.20.0. No se
instalaron dependencias ni se copiaron artefactos de build a Nextcloud.

| Comprobación                              | Resultado                                                                   |
| ----------------------------------------- | --------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`          | Correcto; lockfile sin cambios.                                             |
| `pnpm run typecheck`                      | Salida 0.                                                                   |
| `tsc -p tsconfig.node.json`               | Salida 0; incluye configuración Playwright UDG.                             |
| Vitest completo                           | 171 archivos, 2371 pruebas aprobadas, 25.58 s.                              |
| Vitest focal tras el último ajuste visual | 3 archivos, 27 pruebas aprobadas, 700 ms.                                   |
| Playwright upstream                       | 55 aprobadas, 1.0 min; inglés y marca upstream configurados explícitamente. |
| Playwright UDG                            | 5 aprobadas, sin reintentos, 17.4 s.                                        |
| `eslint . --ext .ts,.tsx`                 | Salida 0, sin errores ni advertencias.                                      |
| `pnpm run build`                          | Salida 0; Vite compiló en 546 ms tras typecheck.                            |

El build conserva advertencias de chunks mayores de 500 kB y una dependencia
que importa `path` y se externaliza para navegador. Las pruebas locales del
mediador CHAPI pueden registrar permiso denegado o timeout; el reclamo nuevo
no depende de ese mediador. La integración verifica que no aparecen otros
errores de página en su flujo completo.

## Qué demuestra la integración

Un servidor HTTP local independiente recibe el POST inicial y devuelve
DIDAuthentication con challenge, domain, métodos `key`/`web` y
`eddsa-rdfc-2022`. Verifica criptográficamente la VP recibida, exige holder
did:key y ninguna credencial previa, y consume la oferta una sola vez.
Emite una VC 2.0 OpenBadgeCredential y una Bitstring Status List firmadas con
DataIntegrityProof/eddsa-rdfc-2022, usando un did:key de prueba.

Chromium crea una cartera sin WAS, abre el JSON de oferta, recarga e inicia
sesión, aprueba la firma y recibe la credencial. El verificador real muestra
firma válida, no revocada, vigente y el aviso de emisor no registrado en
español. Se comprueban resultado por criterio, guardado y recuperación de la
credencial después de recargar y volver a iniciar sesión. El navegador tiene
idioma en-US para probar el predeterminado español de la aplicación.

Tres escenarios adicionales prueban el pegado de JSON, URL directa y enlace
LCW sin enviar una prueba antes del consentimiento. El quinto prueba el alias
`/request` y una oferta consumida (410): muestra un error español sin pedir
la contraseña ni firmar. Parser y escáner comparten el mismo normalizador;
las pruebas unitarias incluyen formatos, entradas inseguras, domain,
challenge y destino de entrega distintos.

## Capturas inspeccionadas

- `/tmp/udg-claim-light.png`: consentimiento, origen y botón de firma.
- `/tmp/udg-detail-light.png`: OB3 guardada, emisor, insignia, resultados,
  vigencia y verificación en modo claro.
- `/tmp/udg-detail-dark.png`: la misma vista en oscuro; se comprueba también
  por CSS el fondo del aviso, además del contraste calculado en ambos temas.
- `/tmp/udg-detail-mobile.png`: cabecera, menú móvil y detalle a 390 px.
- `/tmp/udg-verification-mobile.png`: resultados y verificación a 390 px.

La revisión corrigió el panel lateral que ocupaba la pantalla móvil y el
fallback que confundía el nombre de la insignia con el nombre del titular.
Ahora un titular sin nombre muestra su DID. Las pruebas comprueban ausencia
de desbordamiento horizontal en móvil. No equivalen a una auditoría completa
de accesibilidad con lector de pantalla.

## Límites y preparación para publicar

No se contactó Certo ni se usaron ofertas reales. Falta comprobar el did:web
real, la configuración CORS de intercambio/DID/estado y las políticas del
proxy de producción con una oferta autorizada. No se ejecutó la suite WAS,
que requiere su servidor de prueba. No se probó cámara física.

No hay Docker/Podman/nginx disponible en este entorno: se revisaron Dockerfile
y configuración, y se compiló la SPA; la imagen y sus cabeceras deben
comprobarse antes de publicar. El target `udg-static` no necesita backend.
Debes aportar el logo oficial y definir `UDG_SOURCE_URL` con el código completo
de esta versión antes de servirla públicamente. El marcador local lo indica.

No hubo push, despliegue, cambios de DNS, servidores, credenciales ni secretos.

## Archivos cambiados

- `ARCHITECTURE.md`
- `Dockerfile`
- `README.md`
- `deploy/nginx-static.conf`
- `docs/architecture/credential-offer.md`
- `docs/udg-despliegue.md`
- `docs/udg-validacion.md`
- `index.html`
- `playwright.config.ts`
- `playwright.udg.config.ts`
- `public/manifest.json`
- `public/manifest.webmanifest`
- `public/source.html`
- `public/udg-placeholder.svg`
- `src/App.tsx`
- `src/app.config.ts`
- `src/components/AppBarControls.tsx`
- `src/components/AuthPageHeader.tsx`
- `src/components/DashboardLayout.tsx`
- `src/components/SourceLink.tsx`
- `src/components/credentialDetails/AchievementResults.tsx`
- `src/components/credentialDetails/CredentialDetail.tsx`
- `src/components/credentialDetails/VerificationPanel.tsx`
- `src/components/storage/CollectionAttribution.test.tsx`
- `src/components/storage/MetadataCard.test.tsx`
- `src/i18n/defaultLanguage.test.ts`
- `src/i18n/index.ts`
- `src/i18n/locales/en.json`
- `src/i18n/locales/es.json`
- `src/i18n/uiLanguages.ts`
- `src/lib/resolveWalletInput.ts`
- `src/lib/viewMappers/credentialDisplayFields.ts`
- `src/lib/walletRequest/credentialOffer.test.ts`
- `src/lib/walletRequest/credentialOffer.ts`
- `src/main.tsx`
- `src/pages/chapi/WalletStorePage.tsx`
- `src/pages/dashboard/AddCredentialPage.tsx`
- `src/pages/dashboard/DashboardPage.tsx`
- `src/pages/external/CredentialOfferPage.tsx`
- `src/styles/appStyles.ts`
- `src/themes/appTheme.ts`
- `src/themes/default.css`
- `src/themes/index.ts`
- `src/themes/themeConfig.ts`
- `src/themes/udg.css`
- `src/themes/udg.test.ts`
- `tests/e2e/helpers/certoExchange.ts`
- `tests/e2e/udg-certo.spec.ts`
- `tests/unit/credentialDisplayFields.test.ts`
- `tests/unit/resolveWalletInput.test.ts`
- `tsconfig.node.json`
- `vite.config.ts`
