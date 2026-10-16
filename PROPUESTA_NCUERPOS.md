# ORBITA: arquitectura de un sistema planetario emergente

**ORBITA** — *Orbital Resonance, Interactions, Bodies and Accretion*  
Propuesta técnica para Unidad 7: modelos basados en agentes, interacción agente-entorno y comportamiento emergente.

## 1. Título y concepto de ingeniería

### Visión

ORBITA es un laboratorio interactivo N-cuerpos en p5.js. Un sistema comienza con una estrella, planetas semilla y un disco de asteroides con posiciones y velocidades perturbadas. Cada cuerpo celeste es una entidad dinámica: responde a la gravedad de todos los otros cuerpos, puede colisionar, fusionarse, fragmentarse o abandonar el sistema. La persona modifica parámetros en vivo y observa cómo cambian la estructura orbital y las magnitudes globales.

La intención no es representar un sistema estelar real ni predecir efemérides; se trata de una simulación 2D con unidades normalizadas que vuelve visible la relación entre reglas locales de fuerza y organización a gran escala. El sistema no tiene puntuación ni condición de victoria: se explora mediante tiempo, fuerzas, impactos y escalas.

### Comportamiento emergente a evaluar

El patrón de interés es la **autoorganización de un disco caótico**. A partir de interacciones por pares no se programan órbitas específicas: algunos cuerpos adquieren órbitas ligadas, otros intercambian momento angular, colisionan y acrecionan; encuentros cercanos pueden transferir energía y producir eyecciones tipo slingshot. La radiación de la estrella perturba preferentemente los cuerpos pequeños. Se puede observar la aparición o destrucción de bandas orbitales y agrupamientos resonantes.

**Pregunta de exploración:** ¿cómo alteran la dispersión inicial, la masa central y la disipación del medio la fracción de cuerpos que terminan ligados, acrecionados o eyectados?

## 2. Arquitectura de agentes y clases

### Convenciones del modelo

- Mundo 2D y unidades normalizadas: distancia en unidades de lienzo (u), tiempo en segundos de simulación (s) y masa en unidades arbitrarias (mu). Los valores de `G` y masa se calibran para ser legibles, no corresponden a SI.
- Cuerpo `i`: `pos_i`, `vel_i`, `acc_i`, `mass_i`, `radius_i`, `trail_i`, `type_i`, `state_i`. El radio visual/colisional escala como `r_i = r0 * (m_i/m0)^(1/3)`, usando escala cúbica de esfera proyectada.
- El cálculo de fuerzas es O(N²) por tick. La configuración interactiva se limita a unos cientos de cuerpos; para N grande usar Barnes-Hut (quadtree), sin cambiar el contrato de `CelestialBody`.
- La simulación usa suavizado de Plummer `epsilon` para evitar aceleraciones no acotadas: `rSoft² = |pos_j-pos_i|² + epsilon²`.

### Clases

| Clase | Datos principales | Responsabilidad |
| --- | --- | --- |
| `CelestialBody` | `id`, `pos`, `vel`, `acc`, `mass`, `radius`, `trail[]`, `state`, `collidable`, `age` | Estado físico común, masa/momento, fuerzas, trayectoria y transición dinámica. |
| `Star extends CelestialBody` | `luminosity`, `radiationBeta`, `accretedMass`, `visualRadius` | Pozo gravitacional y fuente de presión de radiación/viento estelar. Puede crecer al absorber cuerpos. |
| `Planet extends CelestialBody` | `composition`, `moons[]`, `isSeed` | Cuerpo macroscópico ligado; puede acrecionar o fragmentarse en impactos. |
| `Asteroid extends CelestialBody` | `volatileFraction`, `isDust`, `sourceId` | Partícula pequeña del disco; mayor efecto relativo de radiación. |
| `SolarSystem` | `bodies[]`, `star`, `params`, `simTime`, `energyReference`, `collisionEvents[]` | Fases de integración, detección/resolución de colisiones, estados, métricas y reinicio. |
| `Telemetry` | muestras temporales acotadas | Historial de energía, planetas ligados y desplazamiento del centro de masa. |

### Estados y lógica de colisión

Estados: `STABLE_ORBIT` (energía orbital específica negativa), `UNBOUND` (energía específica positiva dentro del límite de eyección), `ACCRETING` (impacto; estado transitorio visible durante 0.28 s mientras se consolida la masa), `EJECTED` (energía específica positiva y fuera del límite) y `COLLIDED` (marca transitoria del cuerpo absorbido/eliminado para no procesarlo dos veces). Los eyectados siguen integrándose bajo gravedad para que el centro de masa y el momento del conjunto sigan contabilizados; dejan de colisionar y no se incluyen en conteos de órbitas ligadas.

