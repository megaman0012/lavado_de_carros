# Indice de documentacion — Total Clean Car

Auditoria del **2026-09-15**. Actualizado el **2026-09-27** (el producto pasa a
llamarse Total Clean Car; ver `14_GESTION/Historial_Versiones.md`).

| Area | Estado | Documento |
|---|---|---|
| NEGOCIO | 🟢 COMPLETO | [01_NEGOCIO/Proposito.md](01_NEGOCIO/Proposito.md) |
| ARQUITECTURA | 🟢 COMPLETO | [02_ARQUITECTURA/Arquitectura.md](02_ARQUITECTURA/Arquitectura.md) |
| DESARROLLO | 🟢 COMPLETO | [03_DESARROLLO/API.md](03_DESARROLLO/API.md) |
| DOCKER | 🟢 COMPLETO | [04_DOCKER/Docker.md](04_DOCKER/Docker.md) |
| SEGURIDAD | 🟢 COMPLETO | [05_SEGURIDAD/Analisis_Seguridad.md](05_SEGURIDAD/Analisis_Seguridad.md) |
| BASE DE DATOS | 🟢 COMPLETO | [06_BASE_DATOS/Modelo_Datos.md](06_BASE_DATOS/Modelo_Datos.md) |
| MANUAL USUARIO | 🟢 COMPLETO · v2.0 2026-09-27 | [07_MANUAL_USUARIO/Manual_Usuario.md](07_MANUAL_USUARIO/Manual_Usuario.md) |
| MANUAL ADMINISTRADOR | 🟢 COMPLETO | [08_MANUAL_ADMINISTRADOR/Manual_Administrador.md](08_MANUAL_ADMINISTRADOR/Manual_Administrador.md) |
| MANUAL SOPORTE | 🟢 COMPLETO | [09_MANUAL_SOPORTE/Manual_Soporte.md](09_MANUAL_SOPORTE/Manual_Soporte.md) |
| MOBILE | 🟡 EN PRUEBA · 2026-09-27 | [15_APK/Preparacion_APK.md](15_APK/Preparacion_APK.md) — APK Android de prueba, sin publicar |
| OPERACION | 🟢 COMPLETO | [11_OPERACION/Operacion.md](11_OPERACION/Operacion.md) |
| CONTINUIDAD | 🟢 COMPLETO | [12_CONTINUIDAD/Backup_Recuperacion.md](12_CONTINUIDAD/Backup_Recuperacion.md) |
| PRUEBAS | 🟢 COMPLETO | [13_PRUEBAS/Plan_Pruebas.md](13_PRUEBAS/Plan_Pruebas.md) |
| GESTION | 🟢 COMPLETO | [14_GESTION/Historial_Versiones.md](14_GESTION/Historial_Versiones.md) |

## Documentacion previa: clasificacion

**Toda se conserva sin modificar.** Clasificacion segun su estado al
2026-09-15:

| Documento | Estado | Observacion |
|---|---|---|
| `ARQUITECTURA.md` | 🟢 **VIGENTE** | del 2026-08-31, misma fecha del ultimo commit |
| `PLAN_TRABAJO.md` | 🟢 **VIGENTE** | del 2026-08-31 |
| `ANALISIS.md` | 🟡 **INCOMPLETO** | del 2026-08-28, anterior al rate limiting y a los comprobantes de pago |
| `DOCUMENTACION_TECNICA.md` | 🟡 **DESACTUALIZADO** | del 2026-08-28; no cubre los 3 commits posteriores |
| `MODELO_BASE_DATOS.md` | 🟡 **DESACTUALIZADO** | del 2026-08-28; verificar contra las 15 entidades actuales |
| `IDEA_NEGOCIO.md` | 🟢 VIGENTE | documento de negocio, no caduca con el codigo |
| `idea.md` | 🔵 **DUPLICADO** | version corta de `IDEA_NEGOCIO.md` |
| `HISTORIAL_CHAT.md` | ⚪ **NO VERIFICABLE** | transcripcion de sesiones de trabajo, no es documentacion tecnica |

La version consolidada y verificada contra el codigo es la de `docs/`.


## Formatos disponibles

Estos documentos existen ademas en **PDF** y **DOCX**, junto a cada `.md`:

| Documento | PDF | DOCX |
|---|---|---|
| `INFORME_AUDITORIA` | ✅ | ✅ |
| `02_ARQUITECTURA/Arquitectura` | ✅ | ✅ |
| `07_MANUAL_USUARIO/Manual_Usuario` | ✅ | ✅ |
| `08_MANUAL_ADMINISTRADOR/Manual_Administrador` | ✅ | ✅ |
| `09_MANUAL_SOPORTE/Manual_Soporte` | ✅ | ✅ |
| `14_GESTION/Historial_Versiones` | ✅ | ✅ |

**El Markdown es la fuente.** El PDF y el DOCX se regeneran desde el `.md`; no
se editan a mano, porque el siguiente regenerado los pisa.

Para regenerarlos:

    python3 /usr/local/share/auditoria/md2pdf.py  <documento>.md --proyecto "<Nombre>"
    python3 /usr/local/share/auditoria/md2docx.py <documento>.md --proyecto "<Nombre>"

Ver `/usr/local/share/auditoria/LEEME.md`.
