import { chimneyPath, forestPath, mountainPath, pylonPath, ridgePath, SCENE_HEIGHT, SCENE_WIDTH } from './scene-geometry';
import styles from './background.module.css';

// Computed once per server process; deterministic output keeps hydration and caching stable.
const GEOMETRY = {
  farRidge: mountainPath(11, { baseY: 330, peaks: 9, minHeight: 60, maxHeight: 190, slope: 0.62 }),
  midRidge: mountainPath(29, { baseY: 372, peaks: 7, minHeight: 30, maxHeight: 110, slope: 0.42 }),
  distantForest: forestPath(3, { baseY: 452, minHeight: 16, maxHeight: 38, minGap: 5, maxGap: 11, roll: 8 }),
  chimneyA: chimneyPath(706, 170, 470, 24),
  chimneyB: chimneyPath(1480, 96, 492, 32),
  chimneyC: chimneyPath(1546, 250, 492, 15),
  pylon: pylonPath(392, 226, 486, 46),
  midForest: forestPath(17, { baseY: 548, minHeight: 46, maxHeight: 112, minGap: 12, maxGap: 24, roll: 14 }),
  ground: ridgePath(53, { baseY: 640, amplitude: 60, roughness: 0.45, iterations: 6 }),
  nearForest: forestPath(41, { baseY: 690, minHeight: 90, maxHeight: 200, minGap: 30, maxGap: 70, roll: 22 }),
  foreground: ridgePath(67, { baseY: 880, amplitude: 70, roughness: 0.5, iterations: 6, tilt: 150 }),
  leftTrees: forestPath(71, { baseY: 790, minHeight: 380, maxHeight: 580, minGap: 44, maxGap: 88, from: -40, to: 300, roll: 30, slenderness: 0.16, close: 'base' }),
  rightTrees: forestPath(89, { baseY: 815, minHeight: 280, maxHeight: 420, minGap: 52, maxGap: 96, from: 1720, to: 1980, roll: 26, slenderness: 0.16, close: 'base' }),
};

/**
 * Original charcoal-dusk landscape used whenever no approved poster/video is available
 * (production default until owner media is delivered). Pure SVG gradients/paths: no
 * screenshots, no reference images, no <style> element (nonce CSP), rendered on the server.
 */
export function SceneFallback() {
  return (
    <svg
      className={styles.fallback}
      viewBox={`0 0 ${SCENE_WIDTH} ${SCENE_HEIGHT}`}
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      focusable="false"
      data-scene-fallback=""
    >
      <defs>
        <linearGradient id="vk-scene-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1b1c19" />
          <stop offset="0.14" stopColor="#2b2b27" />
          <stop offset="0.28" stopColor="#4d4a41" />
          <stop offset="0.38" stopColor="#716856" />
          <stop offset="0.5" stopColor="#4f4c43" />
          <stop offset="1" stopColor="#2b2a25" />
        </linearGradient>
        <radialGradient id="vk-scene-glow" cx="1120" cy="300" r="860" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#dcb87a" stopOpacity="0.46" />
          <stop offset="0.32" stopColor="#b08f5c" stopOpacity="0.17" />
          <stop offset="1" stopColor="#b08f5c" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="vk-scene-haze" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#8c826d" stopOpacity="0" />
          <stop offset="0.6" stopColor="#8c826d" stopOpacity="0.4" />
          <stop offset="1" stopColor="#8c826d" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="vk-scene-fog" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#7a715e" stopOpacity="0" />
          <stop offset="0.5" stopColor="#7a715e" stopOpacity="0.22" />
          <stop offset="1" stopColor="#7a715e" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="vk-scene-ground" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#35322a" />
          <stop offset="0.35" stopColor="#24221d" />
          <stop offset="1" stopColor="#141412" />
        </linearGradient>
        <radialGradient id="vk-scene-clearing" cx="1040" cy="800" r="520" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#5a5244" stopOpacity="0.34" />
          <stop offset="1" stopColor="#5a5244" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="vk-scene-shaft" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f1d9a4" stopOpacity="0.1" />
          <stop offset="0.6" stopColor="#f1d9a4" stopOpacity="0.03" />
          <stop offset="1" stopColor="#f1d9a4" stopOpacity="0" />
        </linearGradient>
        <filter id="vk-scene-soft" x="-20%" y="-5%" width="140%" height="110%">
          <feGaussianBlur stdDeviation="22" />
        </filter>
      </defs>

      <rect width={SCENE_WIDTH} height={SCENE_HEIGHT} fill="url(#vk-scene-sky)" />
      <rect width={SCENE_WIDTH} height={SCENE_HEIGHT} fill="url(#vk-scene-glow)" />

      <path d={GEOMETRY.farRidge} fill="#626560" fillOpacity="0.5" />
      <path d={GEOMETRY.midRidge} fill="#4d4e48" fillOpacity="0.8" />
      <rect y="250" width={SCENE_WIDTH} height="230" fill="url(#vk-scene-haze)" />

      <g fill="#3a3a34" fillOpacity="0.92">
        <path d={GEOMETRY.chimneyA} />
        <path d={GEOMETRY.chimneyB} />
        <path d={GEOMETRY.chimneyC} />
        <rect x="1560" y="402" width="140" height="90" />
        <rect x="1590" y="372" width="36" height="40" />
      </g>
      <path d={GEOMETRY.pylon} fill="none" stroke="#3b3b35" strokeWidth="2.4" strokeOpacity="0.9" />
      <path
        d="M-20 268 Q190 300 358 244 M426 244 Q700 318 1010 300 M-20 290 Q190 318 368 266 M416 266 Q700 334 1010 322"
        fill="none"
        stroke="#34352f"
        strokeWidth="1.4"
        strokeOpacity="0.6"
      />

      <path d={GEOMETRY.distantForest} fill="#3b3c35" />
      <rect y="400" width={SCENE_WIDTH} height="190" fill="url(#vk-scene-fog)" />
      <path d={GEOMETRY.midForest} fill="#2a2b25" />
      <path d={GEOMETRY.ground} fill="url(#vk-scene-ground)" />
      <rect y="600" width={SCENE_WIDTH} height="480" fill="url(#vk-scene-clearing)" />
      <path d={GEOMETRY.nearForest} fill="#20211c" />
      <rect y="600" width={SCENE_WIDTH} height="150" fill="url(#vk-scene-fog)" opacity="0.55" />
      <path d={GEOMETRY.foreground} fill="#161613" fillOpacity="0.92" />
      <path d={GEOMETRY.leftTrees} fill="#141512" />
      <path d={GEOMETRY.rightTrees} fill="#161713" />

      <g fill="url(#vk-scene-shaft)" filter="url(#vk-scene-soft)">
        <polygon points="1180,0 1290,0 800,1000 560,1000" />
        <polygon points="1340,0 1400,0 1060,1000 930,1000" />
        <polygon points="1450,0 1540,0 1390,1000 1200,1000" />
      </g>
    </svg>
  );
}
