// Export Manager - Handles JSON generation for SWT library
import { downloadTextAsFile, showModal, copyToClipboard, showToast, sanitizeId, deepClone, escapeHtml, safeJsonStringify } from "./utils.js";
import { IconRenderer } from "../../IconRenderer.js";
import { buildTourConfig } from "./data-transform.js";
import { EditorEvents } from "./event-emitter.js";
import packageInfo from "../../../package.json";

class ExportManager {
  constructor(editor) {
    this.editor = editor;
    this.iconRenderer = new IconRenderer();
  }

  /**
   * Generate JSON compatible with SWT library
   * Follows the tourConfig structure from example-simple.html
   * Uses shared data-transform utilities for consistent transformation
   */
  generateJSON() {
    const scenes = this.editor.sceneManager.getAllScenes();
    const config = this.editor.config;

    return buildTourConfig(config, scenes);
  }

  /**
   * Load tour data from JSON (inverse of generateJSON)
   * This loads the entire tour configuration including initialScene and all scenes
   * @param {Object} tourData - Tour configuration object with initialScene and scenes
   * @param {string} tourData.initialScene - Initial scene ID
   * @param {Array} tourData.scenes - Array of scene objects
   * @returns {boolean} Success status
   */
  loadJSON(tourData) {
    try {
      if (!tourData || typeof tourData !== 'object') {
        console.error('Invalid tour data: expected object');
        return false;
      }

      // Load scenes into scene manager
      const scenes = tourData.scenes || [];
      this.editor.sceneManager.loadScenes(scenes);

      // Set initial scene in config (accepts both initialSceneId and initialScene)
      const requestedInitialScene =
        (tourData.config && tourData.config.initialSceneId) ||
        tourData.initialSceneId ||
        tourData.initialScene;
      if (requestedInitialScene && this.editor.sceneManager.getSceneById(requestedInitialScene)) {
        this.editor.config.initialSceneId = requestedInitialScene;
      } else if (scenes.length > 0) {
        this.editor.config.initialSceneId = scenes[0].id;
      }

      // Reset preview and selection state so the new project renders cleanly
      this.editor.hotspotEditor.currentHotspotIndex = -1;
      this.editor.lastRenderedSceneIndex = -1;

      // Mark as having unsaved changes
      this.editor.hasUnsavedChanges = true;

      // Re-render the editor UI
      this.editor.render();

      showToast('Tour loaded successfully', 'success');
      
      // Emit event
      this.editor.emit(EditorEvents.PROJECT_LOAD, { tourData, source: 'loadJSON' });
      
      return true;
    } catch (error) {
      console.error('Failed to load tour data:', error);
      showToast('Failed to load tour', 'error');
      return false;
    }
  }

  /**
   * Generate JSON with icons baked in as SVG data URLs
   * This ensures the exported HTML doesn't need the SenangStart icons library
   */
  async generateJSONWithBakedIcons() {
    // Deep-clone so baked icons never modify the live editor project state
    const jsonData = deepClone(this.generateJSON());
    
    // Process icons SEQUENTIALLY: IconRenderer uses a single shared render
    // container, so parallel generation would corrupt captured icons.
    for (const scene of jsonData.scenes) {
      for (const hotspot of scene.hotspots) {
        const icon = hotspot.appearance?.icon;
        
        // Skip if no icon or if it's already a data URL or URL
        if (!icon) continue;
        if (icon.startsWith('data:') || icon.startsWith('http') || icon.startsWith('/')) continue;
        
        // Generate SVG data URL from icon name
        try {
          const color = hotspot.appearance?.color || '#ffffff';
          const dataUrl = await this.iconRenderer.generateIconDataUrl(icon, color, 128);
          if (dataUrl) {
            hotspot.appearance.icon = dataUrl;
          }
        } catch (err) {
          console.warn(`Failed to bake icon "${icon}" for export:`, err);
        }
      }
    }
    
    return jsonData;
  }