Para colisión `i,j`, si `d <= r_i+r_j`, se calcula `v_rel = |v_i-v_j|` y el momento total `P = m_i v_i + m_j v_j`.

- **Acreción lenta**, `v_rel < v_fragment`: fusionar en un remanente con `M=m_i+m_j`, `V=P/M`, `R=(r_i³+r_j³)^(1/3)` y `pos=(m_i pos_i + m_j pos_j)/M`. El cuerpo más masivo conserva su identidad de clase; si participa la estrella, esta actualiza su centro de masa y velocidad con `P_total/M_total` y aumenta masa/luminosidad.
- **Impacto energético**, `v_rel >= v_fragment`: reemplazar el par por dos fragmentos menores. El centro de masa y la velocidad de traslación son los anteriores; se suma velocidad de retroceso `+u` y `-u` a fragmentos de masa igual, conservando exactamente el momento lineal. `u` se acota como fracción de `v_rel`; la energía se disipa como calor/fragmentación, no se crea artificialmente.
- Cada par se resuelve una sola vez por substep con lista de colisiones pendiente; fragmentos nuevos se integran desde el siguiente substep para evitar colisiones en cascada dependientes del orden.

## 3. Reglas de interacción y algoritmos físicos

### Gravedad N-cuerpos

Para `i != j`, con `r_ij = pos_j - pos_i`, la fuerza central suavizada es:

`F_ij = G * m_i * m_j * r_ij / (|r_ij|² + epsilon²)^(3/2)`

`F_ji = -F_ij`; por tanto, cada par conserva momento lineal salvo integrador, colisión/fragmentación o fuerza externa. Se acumulan fuerzas de todos los cuerpos y luego `acc_i = sum(F_ij)/m_i`. El cálculo se hace por pares, no hay coordinador orbital que imponga trayectorias.

### Integración: Velocity Verlet

Con paso fijo `h`:

1. `pos(t+h) = pos(t) + vel(t) h + 0.5 acc(t) h²`
2. recalcular `acc(t+h)` en las posiciones nuevas
3. `vel(t+h) = vel(t) + 0.5 (acc(t)+acc(t+h)) h`

La fricción opcional se aplica como fuerza no conservativa `F_drag = -c * vel`, dentro de las aceleraciones antes del paso Verlet. La UI agrupa varios substeps por frame; un acumulador de tiempo fijo evita que el resultado dependa directamente del refresco de pantalla. Limitar `h` respecto al tiempo orbital mínimo (`h < T_min/50`) y subdividir al detectar aproximación cercana.

### Radiación / viento estelar

Para asteroides y polvo, una aceleración radial de salida aproximada:

`a_rad = beta * G * M_star * r_hat / (|r|² + epsilon²)`

`beta` representa cociente efectivo entre presión de radiación y gravedad, no un modelo de transferencia radiativa. Planetas macroscópicos reciben una fracción menor. Como la radiación es externa, el momento/energía mecánica del conjunto no tiene por qué conservarse.

### Órbita, eyección y resonancia

Respecto a la estrella: energía específica `epsilon_orb = |v_rel|²/2 - G*M_star/sqrt(r²+epsilon²)`. Si `epsilon_orb < 0`, el cuerpo está ligado; si además permanece varias vueltas dentro del radio del sistema, se clasifica como candidato a `STABLE_ORBIT`. Si `epsilon_orb >= 0` y `r > R_eject`, pasa a `EJECTED` y deja de colisionar/interactuar con el núcleo, pero se conserva en telemetría. Para resonancia, registrar períodos orbitales estimados de cuerpos ligados y analizar cocientes próximos a razones pequeñas enteras; el prototipo no fuerza resonancias.

## 4. UI y control en tiempo real

Controles del laboratorio:

| Parámetro | Rango inicial | Efecto que explorar |
| --- | --- | --- |
| `G` gravitacional | 0.2-2.5 (escala del sistema) | Intensidad de curvatura orbital y encuentros. |
| Masa de estrella | 1,500-7,000 mu | Profundidad del pozo central y escala de velocidades ligadas. |
| Asteroides iniciales | 15-180 | Densidad de impactos y coste O(N²). |
| Dispersión de velocidad | 0-18 u/s | Energía cinética inicial del disco y frecuencia de escape. |
| Fricción del medio | 0-0.12 s⁻¹ | Disipación de energía orbital; no representa vacío físico real. |
| Presión de radiación | 0-1.5 beta | Repulsión selectiva de asteroides pequeños. |
| Estelas | on/off | Retención visual de trayectoria, sin afectar dinámica. |
| Pausa / paso / reinicio | acciones | Inspeccionar eventos y repetir condiciones iniciales. |

