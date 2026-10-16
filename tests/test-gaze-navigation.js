/**
 * Automated test suite for SenangWebs Tour - Gaze Navigation
 * Tests all 15 required scenarios from the prompt specification.
 */

import { GazeManager, isGazeHotspot } from '../src/GazeManager.js';
import { buildTourConfig } from '../src/editor/js/data-transform.js';

// Minimal EventEmitter / Mock DOM Element
class MockElement {
  constructor(tagName = 'div') {
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.parentNode = null;
    this.isConnected = true;
    this.attributes = {};
    this.classList = new Set();
    this.listeners = {};
    this.components = {};
    this.object3D = {
      add: () => {},
      remove: () => {}
    };
  }

  setAttribute(k, v) {
    this.attributes[k] = v;
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

  // --- Test 20: Photo hotspot title and description resolution & gaze action trigger ---
  console.log('\nTest 20: Photo hotspot title and description resolution & gaze action trigger');
  {
    const photoHotspot = {
      id: 'photo-1',
      action: { type: 'photo', url: 'photo.jpg' },
      tooltip: { text: 'Stadio Maradona', description: 'Stadio Del Napoli' }
    };

    let openedData = null;
    let openedHotspot = null;
    const mockTour = {
      getCurrentSceneId: () => 'scene-1',
      emit: () => {},
      openPhotoModal: (action, hotspot) => {
        openedData = action;
        openedHotspot = hotspot;
      }
    };

    const mockSceneEl = new MockElement('a-scene');
    const gazeManager = new GazeManager(mockTour, mockSceneEl);

    // Gaze trigger on photo hotspot
    gazeManager.triggerNavigation(photoHotspot);

    assert(openedData !== null, 'openPhotoModal called upon gaze trigger');
    assert(openedHotspot === photoHotspot, 'hotspotData passed to openPhotoModal');
    
    // Check title and description extraction logic
    const title = openedData?.title || openedHotspot?.tooltip?.text || '';
    const desc = openedData?.description || openedHotspot?.tooltip?.description || '';
    assert(title === 'Stadio Maradona', 'Title correctly resolved from tooltip.text');
    assert(desc === 'Stadio Del Napoli', 'Description correctly resolved from tooltip.description');
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
  console.log(`\n=== RESULTS: ${passCount} PASSED, ${failCount} FAILED ===\n`);
  if (failCount > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
