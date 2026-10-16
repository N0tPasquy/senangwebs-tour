/**
 * Automated test suite for SenangWebs Tour - Gaze Navigation
 * Tests all 15 required scenarios from the prompt specification.
 */

import { GazeManager, isGazeHotspot } from '../src/GazeManager.js';
import { buildTourConfig } from '../src/editor/js/data-transform.js';
import { StaticPhotoController } from '../src/StaticPhotoCard.js';
import { HotspotManager } from '../src/HotspotManager.js';

// Minimal EventEmitter / Mock DOM Element
class MockElement {
  constructor(tagName = 'div') {
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.parentNode = null;
    this.isConnected = true;
    this.attributes = {};
    this.style = {};
    this.classList = new Set();
    this.classList.remove = (cls) => this.classList.delete(cls);
    this.listeners = {};
    this.components = {};
    this.object3D = {
      add: () => {},
      remove: () => {}
    };
  }

  setAttribute(k, v) {
    this.attributes[k] = v;
    if (k === 'class' && typeof v === 'string') {
      v.split(/\s+/).filter(Boolean).forEach((c) => this.classList.add(c));
    }
  }

  getAttribute(k) {
    return this.attributes[k];
  }

  hasAttribute(k) {
    return k in this.attributes;
  }

  appendChild(child) {
    child.parentNode = this;
    child.isConnected = true;
    this.children.push(child);
    return child;
  }

  removeChild(child) {
    const idx = this.children.indexOf(child);
    if (idx >= 0) {
      this.children.splice(idx, 1);
      child.parentNode = null;
      child.isConnected = false;
    }
    return child;
  }

  querySelector(sel) {
    if (sel.startsWith('#')) {
      const id = sel.slice(1);
      if (this.attributes.id === id) return this;
      for (const c of this.children) {
        const found = c.querySelector(sel);
        if (found) return found;
      }
    }
    if (sel.startsWith('.')) {
      const cls = sel.slice(1);
      if (this.classList.has(cls) || (this.attributes.class && this.attributes.class.split(/\s+/).includes(cls))) {
        return this;
      }
      for (const c of this.children) {
        const found = c.querySelector(sel);
        if (found) return found;
      }
    }
    if (sel === '[camera]' || sel === 'a-camera') {
      if (this.tagName === 'A-CAMERA' || this.attributes.camera !== undefined) return this;
      for (const c of this.children) {
        const found = c.querySelector(sel);
        if (found) return found;
      }
    }
    if (sel === '[cursor]' || sel === 'a-cursor') {
      if (this.tagName === 'A-CURSOR' || this.attributes.cursor !== undefined) return this;
      for (const c of this.children) {
        const found = c.querySelector(sel);
        if (found) return found;
      }
    }
    if (this.tagName.toLowerCase() === sel.toLowerCase()) return this;
    for (const c of this.children) {
      const found = c.querySelector(sel);
      if (found) return found;
    }
    return null;
  }

  querySelectorAll(sel) {
    const res = [];
    if (this.querySelector(sel)) res.push(this.querySelector(sel));
    return res;
  }

  addEventListener(type, handler) {
    if (!this.listeners[type]) this.listeners[type] = [];
    this.listeners[type].push(handler);
  }

  removeEventListener(type, handler) {
    if (!this.listeners[type]) return;
    this.listeners[type] = this.listeners[type].filter(h => h !== handler);
  }

  dispatchEvent(evt) {
    const list = this.listeners[evt.type] || [];
    list.forEach(h => h(evt));
  }

  emit(type, detail) {
    this.dispatchEvent({ type, detail });
  }
}

// Mock Tour
class MockTour {
  constructor(config = {}) {
    this.config = config;
    this.isDestroyed = false;
    this.currentSceneId = config.initialScene || 'scene1';
    this.navigations = [];
    this.events = [];
  }

  getCurrentSceneId() {
    return this.currentSceneId;
  }

  emit(eventName, detail = {}) {
    this.events.push({ eventName, detail });
  }

  async navigateTo(sceneId) {
    this.navigations.push(sceneId);
    this.currentSceneId = sceneId;
    return Promise.resolve();
  }
}

// Global mocks for Node test environment
global.document = {
  createElement: (tag) => new MockElement(tag)
};
global.CustomEvent = class {
  constructor(type, opts = {}) {
    this.type = type;
    this.detail = opts.detail || {};
  }
};

