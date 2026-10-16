const SPACE_COLORS = {
  background: "#07101d",
  star: "#ffd782",
  cyan: "#8be3dc",
  planet: ["#61c7dd", "#f1ad70", "#a99bea", "#e27ca2"],
  white: "#eaf2f4"
};

let systemManager;
let canvasHost;
let lastFrameTime = 0;
let uiOverlay;

function setup() {
  canvasHost = document.getElementById("simulation-canvas");
  const canvasWidth = Math.max(320, canvasHost.clientWidth || 900);
  const canvasHeight = canvasHost.clientHeight || windowHeight;
  const canvas = createCanvas(canvasWidth, canvasHeight);
  canvas.parent(canvasHost);
  pixelDensity(Math.min(window.devicePixelRatio || 1, 2));
  uiOverlay = new UIOverlay();
  systemManager = new SystemManager(width, height, uiOverlay);
  lastFrameTime = millis();
}

function draw() {
  const now = millis();
  const dt = Math.min((now - lastFrameTime) / 1000, 0.04);
  lastFrameTime = now;
  systemManager.update(dt);
  systemManager.render();
}

function windowResized() {
  if (!canvasHost || !systemManager) return;
  const oldWidth = width;
  const oldHeight = height;
  const newWidth = Math.max(320, canvasHost.clientWidth || 900);
  const newHeight = canvasHost.clientHeight || windowHeight;
  resizeCanvas(newWidth, newHeight);
  systemManager.resize(newWidth, newHeight, newWidth / oldWidth, newHeight / oldHeight);
}

function mousePressed() {
  if (!systemManager || mouseX < 0 || mouseX > width || mouseY < 0 || mouseY > height) return;
  systemManager.handlePointer(mouseX, mouseY, true);
  return false;
}

function mouseMoved() {
  if (systemManager) systemManager.setDestination(mouseX, mouseY);
}

function mouseDragged() {
  if (systemManager) systemManager.setDestination(mouseX, mouseY);
  return false;
}

Object.assign(window, { setup, draw, windowResized, mousePressed, mouseMoved, mouseDragged });

