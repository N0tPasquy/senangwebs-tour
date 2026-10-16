/**
 * SenangWebs Tour (SWT) - Main Library Entry Point
 * Version 1.0.3
 */

import AFRAME from "aframe";
import "@bookklik/senangstart-icons/dist/senangstart-icon.min.js";
import "./components/hotspot-listener.js";
import "./components/gaze-components.js";
import { AssetManager } from "./AssetManager.js";
import { SceneManager } from "./SceneManager.js";
import { HotspotManager } from "./HotspotManager.js";
import { IconRenderer } from "./IconRenderer.js";
import { GazeManager, isGazeHotspot } from "./GazeManager.js";

/**
 * Main Tour class - The public API for the SWT library
 */
class Tour {
  constructor(aframeSceneEl, tourConfig) {
    if (!aframeSceneEl) {
      throw new Error("SWT.Tour requires an A-Frame scene element");
    }

    if (!tourConfig || !tourConfig.scenes || !tourConfig.initialScene) {
      throw new Error(
        "SWT.Tour requires a valid tour configuration with scenes and initialScene"
      );
    }

    this.sceneEl = aframeSceneEl;
    this.config = tourConfig;
    this.isStarted = false;
    this.isDestroyed = false;

    // Operation queue: serializes start()/navigateTo() so overlapping
    // calls cannot interleave panoramas and hotspots.
    this.operationQueue = Promise.resolve();
    // Tracked timers so pending work can be cancelled on destroy()
    this._timers = new Set();

    // Normalize scenes to array format (backward compatibility with object format)
    this.scenesArray = this.normalizeScenesArray(tourConfig.scenes);

    this.boundHandleHotspotClick = this.handleHotspotClick.bind(this);
    this.initializeRuntime();
  }

  /**
   * Create a tracked timeout that is cancelled on destroy()
   * @param {Function} fn
   * @param {number} ms
   * @returns {number} Timer id
   */
  addTimer(fn, ms) {
    const id = setTimeout(() => {
      this._timers.delete(id);
      fn();
    }, ms);
    this._timers.add(id);
    return id;
  }

  clearTimers() {
    this._timers.forEach((id) => clearTimeout(id));
    this._timers.clear();
  }

  /**
   * Run an operation serialized through the operation queue.
   * Stale work after destroy() or a newer start() cannot commit state.
   * @param {Function} fn - Async operation receiving the current epoch
   * @returns {Promise}
   */
  enqueueOperation(fn) {
    const run = this.operationQueue.then(() => {
      if (this.isDestroyed) {
        throw new Error("Tour instance was destroyed");
      }
      return fn();
    });
    // Keep the queue alive even when an operation fails
    this.operationQueue = run.catch(() => {});
    return run;
  }

  /**
   * Check whether an operation from a given epoch is still current
   * (the instance was neither destroyed nor re-initialized since)
   * @param {number} epoch
   * @returns {boolean}
   */
  isOperationValid(epoch) {
    return !this.isDestroyed && this._epoch === epoch;
  }

  /**
   * Initialize managers and internal event listeners.
   * Allows a destroyed tour instance to be started again.
   */
  initializeRuntime() {
    this.assetManager = new AssetManager(this.sceneEl);
    this.sceneManager = new SceneManager(this.sceneEl, this.assetManager);
    this.iconRenderer = new IconRenderer();

    const defaultHotspotSettings = this.config.settings?.defaultHotspot || {};
    this.hotspotManager = new HotspotManager(
      this.sceneEl,
      this.assetManager,
      defaultHotspotSettings,
      this.iconRenderer
    );

    this.sceneEl.addEventListener(
      "swt-hotspot-clicked",
      this.boundHandleHotspotClick
    );

    this.gazeManager = new GazeManager(this, this.sceneEl);

    // Ensure cursor exists for interaction
    this.ensureCursor();
    this._epoch = (this._epoch || 0) + 1;
    this.isDestroyed = false;
  }

