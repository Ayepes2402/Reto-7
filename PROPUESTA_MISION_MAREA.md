# MAREA: demostrador NASA/JPL de una red autónoma para Mars Sample Return

**M**alla **A**utónoma de **R**econocimiento y **E**xploración **A**daptativa  
Propuesta académica para la Unidad 7 — Simulación, modelos basados en agentes y comportamiento emergente.

> MAREA es una simulación académica conceptual, no está afiliada, patrocinada ni validada por NASA/JPL. Usa como escenario de referencia Mars Sample Return y el delta del cráter Jezero; no es un simulador oficial, no modela una misión espacial real ni reemplaza análisis de ingeniería de vuelo.

## 1. Título y concepto de ingeniería

### Visión de misión

MAREA es un demostrador de operaciones de superficie para una arquitectura conceptual de retorno de muestras marcianas. En el escenario de referencia NASA/JPL de Mars Sample Return, despliega un módulo base (lander), una flota de rovers terrestres y drones de reconocimiento sobre el delta del cráter Jezero. Sin teleoperación continua desde la Tierra, cada vehículo toma decisiones locales con sensores incompletos. La base es origen de energía, recepción de ciencia y raíz de comunicación. El enjambre debe descubrir terreno, localizar y recuperar muestras, mantener una ruta de radio hasta la base y preservar energía para volver.

La capa de enlace local es una **red ad-hoc store-and-forward**. Cada agente acumula su propio mapa parcial y mensajes de ciencia mientras está desconectado. Cuando una ruta multi-salto vuelve a conectarlo con el lander, sus datos se fusionan y se encaminan por la red. No se presupone comunicación instantánea con la Tierra: la base representa el punto de entrega local, y el retardo interplanetario queda fuera del alcance de esta simulación 2D.

### Pregunta de investigación y comportamiento emergente

**Pregunta:** ¿qué equilibrio entre autonomía de exploración, persistencia de la malla y coste energético produce más terreno científicamente útil por unidad de batería?

De reglas locales pueden surgir: (a) frentes de exploración que se abren alrededor de zonas ya cartografiadas; (b) cadenas de agentes que forman puentes de radio entre expediciones y base; (c) ciclos colectivos de salida, desconexión, relevo y retorno; (d) concentración de vehículos alrededor de muestras ricas; y (e) una frontera de compromiso entre cobertura amplia y retorno seguro. Ninguna regla asigna una ruta global a todos los vehículos; el patrón colectivo nace de vecinos, mapa local, autonomía y conectividad.

**Atributo semántico:** resiliencia cooperativa. El sistema muestra que explorar más lejos no es progreso si la información no puede regresar o si el vehículo no conserva energía para volver. La malla visible representa cooperación como infraestructura y no como contacto decorativo.

**Contexto de uso:** pieza de laboratorio / presentación proyectada. La audiencia altera recursos y condiciones en vivo, observa los cambios de topología de red y predice la respuesta del enjambre. La acción opcional de marcar un punto de interés permite comparar decisión autónoma y guía humana de alto nivel.

## 2. Arquitectura de agentes y clases

### Entorno y tiempo

- Mundo 2D continuo en coordenadas de pantalla, con discretización auxiliar para el mapa de cobertura. Una celda representa una unidad de terreno conocido; no equivale a una resolución de sensor real.
- Simulación en segundos de misión. El integrador limita `dt` para estabilidad: `dt = min(deltaTime / 1000, 0.033)`. Las métricas se muestrean a 2 Hz y se conservan en una ventana móvil.
- Fases por tick: observar snapshot local -> actualizar FSM -> calcular steering -> integrar movimiento/batería -> analizar muestras -> reconstruir grafo de radio -> sincronizar mensajes/maps -> calcular telemetría -> renderizar.
- Los agentes no leen el mapa global ni telemetría global para decidir. Solo consultan sus celdas conocidas, entidades detectadas por sensor y vecinos de radio disponibles.

### Clases OOP