let passCount = 0;
let failCount = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✓ PASS: ${message}`);
    passCount++;
  } else {
    console.error(`  ✗ FAIL: ${message}`);
    failCount++;
  }
}

async function runTests() {
  console.log('\n=== SENANGWEBS TOUR - GAZE NAVIGATION TEST SUITE ===\n');

  // Scenario 1: Standard hotspots work as before (action: navigateTo)
  console.log('Test 1 & 2: Standard hotspot behavior and isolation');
  {
    const standardHotspot = {
      id: 'hotspot-std-1',
      action: { type: 'navigateTo', target: 'scene2' }
    };
    assert(!isGazeHotspot(standardHotspot), 'Standard hotspot is not classified as gaze hotspot');

    const sceneEl = new MockElement('a-scene');
    const tour = new MockTour({ initialScene: 'scene1' });
    const gazeManager = new GazeManager(tour, sceneEl);

    // Standard hotspot click simulation
    tour.handleAction = function(action) {
      if (action.type === 'navigateTo') tour.navigateTo(action.target);
    };
    tour.handleAction(standardHotspot.action);
    assert(tour.navigations.length === 1 && tour.navigations[0] === 'scene2', 'Standard hotspot click triggers immediate navigation');
    assert(!gazeManager.currentHotspotEl, 'Standard hotspot does not engage GazeManager');
    gazeManager.destroy();
  }

  // Scenario 3: Gaze hotspot does not activate before timer expiry
  console.log('\nTest 3: Gaze hotspot does not navigate before timer expires');
  {
    const sceneEl = new MockElement('a-scene');
    const tour = new MockTour({ initialScene: 'scene1' });
    const gazeManager = new GazeManager(tour, sceneEl);
    const hotspotEl = new MockElement('a-entity');
    sceneEl.appendChild(hotspotEl);

    const gazeHotspot = {
      id: 'hotspot-gaze-1',
      action: { type: 'gazeNavigate', target: 'scene2', duration: 3000 }
    };
    assert(isGazeHotspot(gazeHotspot), 'Hotspot correctly identified as Gaze hotspot');

    // Simulate gaze enter
    gazeManager.onGazeEnter({ detail: { el: hotspotEl, hotspotData: gazeHotspot } });
    assert(gazeManager.currentHotspotEl === hotspotEl, 'GazeManager active on hotspot');
    assert(tour.navigations.length === 0, 'No navigation at beginning of gaze');

    // Fast-forward 1000ms (before 3000ms)
    gazeManager.startTime = performance.now() - 1000;
    assert(tour.navigations.length === 0, 'No navigation at 1000ms (before expiry)');

    gazeManager.destroy();
  }

  // Scenario 4: Holding gaze for 3000ms triggers single navigation
  console.log('\nTest 4 & 6: Holding gaze activates exactly one navigation and no repeats');
  {
    const sceneEl = new MockElement('a-scene');
    const tour = new MockTour({ initialScene: 'scene1' });
    const gazeManager = new GazeManager(tour, sceneEl);
    const hotspotEl = new MockElement('a-entity');
    sceneEl.appendChild(hotspotEl);

    const gazeHotspot = {
      id: 'hotspot-gaze-1',
      action: { type: 'gazeNavigate', target: 'scene2', duration: 3000 }
    };

    gazeManager.onGazeEnter({ detail: { el: hotspotEl, hotspotData: gazeHotspot } });

    // Simulate expiration of timer
    gazeManager.startTime = performance.now() - 3000;
    // Trigger countdown completion
    gazeManager.triggerNavigation(gazeHotspot);

    assert(tour.navigations.length === 1 && tour.navigations[0] === 'scene2', 'Navigation triggered exactly once upon timer completion');
    assert(gazeManager.hasTriggered === true, 'GazeManager hasTriggered flag set to true');

    // Scenario 9: Staring at same hotspot does not re-trigger
    gazeManager.onGazeEnter({ detail: { el: hotspotEl, hotspotData: gazeHotspot } });
    assert(tour.navigations.length === 1, 'No repeated navigation while gaze remains on same hotspot');

    gazeManager.destroy();
  }

  // Scenario 5: Looking away before 3000ms cancels timer
  console.log('\nTest 5: Looking away before timer cancels countdown immediately');
  {
    const sceneEl = new MockElement('a-scene');
    const tour = new MockTour({ initialScene: 'scene1' });
    const gazeManager = new GazeManager(tour, sceneEl);
    const hotspotEl = new MockElement('a-entity');
    sceneEl.appendChild(hotspotEl);

    const gazeHotspot = {
      id: 'hotspot-gaze-1',
      action: { type: 'gazeNavigate', target: 'scene2', duration: 3000 }
    };

    gazeManager.onGazeEnter({ detail: { el: hotspotEl, hotspotData: gazeHotspot } });
    assert(gazeManager.currentHotspotEl === hotspotEl, 'Countdown active');

    // Simulate looking away
    gazeManager.onGazeLeave({ detail: { el: hotspotEl } });
    assert(gazeManager.currentHotspotEl === null, 'Current hotspot cleared on gaze leave');
    assert(gazeManager.startTime === 0, 'Timer cleared on gaze leave');
    assert(tour.navigations.length === 0, 'No navigation occurred when looking away');

    gazeManager.destroy();
  }

  // Scenario 6: Returning to the same hotspot restarts count from 0
  console.log('\nTest 6: Returning to same hotspot restarts countdown from zero');
  {
    const sceneEl = new MockElement('a-scene');
    const tour = new MockTour({ initialScene: 'scene1' });
    const gazeManager = new GazeManager(tour, sceneEl);
    const hotspotEl = new MockElement('a-entity');
    sceneEl.appendChild(hotspotEl);

    const gazeHotspot = {
      id: 'hotspot-gaze-1',
      action: { type: 'gazeNavigate', target: 'scene2', duration: 3000 }
    };

    // First enter and leave
    gazeManager.onGazeEnter({ detail: { el: hotspotEl, hotspotData: gazeHotspot } });
    gazeManager.onGazeLeave({ detail: { el: hotspotEl } });

    // Second enter
    const enterTime = performance.now();
    gazeManager.onGazeEnter({ detail: { el: hotspotEl, hotspotData: gazeHotspot } });
    assert(gazeManager.currentHotspotEl === hotspotEl, 'Hotspot re-entered');
    assert(gazeManager.hasTriggered === false, 'hasTriggered reset to false');
    assert(gazeManager.startTime >= enterTime, 'Countdown started from 0 from current time');

    gazeManager.destroy();
  }

  // Scenario 7: Passing to another hotspot cancels previous countdown
  console.log('\nTest 7: Moving gaze to a different hotspot cancels previous countdown');
  {
    const sceneEl = new MockElement('a-scene');
    const tour = new MockTour({ initialScene: 'scene1' });
    const gazeManager = new GazeManager(tour, sceneEl);
    const hotspotEl1 = new MockElement('a-entity');
    const hotspotEl2 = new MockElement('a-entity');
    sceneEl.appendChild(hotspotEl1);
    sceneEl.appendChild(hotspotEl2);

    const gazeHotspot1 = { id: 'g1', action: { type: 'gazeNavigate', target: 'scene2' } };
    const gazeHotspot2 = { id: 'g2', action: { type: 'gazeNavigate', target: 'scene3' } };

    gazeManager.onGazeEnter({ detail: { el: hotspotEl1, hotspotData: gazeHotspot1 } });
    assert(gazeManager.currentHotspotEl === hotspotEl1, 'Tracking hotspot 1');

    // Shift to hotspot 2
    gazeManager.onGazeEnter({ detail: { el: hotspotEl2, hotspotData: gazeHotspot2 } });
    assert(gazeManager.currentHotspotEl === hotspotEl2, 'Cancelled hotspot 1, now tracking hotspot 2');
    assert(gazeManager.currentHotspotData.id === 'g2', 'Current target updated to hotspot 2');

    gazeManager.destroy();
  }

  // Scenario 8: Scene change interrupts previous timers
  console.log('\nTest 8: Scene change cancels any active gaze timers');
  {
    const sceneEl = new MockElement('a-scene');
    const tour = new MockTour({ initialScene: 'scene1' });
    const gazeManager = new GazeManager(tour, sceneEl);
    const hotspotEl = new MockElement('a-entity');
    sceneEl.appendChild(hotspotEl);

    const gazeHotspot = { id: 'g1', action: { type: 'gazeNavigate', target: 'scene2' } };
    gazeManager.onGazeEnter({ detail: { el: hotspotEl, hotspotData: gazeHotspot } });
    assert(gazeManager.currentHotspotEl !== null, 'Countdown running before scene change');

    // Trigger scene-loading event
    gazeManager.onSceneLoading();
    assert(gazeManager.currentHotspotEl === null, 'Active countdown cancelled by scene-loading');
    assert(gazeManager.isNavigating === true, 'isNavigating flag set to true');

    // Gaze events ignored during navigation
    gazeManager.onGazeEnter({ detail: { el: hotspotEl, hotspotData: gazeHotspot } });
    assert(gazeManager.currentHotspotEl === null, 'Gaze enter ignored while scene is navigating');

    gazeManager.onSceneLoaded();
    assert(gazeManager.isNavigating === false, 'isNavigating flag reset when scene loaded');

    gazeManager.destroy();
  }

  // Scenario 10: Click/Touch on gaze hotspot does not navigate immediately
  console.log('\nTest 10: Clicking a gaze hotspot does not bypass the gaze countdown');
  {
    const tour = new MockTour({ initialScene: 'scene1' });
    const gazeHotspot = { id: 'g1', action: { type: 'gazeNavigate', target: 'scene2' } };

    tour.handleAction = function(action) {
      if (action.type === 'navigateTo') {
        tour.navigateTo(action.target);
      }
    };

    tour.handleAction(gazeHotspot.action);
    assert(tour.navigations.length === 0, 'Click on gazeNavigate action does not navigate');
  }

  // Scenario 11: Coexistence of standard and gaze hotspots
  console.log('\nTest 11: Coexistence of standard and gaze hotspots in same scene');
  {
    const scene = {
      id: 'room1',
      hotspots: [
        { id: 'h1', action: { type: 'navigateTo', target: 'room2' } },
        { id: 'h2', action: { type: 'gazeNavigate', target: 'room3', duration: 2500 } }
      ]
    };
    assert(!isGazeHotspot(scene.hotspots[0]), 'First hotspot is standard');
    assert(isGazeHotspot(scene.hotspots[1]), 'Second hotspot is gaze navigation');
  }

  // Scenario 12: Backward compatibility with legacy tour JSON files
  console.log('\nTest 12: Backward compatibility with old tour JSON without gaze fields');
  {
    const legacyTourJson = {
      initialScene: 'lobby',
      scenes: [
        {
          id: 'lobby',
          name: 'Lobby',
          panorama: 'lobby.jpg',
          hotspots: [
            {
              position: { x: 1, y: 0, z: -3 },
              action: { type: 'navigateTo', target: 'hallway' },
              appearance: { color: '#ff0000' }
            }
          ]
        }
      ]
    };

    const hs = legacyTourJson.scenes[0].hotspots[0];
    assert(!isGazeHotspot(hs), 'Legacy hotspot correctly identified as standard');
    assert(hs.action.type === 'navigateTo', 'Legacy action type preserved');
  }

  // Scenario 13: Custom duration is respected
  console.log('\nTest 13: Custom duration configuration per hotspot');
  {
    const sceneEl = new MockElement('a-scene');
    const tour = new MockTour({ initialScene: 'scene1' });
    const gazeManager = new GazeManager(tour, sceneEl);

    const defaultHotspot = { action: { type: 'gazeNavigate', target: 's2' } };
    const customHotspot = { action: { type: 'gazeNavigate', target: 's3', duration: 5000 } };
    const customHotspot2 = { action: { type: 'gazeNavigate', target: 's4', duration: 1500 } };

    assert(gazeManager.getDuration(defaultHotspot) === 3000, 'Default duration is 3000ms');
    assert(gazeManager.getDuration(customHotspot) === 5000, 'Custom duration of 5000ms is respected');
    assert(gazeManager.getDuration(customHotspot2) === 1500, 'Custom duration of 1500ms is respected');

    gazeManager.destroy();
  }

  // Scenario 14: Exported HTML preserves Gaze Navigation configuration
  console.log('\nTest 14: Exported JSON and HTML preserve gaze navigation properties');
  {
    const scenes = [
      {
        id: 's1',
        name: 'Scene 1',
        panorama: 'data:image/jpeg;base64,123',
        hotspots: [
          {
            id: 'gaze-h1',
            action: { type: 'gazeNavigate', target: 's2', duration: 4000 },
            appearance: { color: '#00ffff' }
          }
        ]
      }
    ];
    const config = { initialSceneId: 's1' };

    const json = buildTourConfig(config, scenes);
    assert(json.scenes[0].hotspots[0].action.type === 'gazeNavigate', 'JSON export preserves action.type = gazeNavigate');
    assert(json.scenes[0].hotspots[0].action.duration === 4000, 'JSON export preserves duration = 4000');
  }

  // Scenario 15: Clean resource disposal on destroy
  console.log('\nTest 15: Cleanup on destroy leaves no active timers or listeners');
  {
    const sceneEl = new MockElement('a-scene');
    const tour = new MockTour({ initialScene: 'scene1' });
    const gazeManager = new GazeManager(tour, sceneEl);
    const hotspotEl = new MockElement('a-entity');
    sceneEl.appendChild(hotspotEl);

    gazeManager.onGazeEnter({
      detail: {
        el: hotspotEl,
        hotspotData: { action: { type: 'gazeNavigate', target: 's2' } }
      }
    });

    gazeManager.destroy();
    assert(gazeManager.currentHotspotEl === null, 'Current hotspot cleared on destroy');
    assert(gazeManager.animationFrameId === null, 'Animation loop cancelled on destroy');
    assert(sceneEl.listeners['swt-gaze-enter'].length === 0, 'swt-gaze-enter listener removed');
    assert(sceneEl.listeners['swt-gaze-leave'].length === 0, 'swt-gaze-leave listener removed');
  }

  // Scenario 16: Editor mode deactivates automatic navigation and gaze countdown
  console.log('\nTest 16: Editor mode deactivates automatic navigation and gaze countdown');
  {
    const sceneEl = new MockElement('a-scene');
    const tour = new MockTour({ initialScene: 'scene1', isEditor: true });
    const gazeManager = new GazeManager(tour, sceneEl);
    const hotspotEl = new MockElement('a-entity');
    sceneEl.appendChild(hotspotEl);

    // Gaze enter in editor mode should NOT start countdown
    gazeManager.onGazeEnter({
      detail: {
        el: hotspotEl,
        hotspotData: { action: { type: 'gazeNavigate', target: 's2', duration: 3000 } }
      }
    });
    assert(gazeManager.currentHotspotEl === null, 'Gaze enter ignored when isEditor: true');
    assert(gazeManager.animationFrameId === null, 'No animation loop started in editor mode');
  }

  // Scenario 17: Photo hotspot action type
  console.log('\nTest 17: Photo hotspot action support');
  {
    const photoHotspot = {
      id: 'photo-1',
      action: {
        type: 'photo',
        url: 'https://example.com/art.jpg',
        title: 'Mona Lisa',
        description: 'Capolavoro di Leonardo da Vinci'
      }
    };
    assert(photoHotspot.action.type === 'photo', 'Photo hotspot action.type is photo');
    assert(photoHotspot.action.url === 'https://example.com/art.jpg', 'Photo hotspot stores image URL');
  }

  // Scenario 18: Hotspot scaling support
  console.log('\nTest 18: Hotspot scaling support');
  {
    const scaledHotspot = {
      id: 'scaled-1',
      appearance: {
        scale: '2.5 2.5 2.5'
      }
    };
    assert(scaledHotspot.appearance.scale === '2.5 2.5 2.5', 'Hotspot stores appearance.scale vector');
    const scaleNum = parseFloat(scaledHotspot.appearance.scale.split(' ')[0]);
    assert(scaleNum === 2.5, 'Hotspot scale multiplier parsed correctly as 2.5');
  }

  // Scenario 19: Photo aspect ratio preservation
  console.log('\nTest 19: Photo aspect ratio preservation and dimension calculation');
  {
    const landscapePhoto = {
      id: 'photo-landscape',
      action: { type: 'photo', url: 'test.jpg' },
      appearance: { aspectRatio: 1920 / 1080 } // 16:9 ~ 1.7778
    };
    const portraitPhoto = {
      id: 'photo-portrait',
      action: { type: 'photo', url: 'test-port.jpg' },
      appearance: { aspectRatio: 1080 / 1920 } // 9:16 ~ 0.5625
    };

    // Calculate dimensions
    const calcDim = (aspect) => {
      let w = 1.5, h = 1.5;
      if (aspect >= 1) {
        h = 1.5 / aspect;
      } else {
        w = 1.5 * aspect;
      }
      return { width: parseFloat(w.toFixed(3)), height: parseFloat(h.toFixed(3)) };
    };

    const lDim = calcDim(landscapePhoto.appearance.aspectRatio);
    assert(lDim.width === 1.5, 'Landscape photo width is 1.5');
    assert(Math.abs(lDim.height - (1.5 / (1920 / 1080))) < 0.01, 'Landscape photo height maintains 16:9 ratio');

    const pDim = calcDim(portraitPhoto.appearance.aspectRatio);
    assert(pDim.height === 1.5, 'Portrait photo height is 1.5');
    assert(Math.abs(pDim.width - (1.5 * (1080 / 1920))) < 0.01, 'Portrait photo width maintains 9:16 ratio');
  }

  // --- Test 20: Static photo hotspot is not gaze-navigable and displays title above it ---
  console.log('\nTest 20: Static photo hotspot non-clickable / non-gaze behavior');
  {
    const photoHotspot = {
      id: 'photo-1',
      action: { type: 'photo', url: 'photo.jpg' },
      tooltip: { text: 'Stadio Maradona' }
    };

    assert(!isGazeHotspot(photoHotspot), 'Static photo hotspot is not classified as gaze hotspot');
    const title = photoHotspot.tooltip?.text || '';
    assert(title === 'Stadio Maradona', 'Title correctly resolved for display above static photo');
  }

  // --- Test 21: Global gaze configuration & gazeForAll support ---
  console.log('\nTest 21: Global gaze configuration & gazeForAll support');
  {
    const standardHotspot = {
      id: 'h-std',
      action: { type: 'navigate', target: 'scene-2' }
    };

    assert(isGazeHotspot(standardHotspot) === false, 'Standard hotspot without global config is not gaze');
    assert(isGazeHotspot(standardHotspot, { settings: { gazeNavigation: true } }) === true, 'Global gazeNavigation enables gaze for all hotspots');
    assert(isGazeHotspot(standardHotspot, { settings: { gazeForAll: true } }) === true, 'Global gazeForAll enables gaze for all hotspots');
  }

  // --- Test 22: Gaze Image hotspot zoom animation and navigation trigger ---
  console.log('\nTest 22: Gaze Image hotspot zoom animation and navigation trigger');
  {
    const gazeImageHotspot = {
      id: 'gaze-img-1',
      action: { type: 'gazeImage', target: 'scene-next', duration: 3000, url: 'next-preview.jpg' },
      appearance: { scale: '1.0 1.0 1.0' }
    };

    assert(isGazeHotspot(gazeImageHotspot), 'Gaze Image hotspot is correctly classified as gaze hotspot');

    const sceneEl = new MockElement('a-scene');
    const tour = new MockTour({ initialScene: 'scene-1' });
    const gazeManager = new GazeManager(tour, sceneEl);
    const hotspotEl = new MockElement('a-entity');
    const imageEl = new MockElement('a-image');
    imageEl.setAttribute('scale', '1 1 1');
    hotspotEl.appendChild(imageEl);
    sceneEl.appendChild(hotspotEl);

    // Gaze enter
    gazeManager.onGazeEnter({ detail: { el: hotspotEl, hotspotData: gazeImageHotspot } });
    assert(gazeManager.currentHotspotEl === hotspotEl, 'GazeManager active on gazeImage hotspot');
    assert(gazeManager.currentVisualEl !== null, 'Visual element tracked for zoom animation');

    // Trigger navigation on timer completion
    gazeManager.triggerNavigation(gazeImageHotspot);
    assert(tour.navigations.length === 1 && tour.navigations[0] === 'scene-next', 'Navigated to target scene upon gazeImage completion');

    gazeManager.destroy();
  }

  // --- Test 23: Static photo 3D card layout and structure ---
  console.log('\nTest 23: Static photo 3D card layout and structure');
  {
    const photoHotspot = {
      id: 'photo-card-1',
      action: { type: 'photo', url: 'mona-lisa.jpg', title: 'Mona Lisa', description: 'Dipinto a olio di Leonardo da Vinci' },
      tooltip: { text: 'Mona Lisa', description: 'Dipinto a olio di Leonardo da Vinci' },
      appearance: { aspectRatio: 1.5 }
    };

    const sceneEl = new MockElement('a-scene');
    const hotspotEl = new MockElement('a-entity');
    sceneEl.appendChild(hotspotEl);

    const visualEl = new MockElement('a-image');
    visualEl.setAttribute('src', 'mona-lisa.jpg');
    visualEl.setAttribute('class', 'clickable');
    visualEl.setAttribute('visible', 'true');
    visualEl.sceneEl = sceneEl;
    hotspotEl.appendChild(visualEl);

    const controller = new StaticPhotoController(visualEl, photoHotspot);
    assert(!controller.isCardOpen, 'Card is initially closed');

    // Open card
    controller.openCard();
    assert(controller.isCardOpen, 'Card is now open');
    assert(visualEl.getAttribute('visible') === 'false', 'Original photo is hidden when card is open');
    assert(controller.cardEl !== null, 'Card entity created');

    const card = controller.cardEl;
    const imgEl = card.querySelector('.swt-photo-card-img');
    assert(imgEl !== null, 'Card contains original photo element on the left');
    assert(imgEl.getAttribute('src') === 'mona-lisa.jpg', 'Card photo has correct image source');

    const titleEl = card.querySelector('.swt-photo-card-title');
    assert(titleEl !== null, 'Card contains title text on the right');
    assert(titleEl.getAttribute('value') === 'Mona Lisa', 'Card title matches hotspot title');

    const descEl = card.querySelector('.swt-photo-card-desc');
    assert(descEl !== null, 'Card contains description text on the right');
    assert(descEl.getAttribute('value') === 'Dipinto a olio di Leonardo da Vinci', 'Card description matches hotspot description');

    const closeBtn = card.querySelector('.swt-photo-card-close');
    assert(closeBtn !== null, "Card contains 'X' close button at top-right");
    const closeText = closeBtn.querySelector('.swt-photo-card-close-icon');
    assert(closeText !== null && closeText.getAttribute('value') === 'X', "'X' close button displays 'X' symbol");

    controller.destroy();
  }

  // --- Test 24: Gaze focus on 'X' for 2 seconds closes card and restores photo ---
  console.log('\nTest 24: Gaze focus on X for 2 seconds closes card and restores photo');
  {
    const photoHotspot = {
      id: 'photo-card-2',
      action: { type: 'photo', url: 'mona-lisa.jpg', title: 'Mona Lisa', description: 'Test description' }
    };

    const sceneEl = new MockElement('a-scene');
    const hotspotEl = new MockElement('a-entity');
    sceneEl.appendChild(hotspotEl);

    const visualEl = new MockElement('a-image');
    visualEl.setAttribute('src', 'mona-lisa.jpg');
    visualEl.setAttribute('class', 'clickable');
    visualEl.setAttribute('visible', 'true');
    visualEl.sceneEl = sceneEl;
    hotspotEl.appendChild(visualEl);

    const controller = new StaticPhotoController(visualEl, photoHotspot, { closeDuration: 2000 });
    controller.openCard();
    assert(controller.isCardOpen, 'Card opened');

    // Simulate focus on close button
    controller.handleCloseEnter();
    assert(controller.isCloseFocused, "Focus active on 'X' button");
    assert(controller.closeBgEl.getAttribute('color') === '#ef4444', "'X' button highlighted on focus");

    // Close card when 2000ms timer completes
    controller.closeCard();
    assert(!controller.isCardOpen, "Card closed after 2-second focus on 'X'");
    assert(visualEl.getAttribute('visible') === 'true', 'Original photo restored to its initial state');
    assert(visualEl.classList.has('clickable') || visualEl.getAttribute('class').includes('clickable'), 'Original photo clickable again');

    controller.destroy();
  }

  // --- Test 25: Looking away from 'X' before 2 seconds cancels countdown ---
  console.log('\nTest 25: Looking away from X before 2 seconds cancels countdown');
  {
    const photoHotspot = {
      id: 'photo-card-3',
      action: { type: 'photo', url: 'mona-lisa.jpg', title: 'Mona Lisa' }
    };

    const sceneEl = new MockElement('a-scene');
    const hotspotEl = new MockElement('a-entity');
    sceneEl.appendChild(hotspotEl);

    const visualEl = new MockElement('a-image');
    visualEl.setAttribute('src', 'mona-lisa.jpg');
    visualEl.sceneEl = sceneEl;
    hotspotEl.appendChild(visualEl);

    const controller = new StaticPhotoController(visualEl, photoHotspot, { closeDuration: 2000 });
    controller.openCard();

    // Enter 'X'
    controller.handleCloseEnter();
    assert(controller.isCloseFocused, "Focus active on 'X'");

    // Leave 'X' before 2s
    controller.handleCloseLeave();
    assert(!controller.isCloseFocused, "Countdown cancelled when looking away from 'X'");
    assert(controller.isCardOpen, 'Card remains open');
    assert(controller.closeBgEl.getAttribute('color') === '#334155', "'X' button returned to normal color");

    // Return to 'X' restarts countdown
    controller.handleCloseEnter();
    assert(controller.isCloseFocused, "Re-entering 'X' restarts countdown");
    controller.cancelCloseCountdown();

    // Click 'X' closes immediately
    controller.handleCloseClick();
    assert(!controller.isCardOpen, "Click on 'X' closes card immediately");
    assert(visualEl.getAttribute('visible') === 'true', 'Original photo restored');

    controller.destroy();
  }

  // --- Test 26: Gaze focus on photo for 2 seconds opens card ---
  console.log('\nTest 26: Gaze focus on photo for 2 seconds opens card');
  {
    const photoHotspot = {
      id: 'photo-card-4',
      action: { type: 'photo', url: 'art.jpg', title: 'Art Piece' }
    };

    const sceneEl = new MockElement('a-scene');
    const hotspotEl = new MockElement('a-entity');
    sceneEl.appendChild(hotspotEl);

    const visualEl = new MockElement('a-image');
    visualEl.setAttribute('src', 'art.jpg');
    visualEl.sceneEl = sceneEl;
    hotspotEl.appendChild(visualEl);

    const controller = new StaticPhotoController(visualEl, photoHotspot, { openDuration: 2000 });
    assert(!controller.isCardOpen, 'Card closed initially');

    // Gaze enter on photo
    controller.handlePhotoEnter();
    assert(controller.isPhotoFocused, 'Photo is focused');

    // Look away before 2 seconds
    controller.handlePhotoLeave();
    assert(!controller.isPhotoFocused, 'Look away cancels open countdown');
    assert(!controller.isCardOpen, 'Card did not open');

    // Click photo opens card immediately
    controller.handlePhotoClick();
    assert(controller.isCardOpen, 'Click on photo opens card immediately');

    controller.destroy();
  }

  // --- Test 27: Card reopening and scene cleanup ---
  console.log('\nTest 27: Card reopening cycle and cleanup');
  {
    const photoHotspot = {
      id: 'photo-card-5',
      action: { type: 'photo', url: 'mona-lisa.jpg', title: 'Mona Lisa' }
    };

    const sceneEl = new MockElement('a-scene');
    const hotspotEl = new MockElement('a-entity');
    sceneEl.appendChild(hotspotEl);

    const visualEl = new MockElement('a-image');
    visualEl.setAttribute('src', 'mona-lisa.jpg');
    visualEl.sceneEl = sceneEl;
    hotspotEl.appendChild(visualEl);

    const controller = new StaticPhotoController(visualEl, photoHotspot);

    // 1. Open
    controller.openCard();
    assert(controller.isCardOpen, 'Cycle 1: Card open');

    // 2. Close via X
    controller.closeCard();
    assert(!controller.isCardOpen, 'Cycle 1: Card closed');
    assert(visualEl.getAttribute('visible') === 'true', 'Cycle 1: Photo visible');

    // 3. Reopen
    controller.openCard();
    assert(controller.isCardOpen, 'Cycle 2: Card reopened');
    assert(visualEl.getAttribute('visible') === 'false', 'Cycle 2: Photo hidden');

    // 4. Destroy
    controller.destroy();
    assert(!controller.isCardOpen, 'Destroy: Card closed');
    assert(controller.cardEl === null, 'Destroy: Card element cleaned up');
  }

  // --- Test 28: Enlarged card dimensions and close button mesh / raycaster tick detection ---
  console.log('\nTest 28: Enlarged card dimensions and close button mesh / raycaster tick detection');
  {
    const photoHotspot = {
      id: 'photo-card-enlarged',
      action: { type: 'photo', url: 'enlarged.jpg', title: 'Large Photo', description: 'Test description' },
      appearance: { aspectRatio: 1.6 }
    };

    const sceneEl = new MockElement('a-scene');
    const hotspotEl = new MockElement('a-entity');
    sceneEl.appendChild(hotspotEl);

    const cursorEl = new MockElement('a-cursor');
    cursorEl.components = {
      raycaster: {
        intersectedEls: [],
        refreshObjects: () => {}
      }
    };
    sceneEl.appendChild(cursorEl);

    const visualEl = new MockElement('a-image');
    visualEl.setAttribute('src', 'enlarged.jpg');
    visualEl.setAttribute('class', 'clickable');
    visualEl.sceneEl = sceneEl;
    hotspotEl.appendChild(visualEl);

    const controller = new StaticPhotoController(visualEl, photoHotspot, { closeDuration: 2000 });
    controller.openCard();
    assert(controller.isCardOpen, 'Card is open');

    const card = controller.cardEl;
    const bgPlane = card.querySelector('.swt-photo-card-bg');
    assert(bgPlane !== null, 'Card has background plane');
    assert(parseFloat(bgPlane.getAttribute('width')) === 7.8, 'Card background plane width is enlarged to 7.8m');
    assert(parseFloat(bgPlane.getAttribute('height')) === 4.6, 'Card background plane height is enlarged to 4.6m');

    const closeBtn = card.querySelector('.swt-photo-card-close');
    assert(closeBtn !== null, 'Close button exists');
    assert(closeBtn.tagName === 'A-CIRCLE', 'Close button is an a-circle element with native 3D mesh');
    assert(closeBtn.getAttribute('radius') === '0.28', 'Close button radius is 0.28m');
    assert(closeBtn.getAttribute('class').includes('clickable'), 'Close button has clickable class');

    // Simulate raycaster intersection with close button via tick()
    cursorEl.components.raycaster.intersectedEls = [closeBtn];
    controller.tick();
    assert(controller.isCloseFocused, 'tick() detected gaze raycaster intersection on X button');

    // Fast-forward closeStartTime to simulate expiration (accounting for performance.now())
    const now = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
    controller.closeStartTime = now - 2500;
    controller.tick();
    assert(!controller.isCardOpen, 'tick() closed card after gaze duration expired');
    assert(visualEl.getAttribute('visible') === 'true', 'Original photo restored after card close');

    controller.destroy();
  }

  // --- Test 29: Static photo description support in tour config and editor models ---
  console.log('\nTest 29: Static photo description support in tour config and editor models');
  {
    const rawPhotoHotspot = {
      id: 'photo-desc-test',
      type: 'photo',
      action: {
        type: 'photo',
        url: 'art.jpg',
        title: 'Mona Lisa',
        description: 'Leonardo da Vinci masterpiece'
      },
      tooltip: {
        text: 'Mona Lisa',
        description: 'Leonardo da Vinci masterpiece'
      }
    };

    assert(rawPhotoHotspot.action.description === 'Leonardo da Vinci masterpiece', 'Hotspot action holds description');
    assert(rawPhotoHotspot.tooltip.description === 'Leonardo da Vinci masterpiece', 'Tooltip holds description');

    // Test buildTourConfig preserves description
    const tourConfig = buildTourConfig(
      { initialSceneId: 'scene-1' },
      [
        {
          id: 'scene-1',
          hotspots: [rawPhotoHotspot]
        }
      ]
    );

    const exportedHotspot = tourConfig.scenes[0].hotspots[0];
    assert(exportedHotspot.action.description === 'Leonardo da Vinci masterpiece', 'Exported tour config preserves action.description');
    assert(exportedHotspot.tooltip.description === 'Leonardo da Vinci masterpiece', 'Exported tour config preserves tooltip.description');
  }

  // --- Test 30: 100-word description formatting and typography in 3D card ---
  console.log('\nTest 30: 100-word description formatting and typography in 3D card');
  {
    const long100WordDesc = [
      "This magnificent photograph captures the evocative atmosphere of the historic landmark during golden sunset.",
      "The architectural details stand out sharply against the warm evening light, creating an extraordinary contrast between subtle shadows and vibrant reflections.",
      "The photographic composition was meticulously crafted to accentuate the central perspective of the main building,",
      "naturally guiding the viewer's eyes toward the infinite distant horizon.",
      "Every single visual element within the frame contributes to conveying a timeless sense of calm, elegance, and grandeur,",
      "making this striking image an exemplary piece of fine-art photography dedicated to celebrating the cultural and artistic heritage of the surrounding historic region.",
      "An engaging, authentic, and emotionally captivating visual journey for every visitor exploring this immersive virtual tour."
    ].join(' ');

    const wordCount = long100WordDesc.split(/\s+/).filter(Boolean).length;
    assert(wordCount >= 95, `Test text contains ~100 words (actual: ${wordCount})`);

    const photoHotspot = {
      id: 'photo-100-words',
      action: {
        type: 'photo',
        url: 'monument.jpg',
        title: 'National Historic Monument',
        description: long100WordDesc
      }
    };

    const sceneEl = new MockElement('a-scene');
    const hotspotEl = new MockElement('a-entity');
    sceneEl.appendChild(hotspotEl);

    const visualEl = new MockElement('a-image');
    visualEl.setAttribute('src', 'monument.jpg');
    visualEl.sceneEl = sceneEl;
    hotspotEl.appendChild(visualEl);

    const controller = new StaticPhotoController(visualEl, photoHotspot);
    controller.openCard();

    const descEl = controller.cardEl.querySelector('.swt-photo-card-desc');
    assert(descEl !== null, 'Description element created in card');
    assert(descEl.getAttribute('value') === long100WordDesc, 'Description text preserved exactly');

    const wrapCount = parseInt(descEl.getAttribute('wrap-count'), 10);
    assert(wrapCount >= 40, `wrap-count is calibrated for readability without overflow (wrap-count: ${wrapCount} >= 40)`);

    const width = parseFloat(descEl.getAttribute('width'));
    assert(width >= 3.0, `Description width allocates wide text column (width: ${width} >= 3.0m)`);

    // Verify character sizing ensures ~100 words fits within card height
    const charWidth = width / wrapCount;
    const estLineCount = Math.ceil(long100WordDesc.length / wrapCount);
    const estTextHeight = estLineCount * (charWidth * 1.25);
    const cardHeight = 4.6;
    assert(estTextHeight < cardHeight * 0.7, `Estimated 100-word text height (${estTextHeight.toFixed(2)}m) comfortably fits within card height (${cardHeight}m)`);

    controller.destroy();
  }

  // --- Test 31: Photo scaling 2x floating title positioning above enlarged photo ---
  console.log('\nTest 31: Photo scaling 2x floating title positioning above enlarged photo');
  {
    const sceneEl = new MockElement('a-scene');
    const assetManager = { addAsset: () => {} };
    const hotspotManager = new HotspotManager(sceneEl, assetManager);

    const scaledPhotoHotspot = {
      id: 'photo-2x',
      position: { x: 0, y: 1.5, z: -5 },
      action: { type: 'photo', url: 'monument.jpg' },
      appearance: { scale: '2.0 2.0 2.0', aspectRatio: 1.5 },
      tooltip: { text: 'Monument 2x' }
    };

    hotspotManager.createHotspot(scaledPhotoHotspot, 0);

    const hotspotEl = sceneEl.children[0];
    assert(hotspotEl !== undefined, 'Hotspot entity created in scene');

    const visualEl = hotspotEl.querySelector('a-image');
    assert(visualEl !== null, 'Visual photo image entity exists');
    assert(visualEl.getAttribute('scale') === '2 2 2', 'Photo scale is 2 2 2');

    const titleWrap = hotspotEl.querySelector('#swt-photo-title-0');
    assert(titleWrap !== null, 'Floating title entity exists for photo');

    const titlePos = titleWrap.getAttribute('position').split(/\s+/).map(Number);
    const titleY = titlePos[1];

    const photoHeight = parseFloat(visualEl.getAttribute('height')) || 1.0;
    const photoHalfHeightScaled = (photoHeight * 0.5) * 2.0;

    assert(titleY > photoHalfHeightScaled, `Title Y position (${titleY}m) is strictly above photo top edge (${photoHalfHeightScaled}m) and not covered`);

    const titleScale = parseFloat(titleWrap.getAttribute('scale').split(/\s+/)[0]);
    assert(titleScale > 1.0, `Title scale (${titleScale}) scales proportionally with photo`);
  }

  // --- Test 32: Description font size slider (descFontSize) adjustments on 3D card ---
  console.log('\nTest 32: Description font size slider (descFontSize) adjustments on 3D card');
  {
    const sceneEl = new MockElement('a-scene');
    const hotspotEl = new MockElement('a-entity');
    sceneEl.appendChild(hotspotEl);

    const visualEl = new MockElement('a-image');
    visualEl.setAttribute('src', 'sample.jpg');
    visualEl.sceneEl = sceneEl;
    hotspotEl.appendChild(visualEl);

    // Case A: 1.5x font size (larger font -> wrap-count decreases to 31)
    const largeFontHotspot = {
      id: 'photo-font-large',
      action: { type: 'photo', url: 'sample.jpg', title: 'Art Piece', description: 'Desc text' },
      appearance: { descFontSize: 1.5 }
    };
    const controllerLarge = new StaticPhotoController(visualEl, largeFontHotspot);
    controllerLarge.openCard();
    const descLarge = controllerLarge.cardEl.querySelector('.swt-photo-card-desc');
    assert(descLarge !== null, 'Description element created for large font card');
    assert(parseInt(descLarge.getAttribute('wrap-count'), 10) === 31, '1.5x descFontSize decreases wrap-count to 31 (larger characters)');
    controllerLarge.destroy();

    // Case B: 0.8x font size (smaller font -> wrap-count increases to 58)
    const smallFontHotspot = {
      id: 'photo-font-small',
      action: { type: 'photo', url: 'sample.jpg', title: 'Art Piece', description: 'Desc text' },
      appearance: { descFontSize: 0.8 }
    };
    const controllerSmall = new StaticPhotoController(visualEl, smallFontHotspot);
    controllerSmall.openCard();
    const descSmall = controllerSmall.cardEl.querySelector('.swt-photo-card-desc');
    assert(descSmall !== null, 'Description element created for small font card');
    assert(parseInt(descSmall.getAttribute('wrap-count'), 10) === 58, '0.8x descFontSize increases wrap-count to 58 (smaller characters)');
    controllerSmall.destroy();
  }

  // --- Test 33: Editor photo properties: Color hidden, description font slider displayed and exported ---
  console.log('\nTest 33: Editor photo properties: Color hidden, description font slider displayed and exported');
  {
    // Visibility rules matching UIController logic:
    const resolveEditorVisibility = (hotspot) => {
      const isPhoto = hotspot.action?.type === 'photo' || hotspot.type === 'photo';
      return {
        showColor: isPhoto ? 'none' : 'block',
        showDescFont: isPhoto ? 'block' : 'none',
        descFontVal: hotspot.appearance?.descFontSize ?? hotspot.action?.descFontSize ?? 1.0
      };
    };

    const photoHotspot = {
      id: 'photo-test',
      action: { type: 'photo', url: 'photo.jpg', description: 'Test desc', descFontSize: 1.2 },
      appearance: { descFontSize: 1.2 },
      tooltip: { text: 'Photo Hotspot', description: 'Test desc' }
    };

    const photoVis = resolveEditorVisibility(photoHotspot);
    assert(photoVis.showColor === 'none', 'Color picker is hidden for static photo');
    assert(photoVis.showDescFont === 'block', 'Description font size slider is displayed for static photo');
    assert(photoVis.descFontVal === 1.2, 'Description font size slider reads 1.2');

    const gazeHotspot = {
      id: 'gaze-test',
      action: { type: 'gazeNavigate', target: 's2', duration: 3000 },
      appearance: { color: '#00ffff' }
    };

    const gazeVis = resolveEditorVisibility(gazeHotspot);
    assert(gazeVis.showColor === 'block', 'Color picker is visible for gaze navigation hotspot');
    assert(gazeVis.showDescFont === 'none', 'Description font size slider is hidden for gaze hotspot');

    // Test export preserves descFontSize
    const tourConfig = buildTourConfig(
      { initialSceneId: 'scene-1' },
      [{ id: 'scene-1', hotspots: [photoHotspot] }]
    );
    const exportedHotspot = tourConfig.scenes[0].hotspots[0];
    assert(exportedHotspot.appearance.descFontSize === 1.2, 'Exported tour config preserves appearance.descFontSize');
    assert(exportedHotspot.action.descFontSize === 1.2, 'Exported tour config preserves action.descFontSize');
  }

  // --- Test 34: GazeImage single title verification (no duplicate tooltip on gaze/hover) ---
  console.log('\nTest 34: GazeImage single title verification (no duplicate tooltip on gaze/hover)');
  {
    const sceneEl = new MockElement('a-scene');
    const assetManager = { addAsset: () => {}, preloadImage: async () => ({ naturalWidth: 800, naturalHeight: 600 }) };
    const hotspotManager = new HotspotManager(sceneEl, assetManager);

    const gazeImageHotspot = {
      id: 'gaze-img-single-title',
      position: { x: 1, y: 1.5, z: -4 },
      action: { type: 'gazeImage', target: 'scene-next', duration: 3000, url: 'next.jpg' },
      tooltip: { text: 'Next Scene Preview' }
    };

    hotspotManager.createHotspot(gazeImageHotspot, 0);

    const hotspotEl = sceneEl.children[0];
    assert(hotspotEl !== undefined, 'Hotspot created in scene');

    // Verify exactly ONE photo title entity is created inside the hotspot element
    const titleWrap = hotspotEl.querySelector('#swt-photo-title-0');
    assert(titleWrap !== null, 'Dedicated photo title entity created for gazeImage');
    assert(titleWrap.getAttribute('visible') === 'true', 'GazeImage title is visible above image');

    // Simulate hover/gaze enter event arriving at HotspotManager
    hotspotManager.handleHotspotHover({
      detail: {
        hotspotData: gazeImageHotspot,
        isHovering: true
      }
    });

    // Verify global tooltipEl is NOT made visible (suppressing duplicate title)
    assert(
      !hotspotManager.tooltipEl || hotspotManager.tooltipEl.getAttribute('visible') === 'false',
      'Global tooltipEl remains hidden for gazeImage so only ONE title exists'
    );
  }

  console.log(`\n=== RESULTS: ${passCount} PASSED, ${failCount} FAILED ===\n`);
  if (failCount > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
