/**
 * SenangWebs Tour (SWT) - Main Library Entry Point
 * Version 1.0.22
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

    // Background audio state
    this.bgAudio = null;
    this.boundUnlockAudio = null;

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

    // Setup background audio if configured
    this.setupBackgroundAudio();

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

        // Show welcome popup if configured and not in editor mode
        const welcomeConfig = this.config.welcome;
        if (!this.config.isEditor && welcomeConfig && welcomeConfig.enabled !== false) {
          this.openWelcomeModal();
        }

        // Start background audio if not in editor mode
        if (!this.config.isEditor && this.bgAudio) {
          this.playAudio().catch(() => {
            this.setupAudioAutoplayUnlock();
          });
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

        // Retry playing background audio if paused (e.g. autoplay was blocked on initial load)
        if (!this.config.isEditor && this.bgAudio && this.bgAudio.paused) {
          this.playAudio().catch(() => {
            this.setupAudioAutoplayUnlock();
          });
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
   * Open modal view displaying a welcome dialog to greet the user and enable audio
   * @param {Object} [welcomeData] - Optional welcome config override
   */
  openWelcomeModal(welcomeData = null) {
    if (typeof document === "undefined") return;
    this.closeWelcomeModal();

    const data = welcomeData || this.config.welcome || {};
    const title = data.title !== undefined ? data.title : "Welcome to the Tour";
    const description = data.description !== undefined ? data.description : "Click below to begin exploring the virtual tour.";
    const buttonText = data.buttonText || "Start Tour";

    const escapeText = (str) =>
      str ? String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;") : "";

    this.ensureWelcomeModalStyles();

    const modal = document.createElement("div");
    modal.id = "swt-welcome-modal";
    modal.className = "a-modal swt-welcome-modal-overlay";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");

    modal.innerHTML = `
      <div class="a-dialog swt-welcome-modal-card">
        <button type="button" class="swt-welcome-modal-close" style="display: none;" aria-label="Close">✕</button>
        <div class="a-dialog-text-container swt-welcome-modal-content">
          ${title ? `<div class="a-dialog-text swt-welcome-modal-title">${escapeText(title)}</div>` : ""}
          ${description ? `<div class="a-dialog-text swt-welcome-modal-desc">${escapeText(description)}</div>` : ""}
        </div>
        <div class="a-dialog-buttons-container">
          <button type="button" class="a-dialog-button a-dialog-ok-button swt-welcome-modal-btn">${escapeText(buttonText)}</button>
        </div>
      </div>
    `;

    const startBtn = modal.querySelector(".swt-welcome-modal-btn");
    startBtn?.addEventListener("click", () => {
      if (this.bgAudio) {
        this.playAudio().catch(() => {
          this.setupAudioAutoplayUnlock();
        });
      }
      this.closeWelcomeModal();
      this.emit("tour-welcome-started");
    });

    const closeBtn = modal.querySelector(".swt-welcome-modal-close");
    closeBtn?.addEventListener("click", () => this.closeWelcomeModal());

    modal.addEventListener("click", (e) => {
      if (e.target === modal) {
        this.closeWelcomeModal();
      }
    });

    this._onWelcomeKeyDown = (e) => {
      if (e.key === "Escape") {
        this.closeWelcomeModal();
      }
    };
    window.addEventListener("keydown", this._onWelcomeKeyDown);

    document.body.appendChild(modal);
    this.welcomeModalEl = modal;
    this.emit("tour-welcome-opened");
  }

  /**
   * Close the active welcome modal view
   */
  closeWelcomeModal() {
    if (this._onWelcomeKeyDown) {
      if (typeof window !== "undefined") {
        window.removeEventListener("keydown", this._onWelcomeKeyDown);
      }
      this._onWelcomeKeyDown = null;
    }

    if (this.welcomeModalEl && this.welcomeModalEl.parentNode) {
      this.welcomeModalEl.parentNode.removeChild(this.welcomeModalEl);
    }
    if (typeof document !== "undefined") {
      const existing = document.getElementById("swt-welcome-modal");
      if (existing && existing.parentNode) {
        existing.parentNode.removeChild(existing);
      }
    }
    this.welcomeModalEl = null;
    this.emit("tour-welcome-closed");
  }

  /**
   * Ensure responsive CSS styles for welcome modal view exist in DOM
   */
  ensureWelcomeModalStyles() {
    if (typeof document === "undefined" || document.getElementById("swt-welcome-modal-styles")) return;
    const style = document.createElement("style");
    style.id = "swt-welcome-modal-styles";
    style.textContent = `
      .swt-welcome-modal-overlay {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.60);
        font-size: 14px;
        font-weight: 600;
        line-height: 20px;
        z-index: 9999999;
      }
      .swt-welcome-modal-card {
        position: relative;
        left: 50%;
        top: 50%;
        transform: translate(-50%, -50%);
        z-index: 199995;
        width: 300px;
        max-width: calc(100vw - 32px);
        min-height: 200px;
        box-sizing: border-box;
        background-color: white !important;
        color: black !important;
        font-family: sans-serif, monospace;
        font-size: 20px;
        border-radius: 3px;
        padding: 6px;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
      }
      .swt-welcome-modal-content {
        width: 100%;
        align-self: flex-start;
        display: flex;
        justify-content: center;
        align-content: center;
        flex-direction: column;
        box-sizing: border-box;
        padding: 10px 4px 6px 4px;
      }
      .swt-welcome-modal-title {
        display: block;
        font-weight: bold;
        font-size: 13pt;
        line-height: 1.35;
        margin: 4px 6px 6px 6px;
        color: black !important;
        text-align: center;
        font-family: sans-serif, monospace;
      }
      .swt-welcome-modal-desc {
        display: block;
        font-weight: normal;
        font-size: 11pt;
        line-height: 1.4;
        margin: 4px 6px 12px 6px;
        color: #111 !important;
        text-align: center;
        white-space: pre-wrap;
        font-family: sans-serif, monospace;
      }
      .a-dialog-buttons-container {
        display: inline-flex;
        align-self: flex-end;
        width: 100%;
        height: 44px;
        box-sizing: border-box;
      }
      .swt-welcome-modal-btn {
        background-color: #00ceff !important;
        color: black !important;
        cursor: pointer;
        align-self: center;
        opacity: 0.9;
        height: 38px;
        width: 100%;
        font-size: 12pt;
        margin: 4px;
        border-radius: 2px;
        text-align: center;
        border: none;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        font-family: sans-serif, monospace;
        font-weight: normal;
        text-decoration: none;
        -webkit-transition: all 0.25s ease-in-out;
        transition: all 0.25s ease-in-out;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.10), 0 1px 2px rgba(0, 0, 0, 0.20);
        user-select: none;
      }
      .swt-welcome-modal-btn:hover,
      .swt-welcome-modal-btn:active {
        box-shadow: 0 7px 14px rgba(0,0,0,0.20), 0 2px 2px rgba(0,0,0,0.20);
        opacity: 1;
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

    // Clean up modals if open
    this.closePhotoModal();
    this.closeWelcomeModal();

    // Clean up background audio
    this.cleanupAudio();

    this.isStarted = false;
  }

  // --- Background Audio Methods ---

  /**
   * Set up HTML5 Audio instance for looping background audio
   */
  setupBackgroundAudio() {
    const AudioConstructor =
      (typeof window !== "undefined" && window.Audio) ||
      (typeof Audio !== "undefined" ? Audio : null);
    if (!AudioConstructor) return;
    if (!this.config.audio || !this.config.audio.url) return;

    this.cleanupAudio();

    try {
      let audioSrc = this.config.audio.url;
      // Convert large Base64 data URLs to Blob URLs for fast native streaming on mobile (Android/iOS)
      if (
        typeof audioSrc === "string" &&
        audioSrc.startsWith("data:audio/") &&
        typeof window !== "undefined" &&
        window.Blob &&
        window.URL &&
        window.URL.createObjectURL
      ) {
        try {
          const commaIndex = audioSrc.indexOf(",");
          if (commaIndex !== -1) {
            const header = audioSrc.slice(0, commaIndex);
            const base64Data = audioSrc.slice(commaIndex + 1);
            const mimeMatch = header.match(/:(.*?);/);
            const mime = mimeMatch ? mimeMatch[1] : "audio/mp3";
            const binaryStr = atob(base64Data);
            const len = binaryStr.length;
            const bytes = new Uint8Array(len);
            for (let i = 0; i < len; i++) {
              bytes[i] = binaryStr.charCodeAt(i);
            }
            const blob = new Blob([bytes], { type: mime });
            audioSrc = URL.createObjectURL(blob);
            this.audioBlobUrl = audioSrc;
          }
        } catch (convErr) {
          console.warn("Failed to convert audio data URL to Blob URL:", convErr);
        }
      }

      const audio = new AudioConstructor(audioSrc);
      audio.loop = this.config.audio.loop !== false;
      const vol =
        typeof this.config.audio.volume === "number"
          ? Math.max(0, Math.min(1, this.config.audio.volume))
          : 0.5;
      // Output volume is scaled relative to 35% maximum (so 0-100% slider maps to 0.0 - 0.35 actual volume)
      audio.volume = vol * 0.35;
      audio.preload = "auto";
      this.bgAudio = audio;
    } catch (err) {
      console.warn("Failed to initialize background audio:", err);
    }
  }

  /**
   * Play background audio
   * @returns {Promise}
   */
  playAudio() {
    if (!this.bgAudio) return Promise.resolve();
    try {
      const res = this.bgAudio.play();
      if (res && typeof res.then === "function") {
        return res.catch((err) => {
          return Promise.reject(err);
        });
      }
      return Promise.resolve();
    } catch (err) {
      return Promise.reject(err);
    }
  }

  /**
   * Pause background audio
   */
  pauseAudio() {
    if (!this.bgAudio) return;
    try {
      this.bgAudio.pause();
    } catch (err) {}
  }

  /**
   * Stop background audio and reset playback position
   */
  stopAudio() {
    if (!this.bgAudio) return;
    try {
      this.bgAudio.pause();
      this.bgAudio.currentTime = 0;
    } catch (err) {}
  }

  /**
   * Set audio volume (0.0 to 1.0, scaled relative to 50% max output volume)
   * @param {number} vol
   */
  setAudioVolume(vol) {
    const safeVol = Math.max(
      0,
      Math.min(1, typeof vol === "number" ? vol : parseFloat(vol) || 0)
    );
    if (this.config.audio) {
      this.config.audio.volume = safeVol;
    }
    if (this.bgAudio) {
      // 0.0 to 1.0 slider value scaled relative to 35% max output volume
      this.bgAudio.volume = safeVol * 0.35;
    }
  }

  /**
   * Update audio configuration dynamically
   * @param {Object|null} audioConfig
   */
  setAudio(audioConfig) {
    if (!audioConfig || !audioConfig.url) {
      this.cleanupAudio();
      if (this.config.audio) {
        delete this.config.audio;
      }
      return;
    }
    this.config.audio = {
      url: audioConfig.url,
      volume: typeof audioConfig.volume === "number" ? audioConfig.volume : 0.5,
      loop: audioConfig.loop !== false,
    };
    const wasPlaying = Boolean(this.bgAudio && !this.bgAudio.paused);
    this.setupBackgroundAudio();
    if (wasPlaying) {
      this.playAudio().catch(() => {
        this.setupAudioAutoplayUnlock();
      });
    }
  }

  /**
   * Listen for user gesture to unlock autoplay if initial play was blocked
   */
  setupAudioAutoplayUnlock() {
    if (this.boundUnlockAudio || !this.bgAudio || typeof window === "undefined") return;

    this.boundUnlockAudio = () => {
      if (this.bgAudio) {
        this.playAudio()
          .then(() => {
            this.removeAudioAutoplayUnlock();
          })
          .catch(() => {
            // Keep unlock listeners active until audio successfully starts playing
          });
      }
    };

    const events = ["click", "touchend", "pointerup", "keydown"];
    this._audioUnlockEvents = events;
    events.forEach((evtName) => {
      window.addEventListener(evtName, this.boundUnlockAudio, { capture: true, passive: true });
      if (typeof document !== "undefined") {
        document.addEventListener(evtName, this.boundUnlockAudio, { capture: true, passive: true });
      }
    });
  }

  /**
   * Remove autoplay unlock listeners
   */
  removeAudioAutoplayUnlock() {
    if (this.boundUnlockAudio) {
      const events = this._audioUnlockEvents || ["click", "touchend", "pointerup", "keydown"];
      events.forEach((evtName) => {
        if (typeof window !== "undefined") {
          window.removeEventListener(evtName, this.boundUnlockAudio, { capture: true });
        }
        if (typeof document !== "undefined") {
          document.removeEventListener(evtName, this.boundUnlockAudio, { capture: true });
        }
      });
      this.boundUnlockAudio = null;
    }
  }

  /**
   * Clean up background audio resources
   */
  cleanupAudio() {
    this.removeAudioAutoplayUnlock();
    if (this.audioBlobUrl && typeof URL !== "undefined" && URL.revokeObjectURL) {
      try {
        URL.revokeObjectURL(this.audioBlobUrl);
      } catch (err) {}
      this.audioBlobUrl = null;
    }
    if (this.bgAudio) {
      try {
        this.bgAudio.pause();
        this.bgAudio.src = "";
        if (typeof this.bgAudio.load === "function") {
          this.bgAudio.load();
        }
      } catch (err) {}
      this.bgAudio = null;
    }
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
