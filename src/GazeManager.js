const requestAnimFrame =
  (typeof window !== 'undefined' && window.requestAnimationFrame) ||
  (typeof requestAnimationFrame !== 'undefined' ? requestAnimationFrame : null) ||
  ((fn) => setTimeout(fn, 16));

const cancelAnimFrame =
  (typeof window !== 'undefined' && window.cancelAnimationFrame) ||
  (typeof cancelAnimationFrame !== 'undefined' ? cancelAnimationFrame : null) ||
  ((id) => clearTimeout(id));

export class GazeManager {
  /**
   * @param {Object} tour - SWT.Tour instance
   * @param {HTMLElement} sceneEl - A-Frame scene element
   */
  constructor(tour, sceneEl) {
    this.tour = tour;
    this.sceneEl = sceneEl;

    this.currentHotspotEl = null;
    this.currentHotspotData = null;
    this.startTime = 0;
    this.duration = 3000;
    this.hasTriggered = false;
    this.isNavigating = false;
    this.animationFrameId = null;
    this.progressIndicatorEl = null;

    this.boundOnGazeEnter = this.onGazeEnter.bind(this);
    this.boundOnGazeLeave = this.onGazeLeave.bind(this);
    this.boundOnSceneLoading = this.onSceneLoading.bind(this);
    this.boundOnSceneLoaded = this.onSceneLoaded.bind(this);
    this.boundOnVRChange = this.onVRChange.bind(this);

    this.sceneEl.addEventListener('swt-gaze-enter', this.boundOnGazeEnter);
    this.sceneEl.addEventListener('swt-gaze-leave', this.boundOnGazeLeave);
    this.sceneEl.addEventListener('scene-loading', this.boundOnSceneLoading);
    this.sceneEl.addEventListener('scene-loaded', this.boundOnSceneLoaded);
    this.sceneEl.addEventListener('enter-vr', this.boundOnVRChange);
    this.sceneEl.addEventListener('exit-vr', this.boundOnVRChange);
  }

  /**
   * Resolves the configured gaze duration for a hotspot.
   * Defaults to 3000ms if not specified.
   * @param {Object} hotspotData
   * @returns {number} duration in milliseconds
   */
  getDuration(hotspotData) {
    if (!hotspotData) return 3000;
    const dur =
      hotspotData.action?.duration ??
      hotspotData.duration ??
      this.tour?.config?.settings?.defaultGazeDuration ??
      3000;
    const parsed = parseInt(dur, 10);
    return isFinite(parsed) && parsed > 0 ? parsed : 3000;
  }

  /**
   * Ensures the circular progress indicator is created and attached to cursor or camera.
   * @returns {HTMLElement} progress entity
   */
  ensureProgressIndicator() {
    if (this.progressIndicatorEl && this.progressIndicatorEl.parentNode && this.progressIndicatorEl.isConnected) {
      return this.progressIndicatorEl;
    }

    if (this.progressIndicatorEl && this.progressIndicatorEl.parentNode) {
      this.progressIndicatorEl.parentNode.removeChild(this.progressIndicatorEl);
    }

    const cursorEl = this.sceneEl.querySelector('[cursor]') || this.sceneEl.querySelector('a-cursor');
    const cameraEl = this.sceneEl.querySelector('[camera]') || this.sceneEl.querySelector('a-camera');

    this.progressIndicatorEl = document.createElement('a-entity');
    this.progressIndicatorEl.setAttribute('id', 'swt-gaze-progress-indicator');
    this.progressIndicatorEl.setAttribute('swt-gaze-progress', '');

    if (cursorEl) {
      // Position slightly in front of the cursor
      this.progressIndicatorEl.setAttribute('position', '0 0 0.001');
      cursorEl.appendChild(this.progressIndicatorEl);
    } else if (cameraEl) {
      // Position concentric with standard reticle distance
      this.progressIndicatorEl.setAttribute('position', '0 0 -0.999');
      cameraEl.appendChild(this.progressIndicatorEl);
    } else {
      this.sceneEl.appendChild(this.progressIndicatorEl);
    }

    return this.progressIndicatorEl;
  }

