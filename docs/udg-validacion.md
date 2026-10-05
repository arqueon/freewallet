# Validación local de Cartera UDGPlus

## Ficha OB3 completa: 4 de octubre de 2026

La ficha UDG presenta el logro completo sin modificar la credencial firmada.
La prueba real antigua y el fixture ampliado se importaron, guardaron y
abrieron en Chromium. Ambas firmas se comprobaron con el verificador real.
Los registros de emisores se vaciaron deliberadamente en las pruebas: una
firma válida no elimina el aviso de emisor no reconocido.

Trabajo realizado sobre `24afa71`, rama `udg/cartera-udg`, exclusivamente en
`/tmp/freewallet-ficha.N0zd60`. Node 24.19.0, pnpm 11.20.0 y Chromium de
Playwright 1.63.0. Dependencias, almacén pnpm, navegador, build, capturas y
resultados quedaron en `/tmp`; al repositorio vuelven fuentes, pruebas y
documentación. El lockfile no cambió. No hubo push ni despliegue.

### Antes, después y resolución de los datos

Antes se veía una imagen pequeña, el tipo OB3 en inglés y solo el nombre del
criterio. El titular sin nombre podía aparecer como DID. Ahora la insignia
ocupa el centro del encabezado (224 px en escritorio, 176 px en móvil), el
tipo está traducido y cada resultado muestra los nombres del nivel alcanzado
y del requerido. Las comprobaciones se abren desde el sello compacto.

| Dato visible             | Fuente y tratamiento                                                                                                                                                                                                                                                                                    |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Logro e insignia         | `achievement.name` (antes que `vc.name`) y `achievement.image`, cadena o `Image.id`.                                                                                                                                                                                                                    |
| Tipo                     | Traducciones de los 31 valores del enum OB3; se conserva cualquier extensión desconocida. `Course` se muestra como «Curso»; solo `MicroCredential` se etiqueta «Microcredencial».                                                                                                                       |
| Titular                  | Primero `credentialSubject.name`; después `identifier` con `identityType: name`, `hashed: false` y `identityHash` legible. No se usa el correo con hash ni un DID como nombre. Sin nombre: «Vinculada a esta cartera».                                                                                  |
| Emisor e instancia       | Nombre e imagen firmados en `issuer`; `creator.parentOrg.name › creator.name`, con `issuer.name` como respaldo de la organización madre. No se inventan datos que falten.                                                                                                                               |
| Evento, periodo y aliada | Descripción y `achievement.tag` para evento/programa; `credentialSubject.term` para periodo; nombre de `source` para institución de origen o aliada. No se confunde la aliada con el evento.                                                                                                            |
| Qué acredita             | `achievement.description` conserva el texto de horas, modalidad y base de créditos. `alignment` conserva nombre, descripción, marco y enlace. El marco MNC se separa de los resultados de aprendizaje.                                                                                                  |
| Datos complementarios    | `creditsAvailable`, `creditsEarned` (también cero), `inLanguage` traducido mediante `Intl.DisplayNames`, `fieldOfStudy`, `humanCode`, `version`, fechas de actividad. Solo se muestran valores presentes.                                                                                               |
| Ficha y evaluación       | `criteria.id` abre «Ver la ficha»; `criteria.narrative` se conserva salvo el marcador vacío «Criteria not specified» (sin distinguir mayúsculas ni puntuación final).                                                                                                                                   |
| Niveles de rúbrica       | `result.resultDescription` selecciona el descriptor; `achievedLevel` y `requiredLevel` se resuelven por `id` dentro de sus `rubricCriterionLevel`. Se presenta `name`. Una referencia sin resolución indica «nombre no incluido en la credencial», sin inventar un nivel ni exponer el URI como nombre. |
| Verificación             | Mismo hook, sello y cinco comprobaciones de origen, dentro de un desplegable. La vista UDG no cambia el resultado del verificador.                                                                                                                                                                      |
| Marca y texto de entrada | «Guardar tu credencial». `/udg-logo.svg` predeterminado configurable mediante `VITE_APP_LOGO_URL`; cabecera azul UDG con controles blancos en ambos modos.                                                                                                                                              |

