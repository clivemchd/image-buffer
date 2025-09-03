import * as THREE from 'three';

// Basic state
let renderer, scene, camera, orthoScene, quadCamera;
let renderTarget, quadMesh;
let clock = new THREE.Clock();

const viewportEl = document.getElementById('viewport');
const fileInput = document.getElementById('file');
const thumbsEl = document.getElementById('thumbs');
const effectSelect = document.getElementById('effectSelect');
const autoEffectInput = document.getElementById('autoEffect');
const intensityInput = document.getElementById('intensity');
const speedInput = document.getElementById('speed');
const scaleInput = document.getElementById('scale');
const fboSizeInput = document.getElementById('fboSize');
const recreateFBOButton = document.getElementById('recreateFBO');
const resetViewButton = document.getElementById('resetView');
const downloadBtn = document.getElementById('downloadBtn');
const progressEl = document.getElementById('progress');
// fractal UI
const fractalModeInput = document.getElementById('fractalMode');
const fractalTypeSelect = document.getElementById('fractalType');
const fractalOrderInput = document.getElementById('fractalOrder');
const genFractalButton = document.getElementById('genFractal');

let images = [];
let currentTexture = null;
let controls = { zoom: 1, offset: new THREE.Vector2() };
let isPanning = false;
let panStart = new THREE.Vector2();
let offsetStart = new THREE.Vector2();
let fractalLine = null;
let fractalScene = null; // offscreen generation scene if needed

// heuristic cache
const analysisCache = new WeakMap();

init();
animate();

function init() {
  renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(viewportEl.clientWidth, viewportEl.clientHeight);
  viewportEl.appendChild(renderer.domElement);

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(45, viewportEl.clientWidth / viewportEl.clientHeight, 0.1, 100);
  camera.position.set(0, 0, 2);

  // Fullscreen quad scene for final pass
  orthoScene = new THREE.Scene();
  quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  createRenderTarget();
  createQuad();
  setupEvents();
}

function createRenderTarget() {
  const size = parseInt(fboSizeInput.value, 10) || 1024;
  if (renderTarget) renderTarget.dispose();
  renderTarget = new THREE.WebGLRenderTarget(size, size, {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    format: THREE.RGBAFormat,
    type: THREE.UnsignedByteType,
    depthBuffer: false,
    stencilBuffer: false
  });
}

function createQuad() {
  const geometry = new THREE.PlaneGeometry(2, 2);
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTexture: { value: null },
      uTime: { value: 0 },
      uIntensity: { value: parseFloat(intensityInput.value) },
      uSpeed: { value: parseFloat(speedInput.value) },
      uScale: { value: parseFloat(scaleInput.value) },
      uEffect: { value: 0 },
      uZoom: { value: controls.zoom },
      uOffset: { value: controls.offset }
    },
    vertexShader: `varying vec2 vUv;\nvoid main(){vUv=uv;gl_Position=vec4(position,1.0);}`,
    fragmentShader: `precision highp float;\nuniform sampler2D uTexture;uniform float uTime;uniform float uIntensity;uniform float uSpeed;uniform float uScale;uniform int uEffect;uniform float uZoom;uniform vec2 uOffset;varying vec2 vUv;\n\nfloat luma(vec3 c){return dot(c, vec3(.299,.587,.114));}\n\nvoid main(){\n  vec2 uv = (vUv - .5);\n  uv = uv * uZoom + uOffset;\n  vec2 suv = uv + .5;\n  if(any(lessThan(suv, vec2(0.))) || any(greaterThan(suv, vec2(1.)))) { discard; }\n\n  vec2 sampleUv = suv;\n  if(uEffect==1){ // luma displacement\n    vec3 col = texture2D(uTexture, suv).rgb;\n    float lum = luma(col);\n    sampleUv += (col.rg - .5) * uIntensity * 0.1;\n    sampleUv += (lum - .5) * (uIntensity * 0.2);\n  } else if(uEffect==2){ // edge pulse\n    float e = 1.0/512.0 * uScale;\n    vec3 c = texture2D(uTexture, suv).rgb;\n    float gx = luma(texture2D(uTexture, suv+vec2(e,0.)).rgb) - luma(texture2D(uTexture, suv-vec2(e,0.)).rgb);\n    float gy = luma(texture2D(uTexture, suv+vec2(0.,e)).rgb) - luma(texture2D(uTexture, suv-vec2(0.,e)).rgb);\n    float edge = sqrt(gx*gx+gy*gy);\n    float pulse = sin(uTime*uSpeed*3.14159);\n    sampleUv += normalize(vec2(gx,gy)+1e-6) * edge * pulse * 0.02 * uIntensity;\n  } else if(uEffect==3){ // rgb warp\n    float t = uTime * uSpeed;\n    vec2 warp = vec2(sin(t+uv.y*5.), cos(t+uv.x*5.)) * 0.003 * uIntensity;\n    vec3 col;\n    col.r = texture2D(uTexture, suv + warp).r;\n    col.g = texture2D(uTexture, suv - warp).g;\n    col.b = texture2D(uTexture, suv + warp.yx).b;\n    gl_FragColor = vec4(col,1.);return;\n  }\n  vec4 color = texture2D(uTexture, sampleUv);\n  gl_FragColor = color;\n}`,
    transparent: true
  });
  quadMesh = new THREE.Mesh(geometry, material);
  orthoScene.add(quadMesh);
}

