/**
 * Data Transform Utilities
 * 
 * With the unified format, editor and library use the same structure:
 * - scenes: Array of scene objects with `panorama`
 * - hotspots: nested properties (action, appearance, tooltip)
 * 
 * These utilities handle building the tour config for the SWT library.
 */

/**
 * Build a complete tour configuration for the SWT library
 * Since unified format is used, this just wraps the scenes array with config
 * @param {Object} config - Config with initialSceneId, etc.
 * @param {Array} scenes - Array of scenes (already in unified format)
 * @returns {Object} Complete tour config
 */
export function buildTourConfig(config, scenes) {
  const sceneList = scenes || [];

  // Validate the initial-scene reference; fall back to the first scene
  let initialScene = config.initialSceneId;
  const initialSceneExists = initialScene && sceneList.some((s) => s.id === initialScene);
  if (!initialSceneExists) {
    if (initialScene) {
      console.warn(
        `Initial scene "${initialScene}" not found in scenes; falling back to first scene`
      );
    }
    initialScene = sceneList.length > 0 ? sceneList[0].id : '';
  }

  return {
    initialScene: initialScene,
    scenes: sceneList,
  };
}

/**
 * Build tour config for preview (sets initial scene to current scene)
 * @param {Object} currentScene - The scene to show initially
 * @param {Array} allScenes - All scenes for navigation support
 * @returns {Object} Complete tour config
 */
export function buildPreviewTourConfig(currentScene, allScenes) {
  return buildTourConfig(
    { initialSceneId: currentScene.id },
    allScenes
  );
}
