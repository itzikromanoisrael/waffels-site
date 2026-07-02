import { Camera, Mesh, Plane, Program, Renderer, Texture, Transform } from "./node_modules/ogl/src/index.js";

const vertexShader = `
  precision highp float;
  attribute vec3 position;
  attribute vec2 uv;
  uniform mat4 modelViewMatrix;
  uniform mat4 projectionMatrix;
  uniform float uTime;
  uniform float uSpeed;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vec3 p = position;
    p.z = (sin(p.x * 4.0 + uTime) + cos(p.y * 2.0 + uTime)) * (0.08 + abs(uSpeed) * 0.35);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;

const fragmentShader = `
  precision highp float;
  uniform vec2 uImageSizes;
  uniform vec2 uPlaneSizes;
  uniform sampler2D tMap;
  uniform float uBorderRadius;
  varying vec2 vUv;
  float roundedBoxSDF(vec2 p, vec2 b, float r) {
    vec2 d = abs(p) - b;
    return length(max(d, vec2(0.0))) + min(max(d.x, d.y), 0.0) - r;
  }
  void main() {
    vec2 ratio = vec2(
      min((uPlaneSizes.x / uPlaneSizes.y) / (uImageSizes.x / uImageSizes.y), 1.0),
      min((uPlaneSizes.y / uPlaneSizes.x) / (uImageSizes.y / uImageSizes.x), 1.0)
    );
    vec2 uv = vec2(
      vUv.x * ratio.x + (1.0 - ratio.x) * 0.5,
      vUv.y * ratio.y + (1.0 - ratio.y) * 0.5
    );
    vec4 color = texture2D(tMap, uv);
    float d = roundedBoxSDF(vUv - 0.5, vec2(0.5 - uBorderRadius), uBorderRadius);
    float alpha = 1.0 - smoothstep(-0.002, 0.002, d);
    gl_FragColor = vec4(color.rgb, alpha);
  }
`;

const titleVertexShader = `
  attribute vec3 position;
  attribute vec2 uv;
  uniform mat4 modelViewMatrix;
  uniform mat4 projectionMatrix;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const titleFragmentShader = `
  precision highp float;
  uniform sampler2D tMap;
  varying vec2 vUv;
  void main() {
    vec4 color = texture2D(tMap, vUv);
    if (color.a < 0.1) discard;
    gl_FragColor = color;
  }
`;

function lerp(start, end, amount) {
  return start + (end - start) * amount;
}

function createTextTexture(gl, text, font, color) {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  context.font = font;
  const width = Math.ceil(context.measureText(text).width) + 32;
  const size = Number.parseInt(font.match(/(\d+)px/)?.[1] || "30", 10);
  canvas.width = width;
  canvas.height = Math.ceil(size * 1.5);
  context.font = font;
  context.fillStyle = color;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.direction = "rtl";
  context.fillText(text, canvas.width / 2, canvas.height / 2);
  const texture = new Texture(gl, { generateMipmaps: false });
  texture.image = canvas;
  return { texture, width: canvas.width, height: canvas.height };
}

class GalleryMedia {
  constructor({ app, data, index, length }) {
    this.app = app;
    this.index = index;
    this.length = length;
    this.extra = 0;
    const texture = new Texture(app.gl, { generateMipmaps: true });
    this.program = new Program(app.gl, {
      depthTest: false,
      depthWrite: false,
      vertex: vertexShader,
      fragment: fragmentShader,
      uniforms: {
        tMap: { value: texture },
        uPlaneSizes: { value: [0, 0] },
        uImageSizes: { value: [1, 1] },
        uSpeed: { value: 0 },
        uTime: { value: Math.random() * 100 },
        uBorderRadius: { value: app.options.borderRadius }
      },
      transparent: true
    });
    this.plane = new Mesh(app.gl, { geometry: app.geometry, program: this.program });
    this.plane.setParent(app.scene);

    const image = new Image();
    image.src = data.image;
    image.onload = () => {
      texture.image = image;
      this.program.uniforms.uImageSizes.value = [image.naturalWidth, image.naturalHeight];
    };

    const titleData = createTextTexture(app.gl, data.text, app.options.font, app.options.textColor);
    const titleProgram = new Program(app.gl, {
      vertex: titleVertexShader,
      fragment: titleFragmentShader,
      uniforms: { tMap: { value: titleData.texture } },
      transparent: true
    });
    this.title = new Mesh(app.gl, { geometry: new Plane(app.gl), program: titleProgram });
    this.titleAspect = titleData.width / titleData.height;
    this.title.setParent(this.plane);
    this.resize();
  }

