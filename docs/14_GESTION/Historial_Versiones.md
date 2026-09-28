# Historial de versiones

## Documentacion

| Version | Fecha | Cambio | Responsable |
|---|---|---|---|
| 1.0 | 2026-09-15 | Auditoria tecnica y documentacion completa. Se conserva toda la documentacion previa sin modificar. | Auditoria tecnica |
| 2.0 | 2026-09-27 | `07_MANUAL_USUARIO` reescrito para Total Clean Car: roles, reserva en seis pasos, precios por tipo de vehiculo, adicionales, app Android; 13 capturas nuevas (solo datos de demostracion). Nuevo `15_APK/Preparacion_APK.md`. Copia editable en linea enlazada desde el manual. | Desarrollo |

## Aplicacion

Sin etiquetas de version en git. Reconstruido desde el historial de commits:

| Fecha | Commit | Cambio |
|---|---|---|
| 2026-09-27 | `11d0ea2` | APK: admin y operador arrancan en la Agenda en el celular |
| 2026-09-27 | `6cb9513` | **Total Clean Car:** precios por tipo de vehiculo, adicionales, correccion de fechas, sesion y preparacion de la APK (ver `CHANGELOG.md`) |
| 2026-08-31 | `6580332` | Documentar rate limiting y el analisis Dashboard vs Reportes |
| 2026-08-31 | `6b43182` | **Agregar rate limiting a la API** |
| — | `e75e666` | Documentar la variante b del comprobante (sesion 7) |
| — | `9837353` | Seed de demo: restaurar contrasenas y dejar comprobantes por validar |
| — | `ee633a3` | Pantallas de envio y validacion de comprobantes |
| — | `314d041` | El cliente sube su comprobante y el operador lo valida |

`backend/package.json` declara `1.0.0`; `frontend/package.json` declara
`0.1.0`. **INCONSISTENCIA menor:** no hay una version unica del producto.

## Repositorio

| | |
|---|---|
| Ruta | `/home/server-dt/Documentos/lavado_de_carros` |
| Rama | `main` |
| Ultimo commit | 2026-09-27 |
| Remoto | `megaman0012/lavado_de_carros` en GitHub (actualizado el 2026-09-27) |

Al momento de la auditoria (2026-09-15) no habia remoto configurado; el riesgo de
que el codigo existiera solo en este servidor quedo resuelto.

## Responsables

`NO DETERMINADO`. No hay documento que asigne responsable funcional ni tecnico.