function setupEvents() {
  window.addEventListener('resize', onResize);
  fileInput.addEventListener('change', onFiles); 
  effectSelect.addEventListener('change', () => {
    quadMesh.material.uniforms.uEffect.value = effectSelect.selectedIndex; 
  });
  autoEffectInput.addEventListener('change', () => {
    if(autoEffectInput.checked && currentTexture){
      chooseAutoEffect(currentTexture);
    }
  });
  intensityInput.addEventListener('input', () => quadMesh.material.uniforms.uIntensity.value = parseFloat(intensityInput.value));
  speedInput.addEventListener('input', () => quadMesh.material.uniforms.uSpeed.value = parseFloat(speedInput.value));
  scaleInput.addEventListener('input', () => quadMesh.material.uniforms.uScale.value = parseFloat(scaleInput.value));
  recreateFBOButton.addEventListener('click', () => createRenderTarget());
  resetViewButton.addEventListener('click', () => { controls.zoom = 1; controls.offset.set(0,0); });
  downloadBtn.addEventListener('click', downloadImage);
  fractalModeInput.addEventListener('change', () => {
    genFractalButton.disabled = !fractalModeInput.checked || !currentTexture;
    if(!fractalModeInput.checked){
      removeFractal();
    } else if(currentTexture){
      // auto-generate once
      generateFractalFromImage();
    }
  });
  genFractalButton.addEventListener('click', generateFractalFromImage);
  fractalOrderInput.addEventListener('input', () => {
    if(fractalModeInput.checked && currentTexture){ generateFractalFromImage(); }
  });

  // pan + zoom
  renderer.domElement.addEventListener('wheel', e => {
    e.preventDefault();
    const delta = -Math.sign(e.deltaY) * 0.1;
    controls.zoom = THREE.MathUtils.clamp(controls.zoom * (1 + delta), 0.2, 5);
  }, { passive: false });
  renderer.domElement.addEventListener('pointerdown', e => { isPanning = true; panStart.set(e.clientX, e.clientY); offsetStart.copy(controls.offset); });
  window.addEventListener('pointermove', e => {
    if(!isPanning) return;
    const dx = (e.clientX - panStart.x) / renderer.domElement.clientWidth;
    const dy = (e.clientY - panStart.y) / renderer.domElement.clientHeight;
    controls.offset.set(offsetStart.x - dx * controls.zoom, offsetStart.y + dy * controls.zoom);
  });
  window.addEventListener('pointerup', () => { isPanning = false; });
}

async function onFiles(e) {
  const files = Array.from(e.target.files || []);
  if(!files.length) return;
  progressEl.textContent = `Loading ${files.length} image(s)...`;
  for (let file of files) {
    const tex = await loadTextureFromFile(file);
    images.push({ file, tex });
    addThumb(tex, images.length-1);
  }
  if(!currentTexture) setActiveTexture(0);
  progressEl.textContent = `${images.length} image(s) loaded.`;
  downloadBtn.disabled = false;
}

function loadTextureFromFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = ev => {
      const img = new Image();
      img.onload = () => {
        const tex = new THREE.Texture(img);
        tex.needsUpdate = true;
        resolve(tex);
      };
      img.onerror = reject;
      img.src = ev.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function addThumb(tex, index) {
  const img = document.createElement('img');
  const canvas = document.createElement('canvas');
  const size = 128;
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const image = tex.image;
  const scale = Math.min(size / image.width, size / image.height);
  const w = image.width * scale;
  const h = image.height * scale;
  ctx.drawImage(image, (size - w)/2, (size - h)/2, w, h);
  img.src = canvas.toDataURL();
  img.addEventListener('click', () => setActiveTexture(index));
  img.dataset.index = index;
  thumbsEl.appendChild(img);
}

function setActiveTexture(index){
  const item = images[index];
  if(!item) return;
  currentTexture = item.tex;
  quadMesh.material.uniforms.uTexture.value = currentTexture;
  if(autoEffectInput.checked){
    chooseAutoEffect(currentTexture);
  }
  genFractalButton.disabled = !fractalModeInput.checked;
  thumbsEl.querySelectorAll('img').forEach(img => img.classList.toggle('active', parseInt(img.dataset.index,10)===index));
}

function analyzeImage(texture){
  if(analysisCache.has(texture)) return analysisCache.get(texture);
  const img = texture.image;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const sampleSize = 128;
  canvas.width = canvas.height = sampleSize;
  // fit into square
  const scale = Math.min(sampleSize / img.width, sampleSize / img.height);
  const w = img.width * scale; const h = img.height * scale;
  ctx.drawImage(img, (sampleSize-w)/2, (sampleSize-h)/2, w, h);
  const data = ctx.getImageData(0,0,sampleSize,sampleSize).data;
  let sumL=0, sumL2=0; let edgeEstimate=0; let count=0;
  // simple gradient magnitude on downsampled grid
  const step = 4; // coarse
  function luma(r,g,b){return 0.299*r+0.587*g+0.114*b;}
  for(let y=0;y<sampleSize;y+=step){
    for(let x=0;x<sampleSize;x+=step){
      const i=(y*sampleSize + x)*4; const L=luma(data[i],data[i+1],data[i+2]);
      sumL+=L; sumL2+=L*L; count++;
      if(x+step<sampleSize && y+step<sampleSize){
        const ix=(y*sampleSize + (x+step))*4; const iy=((y+step)*sampleSize + x)*4;
        const Lx=luma(data[ix],data[ix+1],data[ix+2]);
        const Ly=luma(data[iy],data[iy+1],data[iy+2]);
        edgeEstimate += Math.abs(L - Lx) + Math.abs(L - Ly);
      }
    }
  }
  const mean = sumL / count;
  const variance = sumL2 / count - mean*mean;
  const contrast = Math.sqrt(Math.max(variance,0))/255;
  edgeEstimate /= (count*255);
  const result = { contrast, edge: edgeEstimate };
  analysisCache.set(texture, result);
  return result;
}

function chooseAutoEffect(texture){
  const { contrast, edge } = analyzeImage(texture);
  let effectIndex = 0; // none
  // heuristic: high edges -> edge pulse, high contrast low edges -> rgb warp, low contrast -> luma displacement
  if(edge > 0.18){
    effectIndex = 2; // edge pulse
  } else if(contrast > 0.35){
    effectIndex = 3; // rgb warp
  } else if(contrast < 0.2){
    effectIndex = 1; // luma displacement
  } else {
    effectIndex = 0;
  }
  effectSelect.selectedIndex = effectIndex;
  quadMesh.material.uniforms.uEffect.value = effectIndex;
  // tweak parameters
  if(effectIndex===2){
    intensityInput.value = (Math.min(edge*5,1)).toFixed(2);
  } else if(effectIndex===1){
    intensityInput.value = (0.6 + (0.2 - contrast)*2).toFixed(2);
  } else if(effectIndex===3){
    intensityInput.value = (0.4 + contrast*0.6).toFixed(2);
  } else {
    intensityInput.value = '0.8';
  }
  quadMesh.material.uniforms.uIntensity.value = parseFloat(intensityInput.value);
}

function downloadImage(){
  const a = document.createElement('a');
  a.download = 'processed.png';
  a.href = renderer.domElement.toDataURL('image/png');
  a.click();
}

function onResize(){
  renderer.setSize(viewportEl.clientWidth, viewportEl.clientHeight);
  camera.aspect = viewportEl.clientWidth/viewportEl.clientHeight;
  camera.updateProjectionMatrix();
}

function animate(){
  requestAnimationFrame(animate);
  const t = clock.getElapsedTime();
  quadMesh.material.uniforms.uTime.value = t;
  quadMesh.material.uniforms.uZoom.value = controls.zoom;
  quadMesh.material.uniforms.uOffset.value = controls.offset;
  if(fractalLine){
    // animate hue shift
    const colors = fractalLine.geometry.getAttribute('color');
    const count = colors.count;
    const shift = (t * 30.0) % count;
    for(let i=0;i<count;i++){
      const h = ((i + shift)/count);
      const rgb = hslToRgb(h,1.0,0.5);
      colors.setX(i, rgb[0]);
      colors.setY(i, rgb[1]);
      colors.setZ(i, rgb[2]);
    }
    colors.needsUpdate = true;
  }
  renderer.setRenderTarget(null); // Direct render since using a single pass for now
  renderer.render(orthoScene, quadCamera);
}

// -------- Fractal (Hilbert curve) ---------
function removeFractal(){
  if(fractalLine){
    orthoScene.remove(fractalLine);
    fractalLine.geometry.dispose();
    fractalLine.material.dispose();
    fractalLine = null;
  }
}

function generateFractalFromImage(){
  if(!currentTexture) return;
  removeFractal();
  const order = parseInt(fractalOrderInput.value,10);
  const points2D = hilbertPoints(order); // array of [x,y]
  // sample image colors along curve
  const img = currentTexture.image;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  canvas.width = img.width; canvas.height = img.height;
  ctx.drawImage(img,0,0);
  const imgData = ctx.getImageData(0,0,canvas.width,canvas.height).data;
  const positions = new Float32Array(points2D.length * 3);
  const colors = new Float32Array(points2D.length * 3);
  for(let i=0;i<points2D.length;i++){
    const p = points2D[i];
    // map p.x,p.y in [0,1] to image coords
    const x = Math.min(img.width-1, Math.max(0, Math.round(p[0]* (img.width-1))));
    const y = Math.min(img.height-1, Math.max(0, Math.round(p[1]* (img.height-1))));
    const idx = (y*img.width + x)*4;
    const r = imgData[idx]/255, g = imgData[idx+1]/255, b = imgData[idx+2]/255;
    // center positions and scale to fit quad (-1..1)
    const px = (p[0]-0.5)*2.0;
    const py = (p[1]-0.5)*2.0;
    positions[i*3+0] = px;
    positions[i*3+1] = py;
    positions[i*3+2] = 0.0;
    colors[i*3+0] = r;
    colors[i*3+1] = g;
    colors[i*3+2] = b;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions,3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors,3));
  const mat = new THREE.LineBasicMaterial({ vertexColors: true, transparent:true, opacity:1 });
  fractalLine = new THREE.Line(geo, mat);
  orthoScene.add(fractalLine);
}