El vocabulario se contrastó con la [especificación OB3 de 1EdTech](https://www.imsglobal.org/spec/ob/v3p0/#achievementtype-enumeration).
La presentación UDG se selecciona por el DID Certo conocido o los nombres
actual/histórico del emisor UDG. Esa selección no acredita identidad ni
confianza. Otro emisor conserva su ficha general, comprobado en Playwright.

### Evidencia de las pruebas

| Comprobación final                           | Resultado                                                            |
| -------------------------------------------- | -------------------------------------------------------------------- |
| Instalación con lockfile congelado           | Correcta; lockfile sin cambios.                                      |
| Vitest completo                              | 172 archivos, 2391 pruebas aprobadas, 23.44 s.                       |
| Typecheck de aplicación y configuración Node | Ambos salida 0.                                                      |
| ESLint completo                              | Salida 0, sin errores ni advertencias.                               |
| Prettier de `src`                            | Todos los archivos conformes; salida 0.                              |
| Build Vite, tras typecheck                   | Salida 0, 490 ms.                                                    |
| Playwright UDG                               | 11 aprobadas, 23.7 s, sin reintentos (incluye el JSON real antiguo). |
| Playwright original                          | 55 aprobadas, 42.9 s, sin reintentos.                                |

Tras la limpieza final de imports y de una propiedad de componente sin uso,
typecheck y ESLint focal volvieron a pasar; 25 pruebas focales aprobadas
en 2 archivos (410 ms).

El fixture `tests/fixtures/udg-ob3.json` es ficticio y cubre la decisión 0023:
titular mediante IdentityObject sin hash, creadora y organización madre,
resultados, MNC, créditos, periodo, aliada y rúbrica con referencias. El
servidor de pruebas lo firma con EdDSA después de validar la presentación del
titular. Los e2e verifican también las imágenes cargadas, la ausencia de
desbordamiento horizontal y el guardado en IndexedDB.

La credencial antigua se leyó de un archivo local de Descargas, sin copiarla
a Git. Su logro es «Inteligencia artificial generativa en el aula»: muestra
«Curso», la insignia real, «Vinculada a esta cartera» y, en ambos criterios,
«Nivel alcanzado: Sobresaliente» / «Nivel requerido: En desarrollo». No tiene
los nuevos metadatos de 0023 y no se rellenan artificialmente. La firma real
pasó; las únicas peticiones externas permitidas fueron GET al emisor para
material público de verificación e imágenes. El archivo importado no se envió.

Para repetir ese caso, establece `UDG_LEGACY_CREDENTIAL` con la ruta local del
JSON firmado. Sin esa variable, solo ese caso se omite de forma explícita.
La suite UDG usa `playwright.udg.config.ts`; las pruebas originales usan el
branding inglés y la configuración de proxy original. En esta validación se
utilizó `VITE_CORS_PROXY_URL=none` para UDG.

### Archivos de esta actualización

- `ARCHITECTURE.md`
- `Dockerfile`
- `README.md`
- `docs/udg-despliegue.md`
- `docs/udg-validacion.md`
- `src/app.config.ts`
- `src/components/credentialDetails/AchievementResults.tsx`
- `src/components/credentialDetails/CredentialDetail.tsx`
- `src/i18n/locales/en.json`
- `src/i18n/locales/es.json`
- `src/lib/viewMappers/credentialDisplayFields.ts`
- `src/themes/themeConfig.ts`
- `tests/e2e/helpers/certoExchange.ts`
- `tests/e2e/udg-certo.spec.ts`
- `tests/unit/credentialDisplayFields.test.ts`
- `src/lib/viewMappers/udgCredential.ts`
- `src/components/credentialDetails/UdgCredentialDetail.tsx`
- `tests/fixtures/udg-ob3.json`
- `tests/unit/udgCredential.test.ts`
- `tests/e2e/udg-detail.spec.ts`

### Capturas revisadas visualmente

Todas están fuera del repositorio, en `/tmp`, sin desbordamiento ni textos
superpuestos. Se revisaron insignia, jerarquía, etiquetas, nombres de rúbrica,
comprobaciones desplegadas, contraste aparente y logo blanco sobre azul.

- `/tmp/udg-ficha-desktop-light.png`
- `/tmp/udg-ficha-desktop-dark.png`
- `/tmp/udg-ficha-mobile-light.png`
- `/tmp/udg-ficha-mobile-dark.png`
- `/tmp/udg-ficha-desktop-light-checks.png`
- `/tmp/udg-ficha-desktop-dark-checks.png`
- `/tmp/udg-ficha-mobile-light-checks.png`
- `/tmp/udg-ficha-mobile-dark-checks.png`
- `/tmp/udg-ficha-legacy-desktop-light.png`
- `/tmp/udg-ficha-legacy-desktop-dark.png`
- `/tmp/udg-ficha-legacy-mobile-light.png`
- `/tmp/udg-ficha-legacy-mobile-dark.png`

### Límites

El build conserva los avisos de chunks grandes y módulos Node externalizados
para navegador. No se construyó una imagen Docker ni se ejecutó la suite WAS;
no se modifican almacenamiento, autorización ni protocolo. La revisión visual
no sustituye una prueba con lector de pantalla. El fixture ampliado valida la
presentación del contrato 0023; no se solicitó una nueva emisión de producción.

## Registro histórico de la primera integración

Lo que sigue describe la validación inicial anterior a los ajustes de ficha,
logo y titular detallados arriba.

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