| Clase | Estado / atributos | Responsabilidad |
| --- | --- | --- |
| `Agent` (base) | `id`, `position`, `velocity`, `acceleration`, `heading`, `battery`, `solarRate`, `sensorRadius`, `radioRadius`, `maxSpeed`, `maxForce`, `state`, `stateTimer`, `knownCells`, `dataQueue` | Integración vectorial, fuerzas, percepción local, mapa parcial, consumo y carga solar. |
| `RoverAgent extends Agent` | `sampleCapacity`, `samples[]`, `wheelRadius`, `analysisTarget`, `analysisProgress`, `returnThreshold` | Navegación terrestre, análisis in situ y retorno físico con carga. Es el único agente que recoge muestras en la versión base. |
| `DroneAgent extends Agent` | `flightAltitude`, `flightBatteryFactor`, `surveyRadius`, `relayPriority` | Reconocimiento rápido, escaneo de celdas y evaluación de accesibilidad; puede actuar como repetidor, pero su consumo por distancia es mayor. |
| `BaseLander` | `position`, `radioRadius`, `chargeRadius`, `sampleArchive`, `mapArchive`, `connectedAgentIds` | Raíz de conectividad, estación de recarga y sumidero de datos/muestras entregados. |
| `ResourceSample` | `id`, `position`, `scienceValue`, `analyzed`, `collected`, `reported` | Objetivo científico del entorno. Solo se marca `reported` al sincronizarse una ruta a base. |
| `TerrainObstacle` | `position`, `radius`, `type`, `hazardCost` | Roca/cráter: colisión, oclusión de señal y campo potencial de navegación. |
| `SimulationSystem` | arrays de entidades, parámetros, grafo de radio, celdas globales, reloj y pausa | Coordina fases deterministas, generación del mapa, radio, interacción, métricas y reinicio. |
| `Telemetry` | buffers temporales | Calcula y dibuja series de cobertura, autonomía y retorno científico. |

### Modelo cinemático y sensores

Todos los vehículos usan vectores 2D `p=(x,y)`, `v=(vx,vy)`, `a=(ax,ay)`. Una fuerza específica se calcula como `steering = desiredVelocity - v`, limitada por `maxForce`; `a += steering / mass`. Integración semi-implícita: `v = limit(v + a*dt, maxSpeed)` y luego `p += v*dt`. Los rovers y drones comparten interfaz; sus velocidades, radios de sensor y costes energéticos son distintos.

`sensorRadius` aproxima LiDAR/cámara y determina qué celdas pueden marcarse como exploradas. La percepción de agentes/obstáculos requiere estar dentro del rango y, cuando está activo LOS, que el segmento no cruce una roca. `radioRadius` es independiente: ver no significa poder transmitir. Esta distinción permite estudiar exploración sin enlace y recuperación posterior de datos.

La batería `b` pertenece a `[0,100]`. Modelo de primer orden: `db/dt = solarRate * illumination - idleDrain - distanceCost*|v| - scanCost*scanActive - flightCost`. La iluminación es un parámetro abstracto normalizado; no representa efemérides ni generación solar real. En la base, la carga se limita a `100` y las muestras se descargan al archivo científico.

### FSM de rover y drone

| Estado | Acción | Transición por trigger |
| --- | --- | --- |
| `EXPLORE` | Steering hacia una frontera entre celdas conocidas/desconocidas; flocking suave, separación y escaneo | Muestra detectada -> `ANALYZING`; batería bajo umbral o carga llena -> `RETURN_BASE`; falta ruta de radio y posee datos -> `RELAY_NODE` |
| `ANALYZING` | Reducir velocidad, escanear muestra y añadir observación científica a la cola local | análisis completo -> `EXPLORE` (y muestra se recoge si es Rover y queda capacidad); riesgo/energía baja -> `RETURN_BASE` |
| `RETURN_BASE` | Seek a lander por ruta navegable, reducir riesgo y transmitir al restablecer conectividad | en radio de carga/base -> recargar, descargar muestras/datos; autonomía suficiente y carga disponible -> `EXPLORE` |
| `RELAY_NODE` | Buscar posición de puente: suficientemente cerca de un grupo desconectado y de un nodo conectado; conservar energía y anunciar presencia | aumenta componente conectada o recibe orden de retorno -> `EXPLORE` / `RETURN_BASE` |

Los triggers tienen prioridad: seguridad/retorno > análisis > relé > exploración. Un vehículo no abandona `RETURN_BASE` hasta superar `resumeBattery` y liberar capacidad de muestra. Un drone comparte estados pero pondera más la vuelta cuando su reserva cae; no recoge muestras físicamente.

### Máquina de estado del lander (sistema)

