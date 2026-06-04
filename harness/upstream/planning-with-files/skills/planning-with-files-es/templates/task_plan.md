# Plan de Tareas: [Breve Descripción]
<!-- 
  QUÉ: Esta es tu hoja de ruta para toda la tarea. Piensa en ella como tu "memoria de trabajo en disco."
  POR QUÉ: Después de 50+ llamadas a herramientas, tus objetivos originales pueden olvidarse. Este archivo los mantiene frescos.
  CUÁNDO: Crea esto PRIMERO, antes de comenzar cualquier trabajo. Actualiza después de completar cada fase.
-->

## Objetivo
<!-- 
  QUÉ: Una oración clara describiendo lo que intentas lograr.
  POR QUÉ: Esta es tu estrella guía. Releerla te mantiene enfocado en el estado final.
  EJEMPLO: "Crear una aplicación CLI de tareas en Python con funcionalidad de agregar, listar y eliminar."
-->
[Una oración describiendo el estado final]

## Routing Decision
- Selected Route: tracked-lean
- Route Reason: Esta tarea requiere planificación duradera, pero todavía no justifica deep reasoning.
- Promotion Trigger: none
- Route Evidence Surface: planning + summary

## Fase Actual
<!-- 
  QUÉ: En qué fase estás trabajando actualmente (ej., "Fase 1", "Fase 3").
  POR QUÉ: Referencia rápida de dónde estás en la tarea. Actualiza esto según progresas.
-->
Fase 1

## Fases
<!-- 
  QUÉ: Divide tu tarea en 3-7 fases lógicas. Cada fase debe ser completable.
  POR QUÉ: Dividir el trabajo en fases previene el agobio y hace visible el progreso.
  CUÁNDO: Actualiza el estado después de completar cada fase: pending → in_progress → complete
-->

### Fase 1: Requisitos y Descubrimiento
<!-- 
  QUÉ: Entender qué se necesita hacer y recopilar información inicial.
  POR QUÉ: Comenzar sin entender lleva a esfuerzo desperdiciado. Esta fase previene eso.
-->
- [ ] Entender la intención del usuario
- [ ] Identificar restricciones y requisitos
- [ ] Documentar hallazgos en findings.md
- **Estado:** in_progress
<!-- 
  VALORES DE ESTADO:
  - pending: Aún no iniciado
  - in_progress: Actualmente trabajando en esto
  - complete: Fase finalizada
-->

### Fase 2: Planificación y Estructura
<!-- 
  QUÉ: Decidir cómo abordarás el problema y qué estructura usarás.
  POR QUÉ: Una buena planificación previene retrabajo. Documenta decisiones para recordar por qué las elegiste.
-->
- [ ] Definir enfoque técnico
- [ ] Crear estructura del proyecto si es necesario
- [ ] Documentar decisiones con su justificación
- **Estado:** pending

### Fase 3: Implementación
<!-- 
  QUÉ: Construir/crear/escribir la solución realmente.
  POR QUÉ: Aquí es donde ocurre el trabajo. Divide en subtareas más pequeñas si es necesario.
-->
- [ ] Ejecutar el plan paso a paso
- [ ] Escribir código en archivos antes de ejecutar
- [ ] Probar incrementalmente
- **Estado:** pending

### Fase 4: Pruebas y Verificación
<!-- 
  QUÉ: Verificar que todo funciona y cumple con los requisitos.
  POR QUÉ: Detectar problemas temprano ahorra tiempo. Documenta resultados de pruebas en progress.md.
-->
- [ ] Verificar que todos los requisitos se cumplen
- [ ] Documentar resultados de pruebas en progress.md
- [ ] Corregir cualquier problema encontrado
- **Estado:** pending

### Fase 5: Entrega
<!-- 
  QUÉ: Revisión final y entrega al usuario.
  POR QUÉ: Asegura que nada se olvida y los entregables están completos.
-->
- [ ] Revisar todos los archivos de salida
- [ ] Asegurar que los entregables están completos
- [ ] Entregar al usuario
- **Estado:** pending

## Execution Contract
<!--
  WHAT: Define heavy-task execution units only when the task needs structured decomposition.
  WHY: This keeps execution intent in authoritative planning rather than scattering it across notes.
  WHEN: Fill this section for heavy tracked tasks; omit or leave as a stub for quick tasks.
-->

### Unit: unit-01
- Kind: implementation
- Status: planned
- Scope:
  - Do: describe the exact deliverable this unit owns
  - Not do: describe the adjacent work this unit must not absorb
- Owner Mode: inline
- Allowed Ops:
  - Files: list the exact files or path classes this unit may touch
  - Commands: list the exact commands this unit may run
  - External effects: say "none" unless the unit is explicitly allowed to change external state
- Dependencies:
  - list required unit ids or evidence refs
- Verification Plan:
  - list the exact command or evidence requirement that proves the unit
- Return Artifacts:
  - name the concrete artifacts, such as patch, report, note, or follow-up
- Integration Target:
  - state exactly where the result must sync back, such as progress.md or findings.md
- Exit Criteria:
  - define the exact condition for moving from done toward verified

## Preguntas Clave
<!-- 
  QUÉ: Preguntas importantes que necesitas responder durante la tarea.
  POR QUÉ: Estas guían tu investigación y toma de decisiones. Responde según avances.
  EJEMPLO: 
    1. ¿Deben las tareas persistir entre sesiones? (Sí - necesario almacenamiento en archivo)
    2. ¿Qué formato para almacenar tareas? (Archivo JSON)
-->
1. [Pregunta por responder]
2. [Pregunta por responder]

## Decisiones Tomadas
<!-- 
  QUÉ: Decisiones técnicas y de diseño que has tomado, con el razonamiento detrás de ellas.
  POR QUÉ: Olvidarás por qué hiciste ciertas elecciones. Esta tabla te ayuda a recordar y justificar decisiones.
  CUÁNDO: Actualiza cuando hagas una elección significativa (tecnología, enfoque, estructura).
  EJEMPLO:
    | Usar JSON para almacenamiento | Simple, legible por humanos, soporte integrado en Python |
-->
| Decisión | Justificación |
|----------|--------------|
|          |              |

## Errores Encontrados
<!-- 
  QUÉ: Cada error que encuentres, qué número de intento fue, y cómo lo resolviste.
  POR QUÉ: Registrar errores previene repetir los mismos errores. Esto es crítico para aprender.
  CUÁNDO: Agrega inmediatamente cuando ocurra un error, incluso si lo arreglas rápidamente.
  EJEMPLO:
    | FileNotFoundError | 1 | Verificar si el archivo existe, crear lista vacía si no |
    | JSONDecodeError | 2 | Manejar caso de archivo vacío explícitamente |
-->
| Error | Intento | Resolución |
|-------|---------|------------|
|       | 1       |            |

## Notas
<!-- 
  RECORDATORIOS:
  - Actualiza el estado de la fase según progresas: pending → in_progress → complete
  - Relee este plan antes de decisiones importantes (manipulación de atención)
  - Registra TODOS los errores - ayudan a evitar repetición
  - Nunca repitas una acción fallida - muta tu enfoque en su lugar
-->
- Actualiza el estado de la fase según progresas: pending → in_progress → complete
- Relee este plan antes de decisiones importantes (manipulación de atención)
- Registra TODOS los errores - ayudan a evitar repetición