  /**
   * Normalize scenes to array format
   * Supports both array and object (keyed by ID) formats for backward compatibility
   * @param {Array|Object} scenes - Scenes in either format
   * @returns {Array} - Scenes as array with id property
   */
  normalizeScenesArray(scenes) {
    if (Array.isArray(scenes)) {
      return scenes;
    }
    // Convert object format to array format
    return Object.entries(scenes).map(([id, sceneData]) => ({
      id,
      ...sceneData,
    }));
  }

  /**
   * Get scene data by ID
   * @param {string} sceneId - The scene ID to find
   * @returns {Object|undefined} - Scene data or undefined if not found
   */
  getSceneById(sceneId) {
    const targetId = String(sceneId);
    return this.scenesArray.find((scene) => String(scene.id) === targetId);
  }

  /**
   * Ensure the scene has a cursor for interaction
   */
  ensureCursor() {
    // Check config for cursor settings (default to true if undefined)
    // Supports: false (disable), true (default), or selector string
    const cursorConfig = this.config.cursor !== undefined ? this.config.cursor : true;
    
    if (cursorConfig === false) {
        return; // Cursor disabled
    }

    const camera = this.sceneEl.querySelector("[camera]") || this.sceneEl.querySelector("a-camera");
    if (camera) {
      // If config is a selector string, try to find it
      if (typeof cursorConfig === 'string') {
        const customCursor = document.querySelector(cursorConfig) || camera.querySelector(cursorConfig);
        if (customCursor) {
            return; // Custom cursor exists
        }
      }

      let cursor = camera.querySelector("[cursor]") || camera.querySelector("a-cursor");
      if (!cursor) {
        cursor = document.createElement("a-cursor");
        camera.appendChild(cursor);
      }

      // Strictly enforce fuse: false so A-Frame does NOT trigger auto-fuse clicks on mobile (iOS/Android default)
      cursor.setAttribute("fuse", "false");
      cursor.setAttribute("cursor", "fuse: false; fuseTimeout: 0;");
      cursor.setAttribute("raycaster", "objects: .clickable;");

      const disableFuse = () => {
        if (cursor.components && cursor.components.cursor) {
          cursor.components.cursor.data.fuse = false;
          cursor.components.cursor.data.fuseTimeout = 0;
          if (cursor.components.cursor.fuseTimeout) {
            clearTimeout(cursor.components.cursor.fuseTimeout);
          }
        }
      };

      disableFuse();
      cursor.addEventListener("componentinitialized", (evt) => {
        if (evt.detail?.name === "cursor") {
          disableFuse();
        }
      });

      if (this.sceneEl.hasLoaded) {
        disableFuse();
      } else {
        this.sceneEl.addEventListener("loaded", disableFuse, { once: true });
      }
    }

    // Ensure mouse/touch direct click cursor exists for seamless desktop and mobile interactions
    if (this.config.mouseCursor !== false && !this.sceneEl.querySelector("#swt-mouse-cursor")) {
      const mouseCursor = document.createElement("a-entity");
      mouseCursor.setAttribute("id", "swt-mouse-cursor");
      mouseCursor.setAttribute("cursor", "rayOrigin: mouse;");
      mouseCursor.setAttribute("raycaster", "objects: .clickable;");
      this.sceneEl.appendChild(mouseCursor);
      this.mouseCursorEl = mouseCursor;
    }
  }

