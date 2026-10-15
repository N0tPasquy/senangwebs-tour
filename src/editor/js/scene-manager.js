// Scene Manager - Handles scene operations
import {
  generateThumbnail,
  loadImageAsDataUrl,
  sanitizeId,
  showToast,
} from "./utils.js";
import { EditorEvents } from "./event-emitter.js";

class SceneManagerEditor {
  constructor(editor) {
    this.editor = editor;
    this.scenes = [];
    this.currentSceneIndex = -1;
  }

  /**
   * Add new scene
   * @param {File|Object} fileOrConfig - Either a File object or a scene config object
   * @param {string} fileOrConfig.id - Scene ID (if config object)
   * @param {string} fileOrConfig.name - Scene name (if config object)
   * @param {string} fileOrConfig.panorama - Panorama URL (if config object)
   * @param {string} fileOrConfig.thumbnail - Thumbnail URL (if config object)
   * @param {Array} fileOrConfig.hotspots - Hotspots array (if config object)
   */
  async addScene(fileOrConfig) {
    try {
      let scene;

      // Check if it's a File/Blob or a config object
      if (fileOrConfig instanceof File || fileOrConfig instanceof Blob) {
        // Original behavior: handle File upload
        const thumbnail = await generateThumbnail(fileOrConfig);
        const imageDataUrl = await loadImageAsDataUrl(fileOrConfig, { maxDimension: 8192, quality: 0.90 });

        scene = {
          id: this.ensureUniqueSceneId(
            sanitizeId(fileOrConfig.name.replace(/\.[^/.]+$/, ""))
          ),
          name: fileOrConfig.name.replace(/\.[^/.]+$/, ""),
          panorama: imageDataUrl,
          thumbnail: thumbnail,
          hotspots: [],
        };
      } else if (typeof fileOrConfig === "object" && fileOrConfig !== null) {
        // Handle config object - support both panorama and imageUrl for backward compatibility
        scene = {
          id: this.ensureUniqueSceneId(
            fileOrConfig.id || sanitizeId(`scene-${Date.now()}`)
          ),
          name: fileOrConfig.name || "Untitled Scene",
          panorama: fileOrConfig.panorama || fileOrConfig.imageUrl || "",
          thumbnail: fileOrConfig.thumbnail || fileOrConfig.panorama || fileOrConfig.imageUrl || "",
          hotspots: fileOrConfig.hotspots || [],
          ...(fileOrConfig.startingPosition && { startingPosition: fileOrConfig.startingPosition }),
        };
      } else {
        throw new Error("Invalid argument: expected File, Blob, or scene config object");
      }

      this.scenes.push(scene);
      this.currentSceneIndex = this.scenes.length - 1;
      showToast(`Scene "${scene.name}" added successfully`, "success");
      return scene;
    } catch (error) {
      console.error("Failed to add scene:", error);
      showToast("Failed to add scene", "error");
      return null;
    }
  }

  /**
   * Ensure a scene ID is unique across all scenes.
   * Appends an incremental suffix when the ID is already taken.
   * @param {string} id - Desired scene ID
   * @returns {string} A unique scene ID
   */
  ensureUniqueSceneId(id) {
    if (!this.getSceneById(id)) {
      return id;
    }
    let counter = 2;
    while (this.getSceneById(`${id}_${counter}`)) {
      counter++;
    }
    return `${id}_${counter}`;
  }

  /**
   * Remove scene by index
   */
  removeScene(index) {
    if (index >= 0 && index < this.scenes.length) {
      const scene = this.scenes[index];

      // Confirm deletion
      if (!confirm(`Are you sure you want to delete scene "${scene.name}"?`)) {
        return false;
      }

      this.scenes.splice(index, 1);

      // Clean up dangling references to the deleted scene
      const deletedId = scene.id;
      this.scenes.forEach((remainingScene) => {
        remainingScene.hotspots.forEach((hotspot) => {
          if (hotspot.action?.target === deletedId) {
            hotspot.action.target = "";
          }
        });
      });
      if (this.editor.config.initialSceneId === deletedId) {
        this.editor.config.initialSceneId =
          this.scenes.length > 0 ? this.scenes[0].id : "";
      }

      // Update current scene index
      if (this.currentSceneIndex === index) {
        this.currentSceneIndex = Math.min(
          this.currentSceneIndex,
          this.scenes.length - 1
        );
      } else if (this.currentSceneIndex > index) {
        this.currentSceneIndex--;
      }

      showToast(`Scene "${scene.name}" removed`, "success");
      return true;
    }
    return false;
  }