`LISTEN` (recibe paquetes del componente conectado) -> `CHARGING` si hay agente en alcance con batería baja -> `ARCHIVING` mientras sincroniza mapa/muestra -> `LISTEN` al vaciar colas. Este ciclo no bloquea a otros agentes: se procesa con ancho de banda abstracto por tick.

## 3. Reglas de interacción y algoritmos

### Flocking de cobertura y steering

Sea `N_i` el conjunto de agentes observados por `i`:

- **Separación:** `S_i = mean((p_i-p_j)/max(d_ij^2,epsilon))`; el radio de separación se ajusta al radio de sensor para evitar superposición improductiva de barridos.
- **Alineación:** `A_i = normalize(mean(v_j))*maxSpeed - v_i`.
- **Cohesión:** `C_i = seek(mean(p_j))`; su peso baja para agentes con una frontera sin explorar atractiva y sube si el agente quedó aislado de la malla.
- **Búsqueda de frontera:** elegir, entre celdas no visitadas vecinas a la región conocida, una con mayor ganancia esperada `G = informationGain - alpha*distance - beta*hazard - gamma*disconnectRisk`. El prototipo usa una aproximación estocástica local para que el patrón sea inspeccionable.
- **Evitación:** para obstáculo `k`, si distancia de superficie `d < avoidRadius`, `O_k = normalize(p_i-p_k) * (1/d - 1/avoidRadius) * avoidGain`. Sumar repulsión entre agentes para evitar colisiones y una fuerza de borde del mapa.

`F_i = limit(wS*S_i + wA*A_i + wC*C_i + wG*seek(frontier) + wO*O + wR*radioBridge, maxForce)`. Drones suben `wG` y velocidad, pero pagan más energía; rovers ponderan `wO`/riesgo y retornan antes. La fuerza de puente orienta solo al agente elegido como relay hacia una posición intermedia, no mueve a toda la flota como bloque.

### Red ad-hoc de comunicación

En cada actualización se construye un grafo no dirigido `G=(V,E)`, con vértices lander + agentes. Una arista `(i,j)` existe si `distance(i,j) <= min(radio_i, radio_j)` y LOS de radio está libre (según parámetro). Una búsqueda BFS/DFS desde `BaseLander` determina la componente conectada y los saltos mínimos.

Los datos se sincronizan solo por aristas activas, con transferencia store-and-forward: cada nodo intercambia celdas observadas y mensajes de muestra hasta que ambos tienen el elemento; los nodos conectados pueden retransmitirlo en ticks posteriores. Al alcanzar el lander se marca como recibido. Si un agente tiene cola de datos no entregada y no pertenece a la componente base, puede entrar en `RELAY_NODE`. Se selecciona puente por beneficio de conectividad dividido por coste de desplazamiento/energía.

El coste para una actualización naive es O(V²) para probar enlaces + O(V+E) BFS + coste de sincronizar conjuntos. Para flotas grandes, usar spatial hash para vecindad de radio, IDs de secuencia para deduplicar paquetes, cuotas de ancho de banda y TTL para mensajes redundantes.

### Navegación y terreno hostil

El mapa se modela con obstáculos circulares. Su campo de repulsión se combina con seek a frontera y límites; al estar en `RETURN_BASE`, la dirección de retorno se calcula con waypoints evitando el obstáculo más cercano, no con una fuerza que permita atravesarlo. La línea de vista para radio/sensor usa intersección segmento-círculo. Una extensión debe separar colisión sólida, peligro de vuelco y atenuación radio: no son el mismo fenómeno físico.

## 4. UI y parámetros en tiempo real

| Parámetro | Rango recomendado | Efecto esperado |
| --- | --- | --- |
| Número de rovers | 1-12 | Capacidad de transporte y densidad de cobertura terrestre. |
| Número de drones | 0-8 | Cobertura rápida y nodos de repetición con mayor coste energético. |
| Radio de comunicación | 70-300 unidades | Cambia conectividad, número de saltos y datos aislados. |
| Desgaste energético | 0.05-0.8 por segundo | Controla la presión de retorno; se distingue del coste de movimiento. |
| Densidad de muestras | 4-30 objetivos | Cambia valor científico y congestión en destinos. |
| Densidad de obstáculos | 3-24 cuerpos | Afecta rutas, escaneo y LOS de radio. |
| Velocidad máxima | 25-110 unidades/s | Afecta tiempo de cobertura y gasto por distancia. |
| LOS / red visible | toggle | Oclusión sensorial/radio y visualización de aristas. |
| Pausa / reinicio | acción | Inspección paso a paso y repetición de experimento. |
| Marcar interés | click en mapa | Añade una preferencia temporal de exploración; la política local sigue teniendo veto por seguridad. |