  /**
   * Start the tour - Load the initial scene
   * Operations are serialized; overlapping calls queue after the current one.
   * @returns {Promise}
   */
  start() {
    return this.enqueueOperation(async () => {
      if (this.isStarted) {
        console.warn("Tour already started, cleaning up and restarting...");
        this.destroy();
      }

      if (this.isDestroyed) {
        this.initializeRuntime();
      }

      // Capture epoch after possible re-initialization
      const epoch = this._epoch;
      const initialSceneId = this.config.initialScene;
      const initialSceneData = this.getSceneById(initialSceneId);

      if (!initialSceneData) {
        throw new Error(
          `Initial scene "${initialSceneId}" not found in tour configuration`
        );
      }

      try {
        // Cancel active gaze countdown during scene loading
        if (this.gazeManager) {
          this.gazeManager.onSceneLoading();
        }

        // Emit scene-loading event
        this.emit("scene-loading", { sceneId: initialSceneId });

        // Load the scene
        await this.sceneManager.loadScene(initialSceneId, initialSceneData);
        if (!this.isOperationValid(epoch)) {
          return;
        }

        // Create hotspots
        await this.hotspotManager.createHotspots(initialSceneData.hotspots || []);
        if (!this.isOperationValid(epoch)) {
          return;
        }

        this.isStarted = true;

        // Set camera to starting position if set
        if (initialSceneData.startingPosition) {
          this.setCameraToStartingPosition(initialSceneData.startingPosition);
        }

        // Emit events
        this.emit("scene-loaded", { sceneId: initialSceneId });
        this.emit("tour-started", { sceneId: initialSceneId });

        if (this.gazeManager) {
          this.gazeManager.onSceneLoaded();
        }

        return Promise.resolve();
      } catch (error) {
        console.error("Failed to start tour:", error);
        throw error;
      }
    });
  }

  /**
   * Navigate to a specific scene
   * Operations are serialized; overlapping calls queue after the current one.
   * The previous scene (including its hotspots) is preserved if loading fails.
   * @param {string} sceneId - The ID of the scene to navigate to
   * @returns {Promise}
   */
  navigateTo(sceneId) {
    return this.enqueueOperation(async () => {
      const epoch = this._epoch;
      const sceneData = this.getSceneById(sceneId);

      if (!sceneData) {
        throw new Error(`Scene "${sceneId}" not found in tour configuration`);
      }

      if (this.sceneManager.getCurrentSceneId() === String(sceneId)) {
        console.warn(`Already at scene "${sceneId}"`);
        return Promise.resolve();
      }

      try {
        // Cancel active gaze countdown during scene loading
        if (this.gazeManager) {
          this.gazeManager.onSceneLoading();
        }

        // Emit scene-loading event
        this.emit("scene-loading", { sceneId: sceneId });

        // Transition to new scene with callback to set camera position while
        // screen is black. Old hotspots are removed only after the new
        // panorama has loaded successfully, so a failed load preserves the
        // previous scene's hotspots.
        await this.sceneManager.transitionTo(sceneId, sceneData, () => {
          if (!this.isOperationValid(epoch)) {
            return;
          }
          this.hotspotManager.removeAllHotspots();

          // Set camera to starting position during transition (while screen is still black)
          if (sceneData.startingPosition) {
            this.setCameraToStartingPosition(sceneData.startingPosition);
          }
        });
        if (!this.isOperationValid(epoch)) {
          return;
        }

        // Create new hotspots
        await this.hotspotManager.createHotspots(sceneData.hotspots || []);
        if (!this.isOperationValid(epoch)) {
          return;
        }

        // Emit scene-loaded event
        this.emit("scene-loaded", { sceneId: sceneId });

        if (this.gazeManager) {
          this.gazeManager.onSceneLoaded();
        }

        return Promise.resolve();
      } catch (error) {
        console.error(`Failed to navigate to scene "${sceneId}":`, error);
        throw error;
      }
    });
  }

  /**
   * Handle hotspot click events
   * @param {CustomEvent} evt - The hotspot click event
   */
  handleHotspotClick(evt) {
    const { hotspotData } = evt.detail;
    const currentSceneId = this.sceneManager.getCurrentSceneId();

    // Emit hotspot-activated event
    this.emit("hotspot-activated", {
      hotspotData: hotspotData,
      hotspotId: hotspotData?.id,
      sceneId: currentSceneId,
    });

    // In editor mode, navigation actions are disabled (use "Go" in sidebar)
    if (this.config.isEditor) {
      return;
    }

    // Handle the action
    if (hotspotData && hotspotData.action) {
      this.handleAction(hotspotData.action, hotspotData);
    }
  }