  /**
   * Get scene by index
   */
  getScene(index) {
    return this.scenes[index] || null;
  }

  /**
   * Get scene by ID
   */
  getSceneById(id) {
    return this.scenes.find((s) => s.id === id) || null;
  }

  /**
   * Get scene index by ID
   */
  getSceneIndexById(id) {
    return this.scenes.findIndex((s) => s.id === id);
  }

  /**
   * Update scene property
   */
  updateScene(index, property, value) {
    if (index >= 0 && index < this.scenes.length) {
      const oldId = this.scenes[index].id;
      this.scenes[index][property] = value;

      // If updating ID, update all hotspot target references (uses nested action.target)
      // and keep config.initialSceneId pointing at the renamed scene
      if (property === "id") {
        // Prevent duplicate IDs
        if (this.getSceneById(value)) {
          return false;
        }
        this.scenes.forEach((scene) => {
          scene.hotspots.forEach((hotspot) => {
            if (hotspot.action?.target === oldId) {
              hotspot.action.target = value;
            }
          });
        });
        if (this.editor.config.initialSceneId === oldId) {
          this.editor.config.initialSceneId = value;
        }
      }

      return true;
    }
    return false;
  }

  /**
   * Reorder scenes
   */
  reorderScenes(fromIndex, toIndex) {
    if (
      fromIndex >= 0 &&
      fromIndex < this.scenes.length &&
      toIndex >= 0 &&
      toIndex < this.scenes.length
    ) {
      const scene = this.scenes.splice(fromIndex, 1)[0];
      this.scenes.splice(toIndex, 0, scene);

      // Update current scene index
      if (this.currentSceneIndex === fromIndex) {
        this.currentSceneIndex = toIndex;
      } else if (
        fromIndex < this.currentSceneIndex &&
        toIndex >= this.currentSceneIndex
      ) {
        this.currentSceneIndex--;
      } else if (
        fromIndex > this.currentSceneIndex &&
        toIndex <= this.currentSceneIndex
      ) {
        this.currentSceneIndex++;
      }

      return true;
    }
    return false;
  }

  /**
   * Get current scene
   */
  getCurrentScene() {
    return this.getScene(this.currentSceneIndex);
  }

  /**
   * Set current scene by index
   */
  setCurrentScene(index) {
    if (index >= 0 && index < this.scenes.length) {
      this.currentSceneIndex = index;
      return true;
    }
    return false;
  }

  /**
   * Get all scenes
   */
  getAllScenes() {
    return this.scenes;
  }

  /**
   * Get all scenes (alias for getAllScenes)
   */
  getScenes() {
    return this.scenes;
  }

  /**
   * Clear all scenes
   */
  clearScenes() {
    if (this.scenes.length > 0) {
      if (!confirm("Are you sure you want to clear all scenes?")) {
        return false;
      }
    }

    this.resetScenes();
    return true;
  }

  /**
   * Reset all scenes without confirmation (used by newProject, which
   * performs its own single confirmation before touching any state)
   */
  resetScenes() {
    this.scenes = [];
    this.currentSceneIndex = -1;
    this.editor.emit(EditorEvents.SCENE_CLEAR);
  }

  /**
   * Load scenes from data
   */
  loadScenes(scenesData) {
    this.scenes = scenesData || [];
    // Enforce unique scene IDs (imported data may contain duplicates)
    this.scenes.forEach((scene, index) => {
      if (!scene.id) {
        scene.id = sanitizeId(`scene-${Date.now()}_${index}`);
      }
      const isDuplicate = this.scenes.some(
        (other, otherIndex) => otherIndex !== index && other.id === scene.id
      );
      if (isDuplicate) {
        scene.id = this.ensureUniqueSceneId(scene.id);
      }
    });
    this.currentSceneIndex = this.scenes.length > 0 ? 0 : -1;
  }
}

export default SceneManagerEditor;