  /**
   * Export as JSON file
   */
  exportJSON() {
    try {
      const jsonData = this.generateJSON();
      const json = JSON.stringify(jsonData, null, 2);

      const title = this.editor.config.title || "tour";
      const filename = sanitizeId(title) + ".json";
      downloadTextAsFile(json, filename);

      showToast("Tour exported successfully", "success");
      return true;
    } catch (error) {
      console.error("Export failed:", error);
      showToast("Export failed", "error");
      return false;
    }
  }

  /**
   * Copy JSON to clipboard
   */
  async copyJSON() {
    try {
      const jsonData = this.generateJSON();
      const json = JSON.stringify(jsonData, null, 2);

      const success = await copyToClipboard(json);
      if (success) {
        showToast("JSON copied to clipboard", "success");
      } else {
        showToast("Failed to copy to clipboard", "error");
      }
      return success;
    } catch (error) {
      console.error("Copy failed:", error);
      showToast("Copy failed", "error");
      return false;
    }
  }

  /**
   * Generate HTML viewer code with icons baked in
   */
  async generateViewerHTML() {
    const jsonData = await this.generateJSONWithBakedIcons();
    const rawTitle = this.editor.config.title || "Virtual Tour";
    // Escape for the HTML <title> context
    const title = escapeHtml(rawTitle);
    // Pin the runtime version so exported viewers are reproducible
    const runtimeVersion = packageInfo.version;

    return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${title}</title>
    <!-- SWT Library: try same folder first (for web hosting / Altervista), then ../dist/ (local dev), then CDN -->
    <script src="swt.min.js?v=${runtimeVersion}"></script>
    <script>
      if (typeof SWT === "undefined") {
        document.write('<script src="../dist/swt.min.js"><\\/script>');
      }
    </script>
    <script>
      if (typeof SWT === "undefined") {
        document.write(
          '<script src="https://unpkg.com/senangwebs-tour@${runtimeVersion}/dist/swt.min.js"><\\/script>'
        );
      }
    </script>
  </head>
  <body>
    <a-scene id="tour-container" loading-screen="enabled: false">
      <a-camera look-controls>
        <a-cursor fuse="false" cursor="fuse: false; fuseTimeout: 0;" raycaster="objects: .clickable;"></a-cursor>
      </a-camera>
    </a-scene>

    <script>
      // Tour configuration
      // Serialized with <, >, & escaped so the data cannot break out of this script
      const tourConfig = ${safeJsonStringify(jsonData, 8)
        .split("\n")
        .map((line, i) => (i === 0 ? line : "      " + line))
        .join("\n")};

      // Initialize tour when scene is loaded (handling both already-loaded and pending load)
      const sceneEl = document.querySelector("#tour-container");
      function startTour() {
        if (typeof SWT === "undefined" || !SWT.Tour) {
          setTimeout(startTour, 30);
          return;
        }
        const tour = new SWT.Tour(sceneEl, tourConfig);
        tour.start();
      }

      if (sceneEl.hasLoaded) {
        startTour();
      } else {
        sceneEl.addEventListener("loaded", startTour);
      }
    </script>
  </body>
</html>`;
  }

  /**
   * Export as standalone HTML viewer with icons baked in
   */
  async exportViewerHTML() {
    try {
      const html = await this.generateViewerHTML();
      const title = this.editor.config.title || "tour";
      const filename = sanitizeId(title) + "-viewer.html";

      downloadTextAsFile(html, filename);

      showToast("Viewer HTML exported successfully", "success");
      return true;
    } catch (error) {
      console.error("Export viewer failed:", error);
      showToast("Export viewer failed", "error");
      return false;
    }
  }

  /**
   * Show export preview in modal
   */
  showExportPreview() {
    try {
      const jsonData = this.generateJSON();
      const json = JSON.stringify(jsonData, null, 2);

      const preview = document.getElementById("exportPreview");
      if (preview) {
        preview.textContent = json;
      }

      showModal("exportModal");
      return true;
    } catch (error) {
      console.error("Failed to show export preview:", error);
      showToast("Failed to generate preview", "error");
      return false;
    }
  }
}

export default ExportManager;