  /**
   * Handle a hotspot action
   * @param {Object} action - The action object
   * @param {Object} [hotspotData] - Optional full hotspot data object
   */
  handleAction(action, hotspotData = null) {
    switch (action.type) {
      case "gazeNavigate":
      case "gazeImage":
        // Handled exclusively by GazeManager on gaze countdown completion
        break;

      case "navigateTo":
        // Legacy fallback only if explicit target exists
        if (action.target) {
          this.navigateTo(action.target).catch((err) => {
            console.error("Navigation failed:", err);
          });
        }
        break;

      case "photo":
      case "image":
        // Static photo hotspots in 3D scene use hands-free in-scene 3D Card
        break;

      default:
        console.warn(`Unknown action type: ${action.type}`);
    }
  }

  /**
   * Open modal view displaying a static photo in large format with description
   * White background card for optimal readability
   * @param {Object} actionData - Action object containing url, title, description
   * @param {Object} [hotspotData] - Optional parent hotspot data object
   */
  openPhotoModal(actionData, hotspotData = null) {
    if (!actionData && !hotspotData) return;
    this.closePhotoModal();

    const imageUrl =
      actionData?.url ||
      actionData?.imageUrl ||
      hotspotData?.action?.url ||
      hotspotData?.imageUrl ||
      "";

    const title =
      actionData?.title ||
      hotspotData?.tooltip?.text ||
      hotspotData?.title ||
      hotspotData?.name ||
      "";

    const description =
      actionData?.description ||
      hotspotData?.tooltip?.description ||
      hotspotData?.description ||
      "";

    // Auto-close timer only if explicitly configured (default 0: manual touch/click close)
    const autoCloseSec =
      actionData?.autoCloseDuration ??
      hotspotData?.action?.autoCloseDuration ??
      hotspotData?.autoCloseDuration ??
      0;

    const escapeText = (str) =>
      str ? String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;") : "";

    this.ensurePhotoModalStyles();

    const modal = document.createElement("div");
    modal.id = "swt-photo-modal";
    modal.className = "swt-photo-modal-overlay";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");

    modal.innerHTML = `
      <div class="swt-photo-modal-card">
        <button type="button" class="swt-photo-modal-close" aria-label="Close">✕</button>
        <div class="swt-photo-modal-content">
          ${imageUrl ? `
            <div class="swt-photo-modal-img-wrap">
              <img class="swt-photo-modal-img" src="${imageUrl}" alt="${escapeText(title) || 'Photo'}" />
            </div>
          ` : ""}
          ${(title || description) ? `
            <div class="swt-photo-modal-info">
              ${title ? `<h3 class="swt-photo-modal-title">${escapeText(title)}</h3>` : ""}
              ${description ? `<p class="swt-photo-modal-desc">${escapeText(description)}</p>` : ""}
            </div>
          ` : ""}
        </div>
        ${autoCloseSec > 0 ? `
          <div class="swt-photo-modal-autoclose-bar" style="animation: swtModalAutoClose ${autoCloseSec}s linear forwards;" title="Auto-closing in ${autoCloseSec}s"></div>
        ` : ""}
      </div>
    `;

    const closeBtn = modal.querySelector(".swt-photo-modal-close");
    closeBtn?.addEventListener("click", () => this.closePhotoModal());

    modal.addEventListener("click", (e) => {
      if (e.target === modal) {
        this.closePhotoModal();
      }
    });

    this._onModalKeyDown = (e) => {
      if (e.key === "Escape") {
        this.closePhotoModal();
      }
    };
    window.addEventListener("keydown", this._onModalKeyDown);

    if (autoCloseSec > 0) {
      this.photoModalTimer = setTimeout(() => {
        this.closePhotoModal();
      }, autoCloseSec * 1000);
    }

    document.body.appendChild(modal);
    this.photoModalEl = modal;
  }