// generate Hilbert curve points normalized to [0,1]
function hilbertPoints(order){
  const n = Math.pow(2, order);
  const total = n*n;
  const pts = new Array(total);
  for(let d=0; d<total; d++){
    const [x,y] = d2xy(order, d);
    pts[d] = [x/(n-1), y/(n-1)];
  }
  return pts;
}

// convert distance along Hilbert curve to (x,y)
function d2xy(order, d){
  let n = 1<<order;
  let rx, ry, s, t=d;
  let x=0, y=0;
  for(s=1; s<n; s<<=1){
    rx = 1 & (t>>1);
    ry = 1 & (t ^ rx);
    [x,y] = rot(s,x,y,rx,ry);
    x += s*rx;
    y += s*ry;
    t >>= 2;
  }
  return [x,y];
}

function rot(n,x,y,rx,ry){
  if(ry===0){
    if(rx===1){ x = n-1 - x; y = n-1 - y; }
    // swap x,y
    return [y,x];
  }
  return [x,y];
}

function hslToRgb(h,s,l){
  const a = s*Math.min(l,1-l);
  const f = n => {
    const k = (n + h*12)%12;
    return l - a*Math.max(Math.min(k-3, 9-k, 1), -1);
  };
  return [f(0),f(8),f(4)];
}
