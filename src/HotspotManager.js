import { isGazeHotspot } from './GazeManager.js';

export class HotspotManager {
  constructor(sceneEl, assetManager, defaultHotspotSettings = {}, iconRenderer = null) {
    this.sceneEl = sceneEl;
    this.assetManager = assetManager;
    this.defaultSettings = defaultHotspotSettings;
    this.iconRenderer = iconRenderer;
    this.activeHotspots = [];
    this.tooltipEl = null;
    this.tooltipCreated = false;
    this.iconDataUrls = new Map(); // Cache for generated icon data URLs
    this.sceneLoadCounter = 0; // Unique counter to prevent asset ID collisions between scene loads
    this.currentAssetPrefix = ''; // Current asset ID prefix for this scene load
    
    // Listen for hover events
    this.boundHandleHotspotHover = this.handleHotspotHover.bind(this);
    this.sceneEl.addEventListener('swt-hotspot-hover', this.boundHandleHotspotHover);
  }

  /**
   * Create a tooltip element for displaying hotspot information
   */
  createTooltip() {
    if (this.tooltipCreated) {
      return;
    }

    this.tooltipEl = document.createElement('a-entity');
    this.tooltipEl.setAttribute('id', 'swt-tooltip');
    this.tooltipEl.setAttribute('visible', 'false');
    
    // Text element
    const textEl = document.createElement('a-text');
    textEl.setAttribute('value', '');
    textEl.setAttribute('align', 'center');
    textEl.setAttribute('color', '#FFFFFF');
    textEl.setAttribute('width', '2');
    textEl.setAttribute('wrap-count', '20');
    this.tooltipEl.appendChild(textEl);
    
    // Background plane
    const bgEl = document.createElement('a-plane');
    bgEl.setAttribute('color', '#000000');
    bgEl.setAttribute('opacity', '0.7');
    bgEl.setAttribute('width', '2');
    bgEl.setAttribute('height', '0.5');
    bgEl.setAttribute('position', '0 0 -0.01');
    this.tooltipEl.appendChild(bgEl);
    
    this.sceneEl.appendChild(this.tooltipEl);
    this.tooltipCreated = true;
  }

  /**
   * Handle hotspot hover events to show/hide tooltip
   * @param {CustomEvent} evt - DOM event; payload is on evt.detail
   */
  handleHotspotHover(evt) {
    const detail = evt && evt.detail ? evt.detail : {};
    const hotspotData = detail.hotspotData;

    if (detail.isHovering && hotspotData && hotspotData.tooltip) {
      if (!this.tooltipEl) {
        this.createTooltip();
      }
      if (!this.tooltipEl) {
        return;
      }

      const text = hotspotData.tooltip.text;
      const position = hotspotData.position;
      
      // Update tooltip text
      const textEl = this.tooltipEl.querySelector('a-text');
      textEl.setAttribute('value', text);
      
      // Position tooltip above the hotspot
      const offsetY = 1.5;
      this.tooltipEl.setAttribute('position', `${position.x} ${position.y + offsetY} ${position.z}`);
      this.tooltipEl.setAttribute('visible', 'true');
      
      // Make tooltip face the camera (using billboard component)
      if (!this.tooltipEl.hasAttribute('swt-billboard')) {
        this.tooltipEl.setAttribute('swt-billboard', 'enabled: true');
      }
    } else {
      if (this.tooltipEl) {
        this.tooltipEl.setAttribute('visible', 'false');
      }
    }
  }