  /**
   * Close the active photo modal view
   */
  closePhotoModal() {
    if (this.photoModalTimer) {
      clearTimeout(this.photoModalTimer);
      this.photoModalTimer = null;
    }

    if (this._onModalKeyDown) {
      window.removeEventListener("keydown", this._onModalKeyDown);
      this._onModalKeyDown = null;
    }

    if (this.photoModalEl && this.photoModalEl.parentNode) {
      this.photoModalEl.parentNode.removeChild(this.photoModalEl);
    }
    const existing = document.getElementById("swt-photo-modal");
    if (existing && existing.parentNode) {
      existing.parentNode.removeChild(existing);
    }
    this.photoModalEl = null;
  }

  /**
   * Ensure responsive CSS styles for photo modal view exist in DOM
   */
  ensurePhotoModalStyles() {
    if (typeof document === "undefined" || document.getElementById("swt-photo-modal-styles")) return;
    const style = document.createElement("style");
    style.id = "swt-photo-modal-styles";
    style.textContent = `
      .swt-photo-modal-overlay {
        position: fixed;
        inset: 0;
        z-index: 999999;
        background: rgba(15, 23, 42, 0.78);
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 16px;
        box-sizing: border-box;
        animation: swtModalFadeIn 0.2s cubic-bezier(0.16, 1, 0.3, 1);
      }
      @keyframes swtModalFadeIn {
        from { opacity: 0; transform: scale(0.97); }
        to { opacity: 1; transform: scale(1); }
      }
      .swt-photo-modal-card {
        position: relative;
        background: #ffffff !important;
        color: #0f172a !important;
        border-radius: 16px;
        box-shadow: 0 25px 60px -15px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(0, 0, 0, 0.05);
        max-width: 860px;
        width: 100%;
        max-height: 88vh;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        box-sizing: border-box;
      }
      .swt-photo-modal-close {
        position: absolute;
        top: 12px;
        right: 12px;
        z-index: 10;
        width: 32px;
        height: 32px;
        border-radius: 50%;
        background: rgba(0, 0, 0, 0.08);
        border: none;
        color: #0f172a;
        font-size: 16px;
        font-weight: 700;
        line-height: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition: background 0.15s, transform 0.15s;
      }
      .swt-photo-modal-close:hover {
        background: rgba(0, 0, 0, 0.15);
        transform: scale(1.06);
      }
      .swt-photo-modal-content {
        display: flex;
        flex-direction: column;
        max-height: 88vh;
        overflow-y: auto;
        padding: 20px;
        box-sizing: border-box;
      }
      .swt-photo-modal-img-wrap {
        width: 100%;
        display: flex;
        justify-content: center;
        align-items: center;
        background: #f8fafc;
        border-radius: 10px;
        overflow: hidden;
        margin-bottom: 14px;
        min-height: 120px;
      }
      .swt-photo-modal-img {
        max-width: 100%;
        max-height: 60vh;
        object-fit: contain;
        display: block;
      }
      .swt-photo-modal-info {
        padding: 4px 6px 12px 6px;
      }
      .swt-photo-modal-title {
        margin: 0 0 8px 0;
        font-size: 18px;
        font-weight: 700;
        color: #0f172a !important;
        line-height: 1.35;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      }
      .swt-photo-modal-desc {
        margin: 0;
        font-size: 14px;
        line-height: 1.6;
        color: #334155 !important;
        white-space: pre-wrap;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      }
      .swt-photo-modal-autoclose-bar {
        position: absolute;
        bottom: 0;
        left: 0;
        height: 4px;
        background: #3b82f6;
        width: 100%;
        transform-origin: left;
      }
      @keyframes swtModalAutoClose {
        from { transform: scaleX(1); }
        to { transform: scaleX(0); }
      }
      @media (max-width: 600px) {
        .swt-photo-modal-overlay {
          padding: 10px;
        }
        .swt-photo-modal-card {
          border-radius: 12px;
          max-height: 92vh;
        }
        .swt-photo-modal-content {
          padding: 14px;
          max-height: 92vh;
        }
        .swt-photo-modal-img {
          max-height: 50vh;
        }
      }
    `;
    document.head.appendChild(style);
  }