Cambiar `G` o masa central en vivo modifica la aceleración del siguiente substep, no reajusta velocidades orbitales; por eso es una perturbación deliberada que puede causar excitación o eyección. Cambiar número de asteroides agrega/quita cuerpos del cinturón. El reinicio crea una nueva distribución aleatoria; para experimentos comparables registrar semilla y parámetros.

## 5. Métricas, telemetría y visualización

Muestreo recomendado a 2 Hz, ventana móvil de 120 puntos:

1. **Energía mecánica total**: `K = sum(0.5*m_i*|v_i|²)` y `U = -sum_{i<j}(G*m_i*m_j/sqrt(r_ij²+epsilon²))`; `E=K+U`. Mostrar `E/E0` y no llamarla invariante cuando haya arrastre, radiación, absorción o fragmentación.
2. **Planetas en órbita estable**: cantidad de cuerpos `Planet` ligados que mantienen `epsilon_orb < 0` durante una ventana de persistencia `T_stable`.
3. **Desplazamiento del centro de masa**: `|R_cm(t)-R_cm(0)|`, con `R_cm=sum(m_i pos_i)/sum(m_i)`. En gravedad interna pura debe permanecer constante salvo error numérico y tratamiento de cuerpos eyectados.
4. **Fracción de masa eyectada/acretada**: masa total en `EJECTED` y masa incorporada a estrella/planetas frente a masa inicial.

Hipótesis verificables: aumentar dispersión eleva la cola de energía positiva y eyecciones; aumentar `G` manteniendo la velocidad inicial fija favorece acreción y ligadura; añadir fricción reduce energía mecánica y puede aumentar acreción; radiación alta elimina primero cuerpos de baja masa. Para separar tendencia de aleatoriedad, comparar múltiples semillas con el mismo conjunto de parámetros.

## 6. Código base p5.js y estructura

La aplicación ejecutable está en `index.html`, `style.css` y `sketch.js`; p5.js se carga por CDN. El sketch implementa `CelestialBody`, `Star`, `Planet`, `Asteroid`, `SolarSystem` y telemetría. `SolarSystem.step()` aplica fuerzas por pares, integra por Verlet y resuelve colisiones; `render()` solo dibuja estado y estelas. La escala de dibujo usa una transformación de masa logarítmica para que el rango dinámico sea visible, pero el radio de colisión usa la escala física cúbica descrita antes.

```text
draw():
  accumulator += min(deltaTime, frameClamp)
  while accumulator >= fixedStep:
    system.step(fixedStep)
    accumulator -= fixedStep
  system.renderTrailsAndBodies()
  telemetry.render()

SolarSystem.step(h):
  computeAccelerations()                 // gravedad pareja + radiación + drag
  velocityVerletPosition(h)
  computeAccelerations()                 // aceleración en nueva posición
  velocityVerletVelocity(h)
  collisions = detectPairsOnce()
  resolveMergeOrFragment(collisions)      // masa y momento explícitos
  updateOrbitalStates()
  telemetry.sample()
```

## 7. Protocolo de exploración y rúbrica

Invitar primero a alguien a predecir el efecto de modificar una variable sin explicar las reglas. Probar un cambio por vez, registrar semilla, `G`, masa, dispersión, fricción y duración; guardar captura de estelas y curvas. En la bitácora documentar boceto, hipótesis, unidades, prueba y explicación de divergencias.

Para autoevaluar sobre 25 cada criterio de Unidad 7, usar evidencia: **cumplimiento** (sistema en web y cuerpos legibles), **comprensión** (derivación de aceleración/Verlet y prueba de momento), **interacción e identidad** (predicciones contrastadas sobre acreción/eyección) y **resolución/experiencia** (estelas, escala legible, controles y métricas claras). No asignar puntajes antes de realizar la prueba con otra persona.

### Referencias de encuadre

- Unidad 7, *Word as a Playable System*: https://juanferfranco.github.io/simulacion-2026-20/units/unit7/
- *The Nature of Code*, cap. 6 — Physics Libraries: https://natureofcode.com/physics-libraries/