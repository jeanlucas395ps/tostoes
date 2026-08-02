import * as THREE from 'three';

/** Fundo 3D sutil (ícosaedro wireframe + partículas flutuantes) para o hero
 * da tela de Login. Leve o suficiente para mobile: baixa contagem de
 * vértices/partículas, sem post-processing, alpha transparente. */
export class AmbientHero {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private icosahedron: THREE.LineSegments;
  private particles: THREE.Points;
  private frameId = 0;
  private clock = new THREE.Clock();
  private destroyed = false;

  constructor(private canvas: HTMLCanvasElement) {
    const { clientWidth: w, clientHeight: h } = canvas;

    this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(w, h, false);

    this.camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 100);
    this.camera.position.set(0, 0, 6.4);

    const geo = new THREE.IcosahedronGeometry(2.1, 1);
    const edges = new THREE.EdgesGeometry(geo);
    const mat = new THREE.LineBasicMaterial({ color: 0xa78bfa, transparent: true, opacity: 0.55 });
    this.icosahedron = new THREE.LineSegments(edges, mat);
    this.scene.add(this.icosahedron);

    const count = 60;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 10;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 10;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 6 - 1;
    }
    const particleGeo = new THREE.BufferGeometry();
    particleGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const particleMat = new THREE.PointsMaterial({
      color: 0xc4b5fd,
      size: 0.045,
      transparent: true,
      opacity: 0.7,
      sizeAttenuation: true,
    });
    this.particles = new THREE.Points(particleGeo, particleMat);
    this.scene.add(this.particles);

    this.animate();
  }

  private animate = (): void => {
    if (this.destroyed) return;
    const t = this.clock.getElapsedTime();
    this.icosahedron.rotation.y = t * 0.12;
    this.icosahedron.rotation.x = Math.sin(t * 0.08) * 0.25;
    this.particles.rotation.y = -t * 0.03;
    this.renderer.render(this.scene, this.camera);
    this.frameId = requestAnimationFrame(this.animate);
  };

  resize(w: number, h: number): void {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
  }

  destroy(): void {
    this.destroyed = true;
    cancelAnimationFrame(this.frameId);
    this.icosahedron.geometry.dispose();
    (this.icosahedron.material as THREE.Material).dispose();
    this.particles.geometry.dispose();
    (this.particles.material as THREE.Material).dispose();
    this.renderer.dispose();
  }
}