  /**
   * Set camera to a starting position immediately
   * Uses look-controls internal pitchObject/yawObject for proper A-Frame compatibility
   * @param {Object} startingPosition - Object with pitch and yaw in radians
   */
  setCameraToStartingPosition(startingPosition) {
    if (!startingPosition) return;

    const camera = this.sceneEl.querySelector("[camera]");
    if (!camera) return;

    // Get look-controls component
    const lookControls = camera.components?.["look-controls"];

    // Set rotation using look-controls internal objects (already in radians)
    const setRotation = () => {
      const cam = this.sceneEl.querySelector("[camera]");
      if (!cam) return;
      
      const lc = cam.components?.["look-controls"];
      if (lc && lc.pitchObject && lc.yawObject) {
        lc.pitchObject.rotation.x = startingPosition.pitch;
        lc.yawObject.rotation.y = startingPosition.yaw;
      } else if (cam.object3D) {
        cam.object3D.rotation.set(startingPosition.pitch, startingPosition.yaw, 0);
      }
    };

    // Set immediately and retry a few times to ensure it sticks
    setRotation();
    this.addTimer(setRotation, 100);
    this.addTimer(setRotation, 300);
    this.addTimer(setRotation, 500);
  }

  /**
   * Get the current scene ID
   * @returns {string}
   */
  getCurrentSceneId() {
    return this.sceneManager.getCurrentSceneId();
  }

  /**
   * Emit a custom event
   * @param {string} eventName - The event name
   * @param {Object} detail - Event detail object
   */
  emit(eventName, detail = {}) {
    const event = new CustomEvent(eventName, {
      detail: detail,
      bubbles: true,
      cancelable: true,
    });
    this.sceneEl.dispatchEvent(event);
  }

  /**
   * Add an event listener
   * @param {string} eventName - The event name
   * @param {Function} handler - The event handler
   */
  addEventListener(eventName, handler) {
    this.sceneEl.addEventListener(eventName, handler);
  }

  /**
   * Remove an event listener
   * @param {string} eventName - The event name
   * @param {Function} handler - The event handler
   */
  removeEventListener(eventName, handler) {
    this.sceneEl.removeEventListener(eventName, handler);
  }

  /**
   * Destroy the tour and clean up resources
   */
  destroy() {
    if (this.isDestroyed) {
      return;
    }

    // Mark destroyed first so pending queued operations abort
    this.isDestroyed = true;

    // Cancel outstanding timers (camera retries, etc.)
    this.clearTimers();

    // Remove event listeners
    this.sceneEl.removeEventListener(
      "swt-hotspot-clicked",
      this.boundHandleHotspotClick
    );

    // Clean up managers (also cancels transition timers and fade overlays)
    if (this.gazeManager) {
      this.gazeManager.destroy();
      this.gazeManager = null;
    }
    this.hotspotManager.destroy();
    this.sceneManager.destroy();
    this.assetManager.destroy();
    
    // Clean up icon renderer
    if (this.iconRenderer) {
      this.iconRenderer.destroy();
    }

    // Clean up mouse cursor if created by the tour
    if (this.mouseCursorEl && this.mouseCursorEl.parentNode) {
      this.mouseCursorEl.parentNode.removeChild(this.mouseCursorEl);
      this.mouseCursorEl = null;
    }

    // Clean up photo modal if open
    this.closePhotoModal();

    this.isStarted = false;
  }
}

// Export the Tour class as the main API
export { Tour, GazeManager, isGazeHotspot };

// Also attach to window for UMD usage
if (typeof window !== "undefined") {
  window.SWT = window.SWT || {};
  window.SWT.Tour = Tour;
  window.SWT.GazeManager = GazeManager;
  window.SWT.isGazeHotspot = isGazeHotspot;
}