function seededRandom(seed) {
  let state = seed >>> 0;
  return function () {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function rgba(rgb, alpha) {
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`;
}

function pathEllipse(ctx, x, y, width, height, rotation = 0) {
  ctx.beginPath();
  ctx.ellipse(x, y, Math.max(width / 2, 0.01), Math.max(height / 2, 0.01), rotation, 0, Math.PI * 2);
}

const PLANET_STYLES = [
  { kind: "ocean", spin: 0.045, ring: false, moon: true },
  { kind: "desert", spin: 0.03, ring: false, moon: false },
  { kind: "gas", spin: 0.02, ring: true, moon: false },
  { kind: "storm", spin: 0.06, ring: false, moon: true }
];

// Manchas de superficie (continentes, nubes, cráteres...) generadas con semilla fija.
function buildPlanetFeatures(kind, seed) {
  const rnd = seededRandom(seed);
  const between = (min, max) => min + (max - min) * rnd();
  const features = [];
  const add = (count, make) => {
    for (let i = 0; i < count; i++) {
      features.push(Object.assign({ u: rnd(), rot: between(-0.4, 0.4), speed: 1, crater: false }, make(i)));
    }
  };

  if (kind === "ocean") {
    add(7, () => ({ v: between(-0.6, 0.6), w: between(0.4, 0.8), h: between(0.18, 0.38), col: [118, 190, 128], a: 0.85 }));
    add(4, () => ({ v: between(-0.5, 0.5), w: between(0.2, 0.4), h: between(0.1, 0.2), col: [214, 201, 150], a: 0.8 }));
    add(9, () => ({ v: between(-0.8, 0.8), w: between(0.5, 1.0), h: between(0.07, 0.13), col: [255, 255, 255], a: 0.34, speed: 1.6 }));
  } else if (kind === "desert") {
    add(6, () => ({ v: between(-0.6, 0.6), w: between(0.5, 0.9), h: between(0.15, 0.3), col: [150, 80, 50], a: 0.38 }));
    add(8, () => ({ v: between(-0.8, 0.8), w: between(0.5, 1.0), h: between(0.06, 0.1), col: [255, 215, 160], a: 0.28 }));
    add(6, () => {
      const size = between(0.14, 0.24);
      return { v: between(-0.7, 0.7), w: size, h: size, col: [92, 48, 32], a: 0.5, crater: true };
    });
  } else if (kind === "gas") {
    add(1, () => ({ u: 0.3, v: 0.32, w: 0.55, h: 0.24, col: [226, 118, 108], a: 0.9 }));
    add(8, () => ({ v: between(-0.8, 0.8), w: between(0.8, 1.2), h: between(0.05, 0.09), col: [255, 255, 255], a: 0.14, speed: 1.2 }));
  } else {
    add(9, () => ({ v: between(-0.8, 0.8), w: between(0.6, 1.0), h: between(0.09, 0.15), col: [255, 214, 232], a: 0.32, speed: 1.8 }));
    add(6, () => ({ v: between(-0.7, 0.7), w: between(0.5, 0.9), h: between(0.12, 0.22), col: [126, 44, 96], a: 0.34 }));
    add(3, () => {
      const size = between(0.26, 0.34);
      return { v: between(-0.5, 0.5), w: size, h: size, col: [255, 240, 248], a: 0.5 };
    });
  }
  return features;
}

class Planet {
  constructor(index, letter, orbitRadius, orbitAngle, angularVelocity, radius, tint) {
    this.index = index;
    this.letter = letter;
    this.orbitRadius = orbitRadius;
    this.orbitAngle = orbitAngle;
    this.angularVelocity = angularVelocity;
    this.radius = radius;
    this.color = color(tint);
    this.position = createVector(0, 0);
    this.isVisited = false;
    this.gravity = 95 + index * 18;
    this.beamEnergy = 0;
    this.particles = [];
    this.trail = [];
    this.style = PLANET_STYLES[index % PLANET_STYLES.length];
    this.rgb = [Math.round(red(this.color)), Math.round(green(this.color)), Math.round(blue(this.color))];
    this.light = lerpColor(this.color, color(255, 255, 255), 0.45);
    this.features = buildPlanetFeatures(this.style.kind, 9100 + index * 77);
  }

  update(dt, center, system) {
    this.orbitAngle += this.angularVelocity * dt;
    this.position.set(
      center.x + cos(this.orbitAngle) * this.orbitRadius * system.orbitScaleX,
      center.y + sin(this.orbitAngle) * this.orbitRadius * system.orbitScaleY
    );
    this.beamEnergy = Math.max(0, this.beamEnergy - dt * 0.7);

    if (frameCount % 3 === 0) {
      this.trail.push(this.position.copy());
      if (this.trail.length > 38) this.trail.shift();
    }

    for (const particle of this.particles) {
      particle.position.add(particle.velocity.copy().mult(dt));
      particle.life -= dt;
    }
    this.particles = this.particles.filter((particle) => particle.life > 0);
  }

  visit(system) {
    if (this.isVisited) return;
    this.isVisited = true;
    this.beamEnergy = 1.8;
    for (let index = 0; index < 26; index++) {
      const direction = p5.Vector.random2D().mult(random(18, 72));
      this.particles.push({ position: this.position.copy(), velocity: direction, life: random(0.6, 1.5) });
    }
    system.registerVisit(this);
  }

  contains(pointX, pointY, padding = 0) {
    return dist(pointX, pointY, this.position.x, this.position.y) < this.radius + padding;
  }

  renderOrbit(center, system) {
    noFill();
    stroke(140, 174, 207, 36);
    strokeWeight(1);
    drawingContext.setLineDash([3, 7]);
    ellipse(center.x, center.y, this.orbitRadius * 2 * system.orbitScaleX, this.orbitRadius * 2 * system.orbitScaleY);
    drawingContext.setLineDash([]);
  }

  renderTrail() {
    if (this.trail.length < 2) return;
    noFill();
    for (let index = 1; index < this.trail.length; index++) {
      const alpha = map(index, 1, this.trail.length - 1, 5, 62);
      stroke(red(this.color), green(this.color), blue(this.color), alpha);
      strokeWeight(1);
      line(this.trail[index - 1].x, this.trail[index - 1].y, this.trail[index].x, this.trail[index].y);
    }
  }

  render(center, system, time) {
    this.renderTrail();
    const ctx = drawingContext;
    const pulse = 1 + sin(time * 2.6 + this.index) * 0.03;
    const radius = this.radius * pulse;
    const x = this.position.x;
    const y = this.position.y;
    const nearby = dist(system.ship.position.x, system.ship.position.y, x, y) < system.interactionRadius * 1.6;

    // Dirección de la luz: siempre viene de la estación central.
    let lightX = center.x - x;
    let lightY = center.y - y;
    const lightDist = Math.hypot(lightX, lightY) || 1;
    lightX /= lightDist;
    lightY /= lightDist;

    this.renderAtmosphereGlow(ctx, x, y, radius);

    if (this.isVisited) {
      noFill();
      stroke(139, 227, 220, 95 + sin(time * 4) * 45);
      strokeWeight(1.2);
      ellipse(x, y, radius * 3.2);
    }

    if (this.style.moon) {
      noFill();
      stroke(255, 255, 255, 16);
      strokeWeight(1);
      ellipse(x, y, radius * 4.2, radius * 1.24);
    }
    if (this.style.ring) this.renderRing(x, y, radius, false);
    if (this.style.moon) this.renderMoon(x, y, radius, time, lightX, lightY, false);

    this.renderSphere(ctx, x, y, radius, time, lightX, lightY);

    if (this.style.ring) this.renderRing(x, y, radius, true);
    if (this.style.moon) this.renderMoon(x, y, radius, time, lightX, lightY, true);

    for (const particle of this.particles) {
      noStroke();
      fill(139, 227, 220, map(particle.life, 0, 1.5, 0, 220, true));
      ellipse(particle.position.x, particle.position.y, 2.5);
    }

    if (!this.isVisited && nearby) {
      noFill();
      stroke(139, 227, 220, 125 + sin(time * 5) * 55);
      strokeWeight(1.1);
      drawingContext.setLineDash([3, 4]);
      ellipse(x, y, (radius + 14) * 2);
      drawingContext.setLineDash([]);
    }

    if (this.beamEnergy > 0) this.renderCommunicationBeam(center, time);
  }

  renderAtmosphereGlow(ctx, x, y, r) {
    ctx.save();
    const glow = ctx.createRadialGradient(x, y, r * 0.85, x, y, r * 2.6);
    glow.addColorStop(0, rgba(this.rgb, 0.3));
    glow.addColorStop(0.45, rgba(this.rgb, 0.08));
    glow.addColorStop(1, rgba(this.rgb, 0));
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(x, y, r * 2.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  renderSphere(ctx, x, y, r, time, lightX, lightY) {
    const kind = this.style.kind;
    // Dentro del clip solo se usa el contexto 2D nativo para no desincronizar la caché de estilos de p5.
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.clip();

    ctx.fillStyle = rgba(this.rgb, 1);
    ctx.fillRect(x - r, y - r, r * 2, r * 2);

    if (kind === "gas") this.drawGasBands(ctx, x, y, r, time);
    if (kind === "ocean") {
      ctx.fillStyle = "rgba(245, 250, 255, 0.75)";
      pathEllipse(ctx, x, y - r * 0.98, r * 1.1, r * 0.42);
      ctx.fill();
      ctx.fillStyle = "rgba(245, 250, 255, 0.6)";
      pathEllipse(ctx, x, y + r * 0.98, r * 1.0, r * 0.36);
      ctx.fill();
    }
    if (kind === "desert") {
      ctx.fillStyle = "rgba(255, 240, 230, 0.5)";
      pathEllipse(ctx, x, y - r * 0.99, r * 0.8, r * 0.3);
      ctx.fill();
    }

    for (const feature of this.features) this.drawFeature(ctx, feature, x, y, r, time);

    // Sombreado: la cara hacia la estación se ilumina y el lado opuesto cae en penumbra.
    const cx = x + lightX * r * 0.5;
    const cy = y + lightY * r * 0.5;
    const shade = ctx.createRadialGradient(cx, cy, r * 0.1, cx, cy, r * 1.55);
    shade.addColorStop(0, "rgba(255, 255, 255, 0.24)");
    shade.addColorStop(0.35, "rgba(255, 255, 255, 0)");
    shade.addColorStop(0.62, "rgba(6, 10, 24, 0.35)");
    shade.addColorStop(1, "rgba(4, 8, 20, 0.9)");
    ctx.fillStyle = shade;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
    ctx.restore();

    // Borde: halo atmosférico en el lado iluminado.
    const facing = Math.atan2(lightY, lightX);
    noFill();
    stroke(255, 255, 255, 38);
    strokeWeight(1);
    ellipse(x, y, r * 2);
    stroke(red(this.light), green(this.light), blue(this.light), 170);
    strokeWeight(1.5);
    arc(x, y, r * 2, r * 2, facing - 1.1, facing + 1.1);
    noStroke();
  }

  drawGasBands(ctx, x, y, r, time) {
    const edges = [-1, -0.78, -0.58, -0.4, -0.2, 0, 0.2, 0.4, 0.62, 0.82, 1];
    const tones = [
      [205, 192, 248, 0.5],
      [132, 114, 208, 0.45],
      [226, 214, 250, 0.4],
      [102, 86, 184, 0.5],
      [186, 170, 240, 0.45]
    ];
    for (let index = 0; index < edges.length - 1; index++) {
      const tone = tones[index % tones.length];
      ctx.fillStyle = rgba(tone, tone[3]);
      ctx.fillRect(x - r, y + edges[index] * r, r * 2, (edges[index + 1] - edges[index]) * r + 0.5);
    }
    ctx.strokeStyle = "rgba(255, 255, 255, 0.13)";
    ctx.lineWidth = 0.8;
    for (let index = 1; index < edges.length - 1; index++) {
      ctx.beginPath();
      for (let px = -r; px <= r; px += 4) {
        const py = y + edges[index] * r + Math.sin(px * 0.09 + time * 0.4 + index) * 1.2;
        if (px === -r) ctx.moveTo(x + px, py);
        else ctx.lineTo(x + px, py);
      }
      ctx.stroke();
    }
  }

  // Cada mancha gira alrededor del planeta (proyección esférica simple).
  drawFeature(ctx, feature, x, y, r, time) {
    const phase = (feature.u + time * this.style.spin * feature.speed) % 1;
    const lon = phase * Math.PI * 2 - Math.PI;
    const facing = Math.cos(lon);
    if (facing <= 0.04) return;
    const lat = feature.v * Math.PI * 0.5 * 0.95;
    const cosLat = Math.cos(lat);
    const px = x + r * Math.sin(lon) * cosLat;
    const py = y + r * Math.sin(lat);
    const fade = Math.pow(facing, 0.55);
    const width = feature.w * r * 1.2 * facing;
    const height = feature.h * r * 1.2 * cosLat;
    const rotation = feature.rot * facing;

    if (feature.crater) {
      ctx.fillStyle = rgba(feature.col, feature.a * fade);
      pathEllipse(ctx, px, py, width, height, rotation);
      ctx.fill();
      ctx.strokeStyle = `rgba(255, 236, 214, ${0.4 * fade})`;
      ctx.lineWidth = 0.8;
      pathEllipse(ctx, px - r * 0.01, py - r * 0.01, width * 0.92, height * 0.92, rotation);
      ctx.stroke();
      return;
    }
    // Dos pasadas (halo suave + núcleo) para bordes menos duros.
    ctx.fillStyle = rgba(feature.col, feature.a * fade * 0.35);
    pathEllipse(ctx, px, py, width * 1.28, height * 1.28, rotation);
    ctx.fill();
    ctx.fillStyle = rgba(feature.col, feature.a * fade * 0.65);
    pathEllipse(ctx, px, py, width, height, rotation);
    ctx.fill();
  }

  renderRing(x, y, r, front) {
    const bands = [[1.55, 0.12, 120], [1.7, 0.05, 70], [1.84, 0.2, 140], [2.08, 0.07, 80]];
    push();
    translate(x, y);
    rotate(-0.32);
    noFill();
    strokeCap(SQUARE);
    for (const [factor, weight, alpha] of bands) {
      stroke(red(this.light), green(this.light), blue(this.light), alpha);
      strokeWeight(r * weight);
      arc(0, 0, r * factor * 2, r * factor * 2 * 0.28, front ? 0 : PI, front ? PI : TWO_PI);
    }
    strokeCap(ROUND);
    pop();
  }

  renderMoon(x, y, r, time, lightX, lightY, front) {
    const angle = time * 0.9 + this.index * 2.1;
    if ((Math.sin(angle) > 0) !== front) return;
    const mx = x + Math.cos(angle) * r * 2.1;
    const my = y + Math.sin(angle) * r * 0.62;
    const mr = r * 0.24;
    const ctx = drawingContext;
    ctx.save();
    const gradient = ctx.createRadialGradient(mx + lightX * mr * 0.4, my + lightY * mr * 0.4, mr * 0.1, mx, my, mr * 1.1);
    gradient.addColorStop(0, "#f4f6f9");
    gradient.addColorStop(0.6, "#98a3b3");
    gradient.addColorStop(1, "#3a4455");
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(mx, my, mr, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  renderCommunicationBeam(center, time) {
    const flicker = 0.45 + 0.35 * sin(time * 13 + this.index);
    stroke(139, 227, 220, 60 + flicker * 110);
    strokeWeight(1 + flicker * 1.5);
    drawingContext.setLineDash([5, 6]);
    line(this.position.x, this.position.y, center.x, center.y);
    drawingContext.setLineDash([]);
    noStroke();
    fill(139, 227, 220, 130);
    const packetT = (time * 0.7 + this.index * 0.21) % 1;
    ellipse(lerp(this.position.x, center.x, packetT), lerp(this.position.y, center.y, packetT), 4);
  }
}

class Spaceship {
  constructor(position) {
    this.position = position.copy();
    this.velocity = createVector(0, 0);
    this.acceleration = createVector(0, 0);
    this.destination = position.copy();
    this.radius = 8;
    this.maxSpeed = 150;
    this.maxForce = 185;
    this.trail = [];
    this.enginePulse = 0;
    this.heading = 0;
    this.exhaust = [];
  }

  setDestination(target) {
    this.destination = target.copy();
  }

  applyForce(force) {
    this.acceleration.add(force);
  }

  steeringForce(target, dt) {
    const offset = p5.Vector.sub(target, this.position);
    const distance = offset.mag();
    if (distance < 1) return createVector(0, 0);
    const arrivalSpeed = map(Math.min(distance, 105), 0, 105, 0, this.maxSpeed);
    const desiredVelocity = offset.setMag(Math.min(this.maxSpeed, arrivalSpeed));
    return desiredVelocity.sub(this.velocity).limit(this.maxForce);
  }

  update(dt, system) {
    const desiredForce = this.steeringForce(this.destination, dt).mult(1.05);
    this.applyForce(desiredForce);

    // El campo central y los planetas aportan gravedad local al vehículo explorador.
    const centralOffset = p5.Vector.sub(system.center, this.position);
    const centralDistance = Math.max(centralOffset.mag(), 32);
    this.applyForce(centralOffset.setMag(5200 / (centralDistance * centralDistance)));
    for (const planet of system.planets) {
      const offset = p5.Vector.sub(planet.position, this.position);
      const distanceSquared = Math.max(offset.magSq(), 95);
      this.applyForce(offset.setMag(planet.gravity / distanceSquared));
    }

    this.velocity.add(this.acceleration.copy().mult(dt)).limit(this.maxSpeed);
    this.position.add(this.velocity.copy().mult(dt));
    this.acceleration.mult(0);
    this.position.x = constrain(this.position.x, 14, system.width - 14);
    this.position.y = constrain(this.position.y, 14, system.height - 14);
    this.enginePulse += dt * (3 + this.velocity.mag() * 0.025);

    // Giro suave hacia donde apunta la nave.
    const targetHeading = this.velocity.magSq() > 4 ? this.velocity.heading() : p5.Vector.sub(this.destination, this.position).heading();
    const headingDiff = Math.atan2(Math.sin(targetHeading - this.heading), Math.cos(targetHeading - this.heading));
    this.heading += headingDiff * Math.min(1, dt * 8);

    // Partículas del escape del motor.
    if (this.velocity.mag() > 9 && this.exhaust.length < 80) {
      const dirX = Math.cos(this.heading);
      const dirY = Math.sin(this.heading);
      const life = random(0.35, 0.7);
      this.exhaust.push({
        x: this.position.x - dirX * 16 + random(-1.5, 1.5),
        y: this.position.y - dirY * 16 + random(-1.5, 1.5),
        vx: -dirX * random(15, 35) + random(-6, 6),
        vy: -dirY * random(15, 35) + random(-6, 6),
        life,
        max: life,
        size: random(2, 4.5)
      });
    }
    for (const particle of this.exhaust) {
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.life -= dt;
    }
    this.exhaust = this.exhaust.filter((particle) => particle.life > 0);

    if (frameCount % 2 === 0 && this.velocity.mag() > 9) {
      this.trail.push(this.position.copy());
      if (this.trail.length > 34) this.trail.shift();
    }
  }

  render() {
    const ctx = drawingContext;

    // Estela de la trayectoria.
    if (this.trail.length > 1) {
      noFill();
      for (let index = 1; index < this.trail.length; index++) {
        stroke(128, 186, 255, map(index, 1, this.trail.length - 1, 4, 85));
        strokeWeight(map(index, 1, this.trail.length - 1, 0.8, 2.6));
        line(this.trail[index - 1].x, this.trail[index - 1].y, this.trail[index].x, this.trail[index].y);
      }
    }

    // Escape del motor (mezcla aditiva para que brille).
    blendMode(ADD);
    noStroke();
    for (const particle of this.exhaust) {
      const t = particle.life / particle.max;
      fill(lerp(90, 255, t), lerp(150, 170, t), lerp(255, 80, t), t * 140);
      ellipse(particle.x, particle.y, particle.size * (0.4 + t));
    }
    blendMode(BLEND);

    const thrust = constrain(this.velocity.mag() / this.maxSpeed, 0, 1);
    const flicker = Math.sin(this.enginePulse * 3.1) * 0.5 + 0.5;
    const blink = Math.floor(millis() / 450) % 2 ? 1 : 0.3;

    push();
    translate(this.position.x, this.position.y);
    rotate(this.heading);
    scale(1.35);

    // Halo suave alrededor de la nave.
    ctx.save();
    const halo = ctx.createRadialGradient(0, 0, 2, 0, 0, 24);
    halo.addColorStop(0, "rgba(128, 186, 255, 0.16)");
    halo.addColorStop(1, "rgba(128, 186, 255, 0)");
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(0, 0, 24, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Llama del propulsor: crece con la velocidad.
    const flameLength = 5 + thrust * 15 + flicker * 3;
    ctx.save();
    const flame = ctx.createLinearGradient(-10, 0, -10 - flameLength, 0);
    flame.addColorStop(0, "rgba(255, 255, 255, 0.95)");
    flame.addColorStop(0.35, "rgba(255, 200, 110, 0.85)");
    flame.addColorStop(1, "rgba(90, 150, 255, 0)");
    ctx.fillStyle = flame;
    ctx.beginPath();
    ctx.moveTo(-10, -2.4);
    ctx.quadraticCurveTo(-10 - flameLength * 0.6, -3, -10 - flameLength, 0);
    ctx.quadraticCurveTo(-10 - flameLength * 0.6, 3, -10, 2.4);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // Alas (una por lado, espejadas).
    for (const side of [-1, 1]) {
      ctx.save();
      ctx.scale(1, side);
      const wing = ctx.createLinearGradient(0, 3, 0, 15);
      wing.addColorStop(0, "#b8c9db");
      wing.addColorStop(1, "#5c7189");
      ctx.fillStyle = wing;
      ctx.strokeStyle = "rgba(255, 255, 255, 0.35)";
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      ctx.moveTo(4, 3.4);
      ctx.lineTo(-6, 15);
      ctx.lineTo(-12, 15);
      ctx.lineTo(-9.5, 3.4);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.save();
      ctx.clip();
      ctx.fillStyle = "#e55745";
      ctx.fillRect(-14, 11.2, 16, 2);
      ctx.restore();
      // Luz de navegación: roja a un lado, verde al otro.
      const navColor = side < 0 ? [255, 90, 80] : [90, 255, 150];
      const navGlow = ctx.createRadialGradient(-11, 14.4, 0, -11, 14.4, 4);
      navGlow.addColorStop(0, rgba(navColor, 0.7 * blink));
      navGlow.addColorStop(1, rgba(navColor, 0));
      ctx.fillStyle = navGlow;
      ctx.beginPath();
      ctx.arc(-11, 14.4, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = rgba(navColor, blink);
      ctx.beginPath();
      ctx.arc(-11, 14.4, 1.1, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Tobera del motor.
    ctx.save();
    ctx.fillStyle = "#27384b";
    ctx.fillRect(-12.5, -3.4, 4, 6.8);
    ctx.fillStyle = `rgba(255, 220, 160, ${0.55 + thrust * 0.4})`;
    pathEllipse(ctx, -12.5, 0, 2, 5.2);
    ctx.fill();
    ctx.restore();

    // Fuselaje con degradado y franja roja.
    ctx.save();
    const hull = ctx.createLinearGradient(0, -5, 0, 5);
    hull.addColorStop(0, "#fbfdff");
    hull.addColorStop(0.45, "#cddae6");
    hull.addColorStop(1, "#7388a0");
    ctx.fillStyle = hull;
    ctx.strokeStyle = "rgba(255, 255, 255, 0.7)";
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.moveTo(16, 0);
    ctx.bezierCurveTo(10, -3.2, 2, -5, -10, -4);
    ctx.lineTo(-11, -3.4);
    ctx.lineTo(-11, 3.4);
    ctx.lineTo(-10, 4);
    ctx.bezierCurveTo(2, 5, 10, 3.2, 16, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.save();
    ctx.clip();
    ctx.fillStyle = "#e55745";
    ctx.fillRect(-4.5, -6, 2, 12);
    ctx.fillStyle = "rgba(30, 50, 80, 0.45)";
    ctx.fillRect(-1.5, -6, 0.7, 12);
    ctx.restore();
    ctx.restore();

    // Cabina.
    ctx.save();
    const canopy = ctx.createRadialGradient(5.8, -0.6, 0.2, 5.2, 0, 4.5);
    canopy.addColorStop(0, "#f0ffff");
    canopy.addColorStop(0.5, "#4cc3de");
    canopy.addColorStop(1, "#0d4660");
    ctx.fillStyle = canopy;
    pathEllipse(ctx, 5.2, 0, 8.4, 4.2);
    ctx.fill();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.5)";
    ctx.lineWidth = 0.5;
    ctx.stroke();
    ctx.fillStyle = "rgba(255, 255, 255, 0.6)";
    pathEllipse(ctx, 6.4, -0.8, 2.8, 1, -0.2);
    ctx.fill();
    ctx.restore();

    pop();
  }
}

class UIOverlay {
  constructor() {
    this.slots = [...document.querySelectorAll(".letter-slot")];
    this.sequence = document.getElementById("letter-sequence");
    this.visitedCount = 0;
  }

  reveal(planet) {
    this.slots[planet.index].textContent = planet.letter;
    this.slots[planet.index].classList.add("revealed");
    this.visitedCount++;
  }

  complete() {
    this.sequence.classList.add("complete");
  }

  reset() {
    for (const slot of this.slots) {
      slot.textContent = "";
      slot.classList.remove("revealed");
    }
    this.sequence.classList.remove("complete");
    this.visitedCount = 0;
  }
}

class SystemManager {
  constructor(worldWidth, worldHeight, overlay) {
    this.width = worldWidth;
    this.height = worldHeight;
    this.overlay = overlay;
    this.time = 0;
    this.planets = [];
    this.beams = [];
    this.complete = false;
    this.victoryTimer = 0;
    this.interactionRadius = 28;
    this.orbitScaleX = 1;
    this.orbitScaleY = 0.74;
    this.center = createVector(worldWidth * 0.5, worldHeight * 0.48);
    this.ship = new Spaceship(createVector(worldWidth * 0.5 - 105, worldHeight * 0.48 + 40));
    this.createPlanets();
  }

  createPlanets() {
    const scale = Math.min(this.width / 820, this.height / 500, 1.12);
    const configurations = [
      { radius: 88, angle: -0.3, speed: 0.34, size: 13, letter: "N" },
      { radius: 145, angle: 2.15, speed: -0.23, size: 16, letter: "A" },
      { radius: 205, angle: 3.8, speed: 0.17, size: 19, letter: "S" },
      { radius: 265, angle: 5.15, speed: -0.12, size: 15, letter: "A" }
    ];
    this.planets = configurations.map((config, index) => new Planet(
      index,
      config.letter,
      config.radius * scale,
      config.angle,
      config.speed,
      config.size * scale,
      SPACE_COLORS.planet[index]
    ));
    for (const planet of this.planets) planet.update(0, this.center, this);
  }

  update(dt) {
    this.time += dt;
    for (const planet of this.planets) planet.update(dt, this.center, this);
    this.ship.update(dt, this);
    for (const planet of this.planets) {
      if (!planet.isVisited && dist(this.ship.position.x, this.ship.position.y, planet.position.x, planet.position.y) < planet.radius + this.interactionRadius) {
        planet.visit(this);
      }
    }
    for (const beam of this.beams) beam.life -= dt;
    this.beams = this.beams.filter((beam) => beam.life > 0);
    if (this.complete) this.victoryTimer += dt;
  }

  setDestination(x, y) {
    if (x < 0 || x > this.width || y < 0 || y > this.height) return;
    this.ship.setDestination(createVector(x, y));
  }

  handlePointer(x, y, clicked) {
    let closest = null;
    let closestDistance = Infinity;
    for (const planet of this.planets) {
      const distance = dist(x, y, planet.position.x, planet.position.y);
      if (distance < planet.radius + 16 && distance < closestDistance) {
        closest = planet;
        closestDistance = distance;
      }
    }
    if (clicked && closest) {
      this.ship.setDestination(closest.position);
      closest.visit(this);
    } else {
      this.setDestination(x, y);
    }
  }

  registerVisit(planet) {
    if (planet.isVisited && this.planets.filter((item) => item.isVisited).length === 1 && this.overlay.visitedCount > 0) return;
    this.beams.push({ index: planet.index, life: 3.2 });
    this.overlay.reveal(planet);
    if (this.planets.every((item) => item.isVisited)) {
      this.complete = true;
      this.overlay.complete();
    }
  }

  reset() {
    this.time = 0;
    this.complete = false;
    this.victoryTimer = 0;
    this.beams = [];
    this.center.set(this.width * 0.5, this.height * 0.48);
    this.ship = new Spaceship(createVector(this.width * 0.5 - 105, this.height * 0.48 + 40));
    this.createPlanets();
    this.overlay.reset();
  }

  resize(newWidth, newHeight, scaleX, scaleY) {
    this.width = newWidth;
    this.height = newHeight;
    this.center.set(newWidth * 0.5, newHeight * 0.48);
    this.ship.position.x *= scaleX;
    this.ship.position.y *= scaleY;
    this.ship.destination.x *= scaleX;
    this.ship.destination.y *= scaleY;
    this.createPlanets();
  }

  render() {
    this.renderSpace();
    for (const planet of this.planets) planet.renderOrbit(this.center, this);
    this.renderStation();
    for (const planet of this.planets) planet.render(this.center, this, this.time);
    this.ship.render();
    if (this.complete) this.renderVictory();
  }

  renderSpace() {
    background(SPACE_COLORS.background);
    const ctx = drawingContext;
    ctx.save();
    const nebulaA = ctx.createRadialGradient(width * 0.2, height * 0.3, 0, width * 0.2, height * 0.3, width * 0.5);
    nebulaA.addColorStop(0, "rgba(90, 70, 170, 0.18)");
    nebulaA.addColorStop(1, "rgba(90, 70, 170, 0)");
    ctx.fillStyle = nebulaA;
    ctx.fillRect(0, 0, width, height);
    const nebulaB = ctx.createRadialGradient(width * 0.85, height * 0.75, 0, width * 0.85, height * 0.75, width * 0.45);
    nebulaB.addColorStop(0, "rgba(40, 140, 160, 0.14)");
    nebulaB.addColorStop(1, "rgba(40, 140, 160, 0)");
    ctx.fillStyle = nebulaB;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();

    randomSeed(1407);
    noStroke();
    for (let index = 0; index < 135; index++) {
      const twinkle = 0.7 + 0.3 * Math.sin(this.time * 1.6 + index * 1.7);
      fill(170, 194, 220, random(20, 115) * twinkle);
      ellipse(random(width), random(height), random(0.5, 1.8));
    }
    randomSeed(frameCount);
    for (const beam of this.beams) {
      const planet = this.planets[beam.index];
      const alpha = map(beam.life, 0, 3.2, 0, 170, true);
      stroke(139, 227, 220, alpha);
      strokeWeight(1.4);
      drawingContext.setLineDash([5, 6]);
      line(planet.position.x, planet.position.y, this.center.x, this.center.y);
      drawingContext.setLineDash([]);
    }
  }

  renderStation() {
    const pulse = 1 + sin(this.time * 2.5) * 0.08;
    noStroke();
    fill(242, 200, 121, 15);
    ellipse(this.center.x, this.center.y, 60 * pulse);
    noFill();
    stroke(242, 200, 121, 125);
    strokeWeight(1);
    ellipse(this.center.x, this.center.y, 35 * pulse);
    stroke(242, 200, 121, 55);
    ellipse(this.center.x, this.center.y, 49 * pulse);
    stroke(242, 200, 121, 85);
    line(this.center.x - 9, this.center.y, this.center.x + 9, this.center.y);
    line(this.center.x, this.center.y - 9, this.center.x, this.center.y + 9);
    noStroke();
    fill(SPACE_COLORS.star);
    ellipse(this.center.x, this.center.y, 8);
    stroke(242, 200, 121, 155);
    strokeWeight(1);
    line(this.center.x - 15, this.center.y - 14, this.center.x - 23, this.center.y - 23);
    line(this.center.x + 15, this.center.y - 14, this.center.x + 23, this.center.y - 23);
    noStroke();
    fill(242, 200, 121, 185);
    ellipse(this.center.x - 24, this.center.y - 24, 3);
    ellipse(this.center.x + 24, this.center.y - 24, 3);
  }

  renderVictory() {
    const fade = constrain(this.victoryTimer * 45, 0, 135);
    noStroke();
    fill(5, 10, 19, fade * 0.42);
    rect(0, 0, this.width, this.height);
    const pulse = 1 + sin(this.victoryTimer * 3.2) * 0.04;
    textAlign(CENTER, CENTER);
    textStyle(BOLD);
    fill(255, 220, 147, fade + 100);
    textSize(54 * pulse);
    text("NASA", this.width / 2, this.height * 0.5);
    textStyle(NORMAL);
    noFill();
    stroke(139, 227, 220, 95 + sin(this.victoryTimer * 4) * 65);
    strokeWeight(1.4);
    ellipse(this.width / 2, this.height * 0.5, 170 + this.victoryTimer * 7);
  }
}