  /**
   * Create hotspots for a scene
   * @param {Array} hotspots - Array of hotspot objects
   * @returns {Promise} - Resolves when all hotspots are created
   */
  async createHotspots(hotspots = []) {
    // Create tooltip if not already created
    if (!this.tooltipCreated) {
      this.createTooltip();
    }

    // Increment scene load counter to ensure unique asset IDs for this scene load
    // This prevents A-Frame/THREE.js texture caching from reusing old icons
    this.sceneLoadCounter++;
    this.currentAssetPrefix = `hotspot-icon-${this.sceneLoadCounter}`;

    // Clear previous icon data URLs cache
    this.iconDataUrls.clear();

    // Process all hotspot icons SEQUENTIALLY to avoid race condition
    // (IconRenderer uses a shared renderContainer that would be corrupted by parallel generation)
    for (let index = 0; index < hotspots.length; index++) {
      const hotspot = hotspots[index];
      const icon = hotspot.appearance?.icon || this.defaultSettings.icon;
      const color = hotspot.appearance?.color || '#ffffff';
      
      if (!icon) continue;
      
      // Check if it's an image URL
      const isImageUrl = icon.startsWith('http') || icon.startsWith('data:') || icon.startsWith('/');
      
      // Use unique asset ID that includes scene load counter
      const assetId = `${this.currentAssetPrefix}-${index}`;
      
      if (isImageUrl) {
        // Preload as image asset
        try {
          await this.assetManager.preloadImage(icon, assetId);
        } catch (err) {
          console.warn(`Failed to load icon for hotspot ${index}, will use color instead`);
        }
      } else if (this.iconRenderer) {
        // Generate icon data URL from SenangStart icon name
        try {
          const dataUrl = await this.iconRenderer.generateIconDataUrl(icon, color, 128);
          if (dataUrl) {
            this.iconDataUrls.set(index, dataUrl);
            // Preload the generated data URL as an asset
            await this.assetManager.preloadImage(dataUrl, assetId);
          }
        } catch (err) {
          console.warn(`Failed to generate icon for hotspot ${index}:`, err);
        }
      }
    }

    // Then create the hotspot entities
    hotspots.forEach((hotspot, index) => {
      this.createHotspot(hotspot, index);
    });
  }

  /**
   * Create a single hotspot entity
   * @param {Object} hotspot - Hotspot configuration
   * @param {number} index - Hotspot index
   */
  createHotspot(hotspot, index) {
    const isGaze = isGazeHotspot(hotspot);
    const hotspotEl = document.createElement('a-entity');
    hotspotEl.classList.add('swt-hotspot');
    if (isGaze) {
      hotspotEl.classList.add('swt-gaze-hotspot');
    }
    
    // Set position
    const pos = hotspot.position;
    hotspotEl.setAttribute('position', `${pos.x} ${pos.y} ${pos.z}`);

    // Get icon and color
    const icon = hotspot.appearance?.icon || this.defaultSettings.icon;
    const color = hotspot.appearance?.color || '#4CC3D9';
    
    // Check if we have a preloaded icon asset (either from URL or generated from icon name)
    // Use the unique asset prefix that includes scene load counter
    const assetId = `${this.currentAssetPrefix}-${index}`;
    const assetsEl = this.sceneEl.querySelector('a-assets');
    const assetEl = assetsEl ? assetsEl.querySelector(`#${assetId}`) : null;
    
    let visualEl;
    
    // Check if icon asset was successfully loaded/generated
    if (icon && assetEl) {
      visualEl = document.createElement('a-image');
      visualEl.setAttribute('src', `#${assetId}`);
      // Make images double-sided
      visualEl.setAttribute('material', 'side: double; transparent: true; alphaTest: 0.1');
    } else {
      // Fallback to a colored plane
      visualEl = document.createElement('a-plane');
      visualEl.setAttribute('color', color);
      visualEl.setAttribute('width', '1');
      visualEl.setAttribute('height', '1');
      // Make plane double-sided
      visualEl.setAttribute('material', 'side', 'double');
    }

    // Set scale (normalizes numbers, single values, and "x y z" vectors)
    visualEl.setAttribute('scale', this.normalizeScale(hotspot.appearance?.scale ?? this.defaultSettings.scale));

    // Make it always face the camera (billboard effect)
    visualEl.setAttribute('swt-billboard', 'enabled: true');

    // Add cursor interaction
    visualEl.setAttribute('class', 'clickable');

    // Attach appropriate component based on hotspot type
    if (isGaze) {
      visualEl.setAttribute('swt-gaze-hotspot', {
        hotspotData: JSON.stringify(hotspot)
      });

      // Add distinctive outer gaze ring indicator around the hotspot
      const gazeRing = document.createElement('a-ring');
      gazeRing.setAttribute('id', `swt-gaze-ring-${index}`);
      gazeRing.setAttribute('radius-inner', '0.62');
      gazeRing.setAttribute('radius-outer', '0.72');
      gazeRing.setAttribute('material', `color: ${color}; side: double; transparent: true; opacity: 0.85; shader: flat`);
      gazeRing.setAttribute('swt-billboard', 'enabled: true');
      hotspotEl.appendChild(gazeRing);
    } else {
      visualEl.setAttribute('swt-hotspot-listener', {
        hotspotData: JSON.stringify(hotspot)
      });
    }

    hotspotEl.appendChild(visualEl);
    this.sceneEl.appendChild(hotspotEl);
    this.activeHotspots.push(hotspotEl);
  }