  /**
   * Update progress ring indicator
   * @param {number} ratio - 0 to 1
   * @param {string} [color]
   */
  setProgress(ratio, color) {
    const el = this.ensureProgressIndicator();
    if (el && el.components && el.components['swt-gaze-progress']) {
      el.components['swt-gaze-progress'].setProgress(ratio, color);
    }
  }

  /**
   * Reset progress ring indicator
   */
  resetProgress() {
    if (this.progressIndicatorEl && this.progressIndicatorEl.components && this.progressIndicatorEl.components['swt-gaze-progress']) {
      this.progressIndicatorEl.components['swt-gaze-progress'].reset();
    }
  }

  /**
   * Handles gaze entering a valid Gaze Navigation hotspot.
   * @param {CustomEvent} evt
   */
  onGazeEnter(evt) {
    const detail = evt?.detail || {};
    const el = detail.el;
    const hotspotData = detail.hotspotData;

    if (!el || this.isNavigating || !this.tour || this.tour.isDestroyed || this.tour.config?.isEditor) {
      return;
    }

    // If gaze returns to the same hotspot after looking away, or moves to a new one
    if (this.currentHotspotEl === el) {
      if (this.hasTriggered) {
        // Gaze is still resting on the already-triggered hotspot; do not trigger again
        return;
      }
      // Already counting for this element
      return;
    }

    // If moving from one gaze hotspot to a different one, immediately cancel previous
    if (this.currentHotspotEl && this.currentHotspotEl !== el) {
      this.cancel();
    }

    this.currentHotspotEl = el;
    this.currentHotspotData = hotspotData;
    this.duration = this.getDuration(hotspotData);
    this.startTime = performance.now();
    this.hasTriggered = false;

    // Reset and prepare visual progress indicator
    this.ensureProgressIndicator();
    this.setProgress(0, hotspotData.appearance?.color);

    // Start tick countdown loop
    this.startAnimationLoop();
  }