  resize() {
    const { screen, viewport } = this.app;
    const scale = screen.height / 1500;
    this.plane.scale.y = (viewport.height * (900 * scale)) / screen.height;
    this.plane.scale.x = (viewport.width * (700 * scale)) / screen.width;
    this.program.uniforms.uPlaneSizes.value = [this.plane.scale.x, this.plane.scale.y];
    const titleHeight = this.plane.scale.y * 0.14;
    this.title.scale.set(titleHeight * this.titleAspect, titleHeight, 1);
    this.title.position.y = -this.plane.scale.y * 0.5 - titleHeight * 0.62;
    this.width = this.plane.scale.x + 2;
    this.totalWidth = this.width * this.length;
    this.x = this.width * this.index;
  }

  update(scroll, direction) {
    const { viewport, options } = this.app;
    this.plane.position.x = this.x - scroll.current - this.extra;
    const x = this.plane.position.x;
    const halfWidth = viewport.width / 2;
    const bend = options.bend;
    if (bend) {
      const absoluteBend = Math.abs(bend);
      const radius = (halfWidth * halfWidth + absoluteBend * absoluteBend) / (2 * absoluteBend);
      const effectiveX = Math.min(Math.abs(x), halfWidth);
      const arc = radius - Math.sqrt(Math.max(0, radius * radius - effectiveX * effectiveX));
      this.plane.position.y = bend > 0 ? -arc : arc;
      this.plane.rotation.z = (bend > 0 ? -1 : 1) * Math.sign(x) * Math.asin(effectiveX / radius);
    }
    const velocity = scroll.current - scroll.last;
    this.program.uniforms.uTime.value += 0.04;
    this.program.uniforms.uSpeed.value = velocity;
    const planeOffset = this.plane.scale.x / 2;
    const viewportOffset = viewport.width / 2;
    if (direction === "right" && this.plane.position.x + planeOffset < -viewportOffset) this.extra -= this.totalWidth;
    if (direction === "left" && this.plane.position.x - planeOffset > viewportOffset) this.extra += this.totalWidth;
  }
}

class CircularGallery {
  constructor(container, items, options) {
    this.container = container;
    this.options = options;
    this.scroll = { ease: options.scrollEase, current: 0, target: 0, last: 0, position: 0 };
    this.renderer = new Renderer({ alpha: true, antialias: true, dpr: Math.min(window.devicePixelRatio || 1, 2) });
    this.gl = this.renderer.gl;
    this.gl.clearColor(0, 0, 0, 0);
    this.container.appendChild(this.gl.canvas);
    this.camera = new Camera(this.gl);
    this.camera.fov = 45;
    this.camera.position.z = 20;
    this.scene = new Transform();
    this.geometry = new Plane(this.gl, { heightSegments: 30, widthSegments: 60 });
    this.resize();
    const repeatedItems = items.concat(items);
    this.medias = repeatedItems.map((data, index) => new GalleryMedia({ app: this, data, index, length: repeatedItems.length }));
    this.bindEvents();
    this.update();
  }

  resize = () => {
    this.screen = { width: this.container.clientWidth, height: this.container.clientHeight };
    this.renderer.setSize(this.screen.width, this.screen.height);
    this.camera.perspective({ aspect: this.screen.width / this.screen.height });
    const fov = (this.camera.fov * Math.PI) / 180;
    const height = 2 * Math.tan(fov / 2) * this.camera.position.z;
    this.viewport = { width: height * this.camera.aspect, height };
    this.medias?.forEach(media => media.resize());
  };