  /**
   * Normalize a scale value to the "x y z" string form.
   * Accepts numbers, single-component strings, and full "x y z" vectors.
   * Must stay in sync with the normalization in swt-hotspot-listener.
   * @param {number|string} value
   * @returns {string}
   */
  normalizeScale(value) {
    if (value === undefined || value === null || value === '') {
      return '1 1 1';
    }
    if (typeof value === 'number' && isFinite(value)) {
      return `${value} ${value} ${value}`;
    }
    if (typeof value === 'string') {
      const parts = value.trim().split(/\s+/).map(Number);
      if (parts.length >= 1 && parts.every((n) => isFinite(n) && n > 0)) {
        const [x, y = x, z = x] = parts;
        return `${x} ${y} ${z}`;
      }
    }
    return '1 1 1';
  }

  /**
   * Remove all active hotspots from the scene
   */
  removeAllHotspots() {
    // Remove hotspot icon assets from a-assets to prevent icon mixup on scene navigation
    this.removeHotspotIconAssets();
    
    this.activeHotspots.forEach(hotspot => {
      if (hotspot.parentNode) {
        hotspot.parentNode.removeChild(hotspot);
      }
    });
    this.activeHotspots = [];
    
    // Clear icon data URLs cache
    this.iconDataUrls.clear();
    
    // Hide tooltip
    if (this.tooltipEl) {
      this.tooltipEl.setAttribute('visible', 'false');
    }
  }

  /**
   * Remove all hotspot icon assets from a-assets element
   * This prevents icon mixup when navigating between scenes
   */
  removeHotspotIconAssets() {
    const assetsEl = this.sceneEl.querySelector('a-assets');
    if (!assetsEl) return;
    
    // Find and remove all assets with IDs matching hotspot-icon-* pattern
    const iconAssets = assetsEl.querySelectorAll('[id^="hotspot-icon-"]');
    iconAssets.forEach(asset => {
      if (asset.parentNode) {
        asset.parentNode.removeChild(asset);
      }
    });
    
    // Also clear the asset manager's loaded assets for hotspot icons
    if (this.assetManager && this.assetManager.loadedAssets) {
      const keysToDelete = [];
      this.assetManager.loadedAssets.forEach((value, key) => {
        if (key.startsWith('hotspot-icon-')) {
          keysToDelete.push(key);
        }
      });
      keysToDelete.forEach(key => this.assetManager.loadedAssets.delete(key));
    }
  }

  /**
   * Clean up the hotspot manager
   */
  destroy() {
    this.sceneEl.removeEventListener('swt-hotspot-hover', this.boundHandleHotspotHover);
    this.removeAllHotspots();
    if (this.tooltipEl && this.tooltipEl.parentNode) {
      this.tooltipEl.parentNode.removeChild(this.tooltipEl);
    }
  }
}