  /**
   * Starts requestAnimationFrame loop for smooth indicator progress and fail-safe checks.
   */
  startAnimationLoop() {
    if (this.animationFrameId) {
      cancelAnimFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    const tick = () => {
      // Fail-safe checks: element removed, tour destroyed, or scene loading
      if (!this.currentHotspotEl || !this.currentHotspotEl.isConnected) {
        this.cancel();
        return;
      }
      if (!this.tour || this.tour.isDestroyed || this.isNavigating) {
        this.cancel();
        return;
      }

      // Raycaster clearance check (extra fail-safe if A-Frame missed mouseleave)
      const cursorEl = this.sceneEl.querySelector('[cursor]') || this.sceneEl.querySelector('a-cursor');
      if (cursorEl && cursorEl.components && cursorEl.components.raycaster) {
        const intersected = cursorEl.components.raycaster.intersectedEls;
        if (intersected && intersected.length > 0) {
          const isTargetIntersected = intersected.some(
            (item) => item === this.currentHotspotEl || item.contains(this.currentHotspotEl) || this.currentHotspotEl.contains(item)
          );
          if (!isTargetIntersected) {
            this.cancel();
            return;
          }
        }
      }

      const now = performance.now();
      const elapsed = now - this.startTime;
      const progress = Math.min(1, elapsed / this.duration);

      // Update circular indicator
      this.setProgress(progress, this.currentHotspotData?.appearance?.color);

      // If duration reached and navigation not yet triggered
      if (progress >= 1 && !this.hasTriggered) {
        this.hasTriggered = true;
        this.triggerNavigation(this.currentHotspotData);
        return;
      }

      if (!this.hasTriggered) {
        this.animationFrameId = requestAnimFrame(tick);
      }
    };

    this.animationFrameId = requestAnimFrame(tick);
  }

  /**
   * Triggers navigation once countdown is complete.
   * @param {Object} hotspotData
   */
  triggerNavigation(hotspotData) {
    if (this.animationFrameId) {
      cancelAnimFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    if (!hotspotData) return;

    this.hasTriggered = true;

    const currentSceneId = this.tour.getCurrentSceneId();

    // Emit hotspot-activated and gaze-activated events
    this.tour.emit('hotspot-activated', {
      hotspotData: hotspotData,
      hotspotId: hotspotData.id,
      sceneId: currentSceneId
    });

    this.tour.emit('gaze-activated', {
      hotspotData: hotspotData,
      hotspotId: hotspotData.id,
      sceneId: currentSceneId
    });

    const isPhoto = hotspotData.action?.type === 'photo' || hotspotData.type === 'photo';
    if (isPhoto) {
      this.resetProgress();
      if (this.tour && typeof this.tour.openPhotoModal === 'function') {
        this.tour.openPhotoModal(hotspotData.action, hotspotData);
      }
      return;
    }

    const targetSceneId = hotspotData.action?.target;
    if (targetSceneId) {
      this.isNavigating = true;
      this.resetProgress();
      this.tour.navigateTo(targetSceneId).catch((err) => {
        console.error('Gaze navigation failed:', err);
      }).finally(() => {
        this.isNavigating = false;
      });
    } else {
      this.resetProgress();
    }
  }

  /**
   * Handles gaze leaving a hotspot. Cancels active timer immediately.
   * @param {CustomEvent} evt
   */
  onGazeLeave(evt) {
    const detail = evt?.detail || {};
    // If leave matches current hotspot or is an unconditioned reset
    if (!detail.el || detail.el === this.currentHotspotEl) {
      this.cancel();
    }
  }

  /**
   * Cancels any running countdown and resets visual indicator.
   */
  cancel() {
    if (this.animationFrameId) {
      cancelAnimFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    this.resetProgress();

    this.currentHotspotEl = null;
    this.currentHotspotData = null;
    this.startTime = 0;
    this.hasTriggered = false;
  }

  /**
   * Called when scene loading starts. Cancels countdown and locks navigation.
   */
  onSceneLoading() {
    this.isNavigating = true;
    this.cancel();
  }

  /**
   * Called when scene finishes loading.
   */
  onSceneLoaded() {
    this.isNavigating = false;
    this.cancel();
    this.ensureProgressIndicator();
  }

  /**
   * Called when entering or exiting VR mode. Resets gaze state.
   */
  onVRChange() {
    this.cancel();
  }

  /**
   * Clean up progress indicator entity from DOM
   */
  destroyProgressIndicator() {
    if (this.progressIndicatorEl && this.progressIndicatorEl.parentNode) {
      this.progressIndicatorEl.parentNode.removeChild(this.progressIndicatorEl);
    }
    this.progressIndicatorEl = null;
  }

  /**
   * Destroy the gaze manager and clean up all listeners and resources.
   */
  destroy() {
    this.cancel();

    if (this.sceneEl) {
      this.sceneEl.removeEventListener('swt-gaze-enter', this.boundOnGazeEnter);
      this.sceneEl.removeEventListener('swt-gaze-leave', this.boundOnGazeLeave);
      this.sceneEl.removeEventListener('scene-loading', this.boundOnSceneLoading);
      this.sceneEl.removeEventListener('scene-loaded', this.boundOnSceneLoaded);
      this.sceneEl.removeEventListener('enter-vr', this.boundOnVRChange);
      this.sceneEl.removeEventListener('exit-vr', this.boundOnVRChange);
    }

    this.destroyProgressIndicator();

    this.tour = null;
    this.sceneEl = null;
  }
}

/**
 * Checks whether a hotspot is configured as a Gaze Navigation hotspot.
 * @param {Object} hotspot
 * @param {Object} [tourConfig] - Optional tour configuration to check global gaze settings
 * @returns {boolean}
 */
export function isGazeHotspot(hotspot, tourConfig = null) {
  if (!hotspot) return false;
  if (tourConfig?.settings?.gazeNavigation || tourConfig?.settings?.gazeForAll) {
    return true;
  }
  return (
    hotspot.action?.type === 'gazeNavigate' ||
    hotspot.action?.type === 'gaze' ||
    hotspot.action?.type === 'gazePhoto' ||
    hotspot.type === 'gazeNavigate' ||
    hotspot.type === 'gaze' ||
    hotspot.action?.gaze === true ||
    hotspot.gaze === true
  );
}

export default GazeManager;