  snap() {
    const width = this.medias?.[0]?.width;
    if (!width) return;
    this.scroll.target = Math.round(this.scroll.target / width) * width;
  }

  pointerDown = event => {
    this.isDown = true;
    this.dragAxis = null;
    this.scroll.position = this.scroll.current;
    this.startX = event.touches ? event.touches[0].clientX : event.clientX;
    this.startY = event.touches ? event.touches[0].clientY : event.clientY;
    this.container.classList.add("is-grabbing");
  };

  pointerMove = event => {
    if (!this.isDown) return;
    const point = event.touches ? event.touches[0] : event;
    const deltaX = point.clientX - this.startX;
    const deltaY = point.clientY - this.startY;
    if (!this.dragAxis && Math.max(Math.abs(deltaX), Math.abs(deltaY)) > 6) {
      this.dragAxis = Math.abs(deltaX) > Math.abs(deltaY) ? "horizontal" : "vertical";
    }
    if (this.dragAxis !== "horizontal") return;
    if (event.cancelable) event.preventDefault();
    const sensitivity = window.innerWidth <= 520 ? 0.018 : 0.025;
    this.scroll.target = this.scroll.position - deltaX * (this.options.scrollSpeed * sensitivity);
  };

  pointerUp = () => {
    if (!this.isDown) return;
    this.isDown = false;
    this.container.classList.remove("is-grabbing");
    this.snap();
  };

  step = direction => {
    const width = this.medias?.[0]?.width;
    if (!width) return;
    const currentItem = Math.round(this.scroll.target / width);
    this.scroll.target = (currentItem + direction) * width;
  };

  wheel = event => {
    if (Math.abs(event.deltaX) < Math.abs(event.deltaY)) return;
    event.preventDefault();
    this.scroll.target += Math.sign(event.deltaX) * this.options.scrollSpeed;
    window.clearTimeout(this.snapTimer);
    this.snapTimer = window.setTimeout(() => this.snap(), 160);
  };

  keydown = event => {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();
    this.scroll.target += (event.key === "ArrowRight" ? 1 : -1) * this.options.scrollSpeed * 5;
    this.snap();
  };

  bindEvents() {
    window.addEventListener("resize", this.resize, { passive: true });
    this.container.addEventListener("mousedown", this.pointerDown);
    this.container.addEventListener("mousemove", this.pointerMove);
    window.addEventListener("mouseup", this.pointerUp);
    this.container.addEventListener("touchstart", this.pointerDown, { passive: true });
    this.container.addEventListener("touchmove", this.pointerMove, { passive: false });
    this.container.addEventListener("touchend", this.pointerUp);
    this.container.addEventListener("wheel", this.wheel, { passive: false });
    this.container.addEventListener("keydown", this.keydown);
    this.container.parentElement?.querySelector('[data-gallery-action="previous"]')?.addEventListener("click", () => this.step(-1));
    this.container.parentElement?.querySelector('[data-gallery-action="next"]')?.addEventListener("click", () => this.step(1));
  }

  update = () => {
    this.scroll.current = lerp(this.scroll.current, this.scroll.target, this.scroll.ease);
    const direction = this.scroll.current > this.scroll.last ? "right" : "left";
    this.medias?.forEach(media => media.update(this.scroll, direction));
    this.renderer.render({ scene: this.scene, camera: this.camera });
    this.scroll.last = this.scroll.current;
    this.frame = window.requestAnimationFrame(this.update);
  };
}

const container = document.getElementById("circularGallery");
if (container) {
  const items = JSON.parse(container.dataset.items || "[]");
  new CircularGallery(container, items, {
    bend: 1,
    textColor: "#ffffff",
    borderRadius: 0.05,
    scrollEase: 0.05,
    scrollSpeed: 2,
    font: "bold 30px Orbitron, Arial, sans-serif"
  });
}
