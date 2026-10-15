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

    // Handle the action
    if (hotspotData.action) {
      this.handleAction(hotspotData.action);
    }
  }

  /**
   * Handle a hotspot action
   * @param {Object} action - The action object
   */
  handleAction(action) {
    switch (action.type) {
      case "navigateTo":
        if (action.target) {
          this.navigateTo(action.target).catch((err) => {
            console.error("Navigation failed:", err);
          });
        }
        break;

      case "gazeNavigate":
        // Handled exclusively by GazeManager on gaze countdown completion
        break;

      default:
        console.warn(`Unknown action type: ${action.type}`);
    }
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