Los sliders alteran `SimulationSystem.params` inmediatamente. Reiniciar crea una nueva realización estocástica; para experimentos comparables debe añadirse una semilla fija y guardar parámetros junto a cada captura.

## 5. Métricas y telemetría

1. **Cobertura global reportada (%)** = celdas únicas recibidas por lander / celdas transitables del mapa. Separar cobertura local de cobertura entregada evita premiar datos que nunca regresan.
2. **Eficiencia energética del enjambre (%)** = batería agregada restante / batería agregada inicial, con curva de energía media y consumo por minuto.
3. **Muestras científicas reportadas por hora de misión** = conteo en archivo de lander / horas simuladas. Registrar por separado analizadas, cargadas y recibidas para detectar cuellos de botella.
4. **Conectividad de malla (%)** = agentes en componente conectada a base / total de agentes; complemento: saltos promedio al lander.
5. **Agentes con retorno seguro (%)** = agentes sin batería crítica y con ruta de radio/base disponible.

Muestrear a 2 Hz, ventana móvil de 120 muestras. Hipótesis de prueba: aumentar radio mejora cobertura reportada antes que cobertura local; agregar drones acelera mapas, pero puede reducir autonomía media; elevar desgaste aumenta retornos tempranos y puede incrementar seguridad a costa de área científica. Cambiar un parámetro por experimento, mantener semilla y comparar curvas.

## 6. Código base p5.js

La aplicación ejecutable vive en `index.html`, `style.css` y `sketch.js` (p5.js global por CDN para permitir ejecución web sencilla). `sketch.js` contiene `RoverAgent`, `DroneAgent`, `BaseLander`, `ResourceSample`, `TerrainObstacle`, `Telemetry` y `SimulationSystem`. El código es un prototipo 2D educativo: la capa de comunicación y energía está simplificada, pero cada limitación es explícita y extensible.

### Bucle de simulación

```text
SimulationSystem.step(dt):
  snapshot = perceiveLocally()               // Rango sensor/LOS; no mapa omnisciente
  agents.updateFSM(snapshot, dt)              // EXPLORE / ANALYZING / RETURN_BASE / RELAY_NODE
  agents.calculateSteering(snapshot)          // Reynolds + frontier seek + repulsion
  agents.integrate(dt)                        // Movimiento y coste energetico
  agents.scanAndAnalyze(dt)                   // Celdas conocidas y ciencia en cola
  graph = buildRadioGraph()                   // Radio + LOS
  connected = BFS(graph, lander)               // Componentes y rutas de retransmision
  synchronizePackets(connected, bandwidth)    // Store-and-forward por arista
  lander.chargeAndArchive(agents, dt)
  telemetry.sample(coverage, battery, samples, connectivity)
```

### Validez y límites del modelo

La simulación es adecuada para estudiar acoplamiento agente-entorno y comparar reglas, no para certificar hardware. No modela dinámica orbital, térmica, polvo, incertidumbre de actuadores, latencia real Tierra-Marte, modelos de antena, terreno DEM, daño, ni límites de vuelo. Una siguiente iteración debe incorporar resolución/ruido de sensores, mapas de elevación, perfiles energéticos separados por vehículo y pérdida probabilística de paquetes.

## 7. Protocolo de presentación y bitácora

Antes de explicar la tesis, invitar a otra persona a modificar radio, número de drones o desgaste y anticipar una consecuencia. Registrar predicción, parámetros, semilla, captura de la arena y curvas. Contrastar por separado “explorado” y “entregado a base”. En la bitácora incluir referentes, diagramas, FSM, ecuaciones, pruebas con otras personas y una autoevaluación 0-25 por criterio de la rúbrica, siempre sustentada con evidencia real.

### Referencias de encuadre

- Unidad 7, *Word as a Playable System*: https://juanferfranco.github.io/simulacion-2026-20/units/unit7/
- *The Nature of Code*, Physics Libraries: https://natureofcode.com/physics-libraries/
- NASA Mars Sample Return: https://science.nasa.gov/mission/mars-sample-return/
- NASA Ingenuity Mars Helicopter: https://science.nasa.gov/mission/mars-2020-perseverance/ingenuity-mars-helicopter/