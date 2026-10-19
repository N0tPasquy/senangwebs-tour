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
  let initialScene = config.initialSceneId || config.initialScene;
  const initialSceneExists = initialScene && sceneList.some((s) => s.id === initialScene);
  if (!initialSceneExists) {
    if (initialScene) {
      console.warn(
        `Initial scene "${initialScene}" not found in scenes; falling back to first scene`
      );
    }
    initialScene = sceneList.length > 0 ? sceneList[0].id : '';
  }

  const tourConfig = {
    initialScene: initialScene,
    scenes: sceneList,
  };

  if (config.title) {
    tourConfig.title = config.title;
  }
  if (config.description) {
    tourConfig.description = config.description;
  }
  if (config.audio && config.audio.url) {
    tourConfig.audio = {
      url: config.audio.url,
      volume: typeof config.audio.volume === 'number' ? config.audio.volume : 0.5,
      loop: config.audio.loop !== false,
    };
  }
  if (config.welcome && config.welcome.enabled !== false && (config.welcome.enabled || config.welcome.title || config.welcome.description)) {
    tourConfig.welcome = {
      enabled: config.welcome.enabled !== false,
      title: config.welcome.title || '',
      description: config.welcome.description || '',
      buttonText: config.welcome.buttonText || 'Start Tour',
    };
  }

  return tourConfig;
}

/**
 * Build tour config for preview (sets initial scene to current scene)
 * @param {Object} currentScene - The scene to show initially
 * @param {Array} allScenes - All scenes for navigation support
 * @param {Object} [extraConfig] - Optional extra config (audio, title, etc.)
 * @returns {Object} Complete tour config
 */
export function buildPreviewTourConfig(currentScene, allScenes, extraConfig = {}) {
  const config = buildTourConfig(
    { 
      initialSceneId: currentScene.id,
      title: extraConfig.title,
      description: extraConfig.description,
      audio: extraConfig.audio,
      welcome: extraConfig.welcome
    },
    allScenes
  );
  config.isEditor = true;
  return config;
}
