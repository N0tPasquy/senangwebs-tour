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

    // Image-based hotspots (photo, gazeImage) manage their own dedicated title element; suppress duplicate generic tooltip
    const isImageHotspot =
      hotspotData?.action?.type === 'photo' ||
      hotspotData?.action?.type === 'image' ||
      hotspotData?.action?.type === 'gazeImage' ||
      hotspotData?.type === 'photo' ||
      hotspotData?.type === 'image' ||
      hotspotData?.type === 'gazeImage';

    if (isImageHotspot) {
      if (this.tooltipEl) {
        this.tooltipEl.setAttribute('visible', 'false');
      }
      return;
    }

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
      
      // Parse scale factor (default 1)
      const rawScale = hotspotData.appearance?.scale;
      let scaleFactor = 1;
      if (typeof rawScale === 'number' && isFinite(rawScale)) {
        scaleFactor = rawScale;
      } else if (typeof rawScale === 'string') {
        const firstPart = parseFloat(rawScale.trim().split(/\s+/)[0]);
        if (isFinite(firstPart) && firstPart > 0) scaleFactor = firstPart;
      }

      // Scale the tooltip proportionally (bounded between 0.6x and 3.0x for legibility)
      const tooltipScale = Math.min(Math.max(scaleFactor * 0.9, 0.6), 3.0);
      this.tooltipEl.setAttribute('scale', `${tooltipScale} ${tooltipScale} ${tooltipScale}`);

      // Calculate half-height of the hotspot for exact positioning
      const isPhoto = hotspotData.action?.type === 'photo' || hotspotData.type === 'photo';
      let elementHalfHeight = 0.5;
      if (isPhoto) {
        const aspect = hotspotData.appearance?.aspectRatio || 1;
        elementHalfHeight = aspect >= 1 ? (1.5 / aspect) * 0.5 : 1.5 * 0.5;
      }

      // Position tooltip nicely above the top edge of the scaled hotspot
      const offsetY = (elementHalfHeight * scaleFactor) + (tooltipScale * 0.45);
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
      const isGazeImage = hotspot.action?.type === 'gazeImage' || hotspot.type === 'gazeImage';
      const isStaticPhoto = hotspot.action?.type === 'photo' || hotspot.action?.type === 'image' || hotspot.type === 'photo' || hotspot.type === 'image';
      const isPhoto = isStaticPhoto || isGazeImage;
      const icon = (isPhoto ? (hotspot.action?.url || hotspot.appearance?.icon) : hotspot.appearance?.icon) || this.defaultSettings.icon;
      const color = hotspot.appearance?.color || '#ffffff';
      
      if (!icon) continue;
      
      // Check if it's an image URL
      const isImageUrl = icon.startsWith('http') || icon.startsWith('data:') || icon.startsWith('/');
      
      // Use unique asset ID that includes scene load counter
      const assetId = `${this.currentAssetPrefix}-${index}`;
      
      if (isImageUrl) {
        // Preload as image asset
        try {
          const imgAsset = await this.assetManager.preloadImage(icon, assetId);
          if (isPhoto && imgAsset) {
            const nw = imgAsset.naturalWidth || imgAsset.width;
            const nh = imgAsset.naturalHeight || imgAsset.height;
            if (nw && nh && nh > 0) {
              hotspot.appearance = hotspot.appearance || {};
              if (!hotspot.appearance.aspectRatio) {
                hotspot.appearance.aspectRatio = nw / nh;
              }
            }
          }
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
    const isGaze = isGazeHotspot(hotspot, this.tour?.config);
    const isGazeImage = hotspot.action?.type === 'gazeImage' || hotspot.type === 'gazeImage';
    const isStaticPhoto = hotspot.action?.type === 'photo' || hotspot.action?.type === 'image' || hotspot.type === 'photo' || hotspot.type === 'image';
    const isPhoto = isStaticPhoto || isGazeImage;
    const isEditor = Boolean(this.tour?.config?.isEditor);

    const hotspotEl = document.createElement('a-entity');
    hotspotEl.classList.add('swt-hotspot');
    if (isGaze) {
      hotspotEl.classList.add('swt-gaze-hotspot');
    }
    if (isGazeImage) {
      hotspotEl.classList.add('swt-gaze-image-hotspot');
    }
    if (isStaticPhoto) {
      hotspotEl.classList.add('swt-photo-hotspot');
    }
    
    // Set position
    const pos = hotspot.position;
    hotspotEl.setAttribute('position', `${pos.x} ${pos.y} ${pos.z}`);

    // Get icon and color
    const icon = (isPhoto ? (hotspot.action?.url || hotspot.appearance?.icon) : hotspot.appearance?.icon) || this.defaultSettings.icon;
    const color = hotspot.appearance?.color || (isPhoto ? '#ffffff' : '#4CC3D9');
    
    // Check if we have a preloaded icon asset (either from URL or generated from icon name)
    // Use the unique asset prefix that includes scene load counter
    const assetId = `${this.currentAssetPrefix}-${index}`;
    const assetsEl = this.sceneEl.querySelector('a-assets');
    const assetEl = assetsEl ? assetsEl.querySelector(`#${assetId}`) : null;
    
    let visualEl;
    let titleWrap = null;
    
    // Check if icon asset was successfully loaded/generated
    if (icon) {
      visualEl = document.createElement('a-image');
      visualEl.setAttribute('src', assetEl ? `#${assetId}` : icon);
      // Billboards always face the camera; side: front and flat shader optimize GPU fill rate and prevent lag
      visualEl.setAttribute('material', 'side: front; transparent: true; alphaTest: 0.05; shader: flat');

      if (isPhoto) {
        // Compute proper width and height respecting original aspect ratio
        let aspect = hotspot.appearance?.aspectRatio;
        if (!aspect && assetEl) {
          const nw = assetEl.naturalWidth || assetEl.width;
          const nh = assetEl.naturalHeight || assetEl.height;
          if (nw && nh && nh > 0) {
            aspect = nw / nh;
            hotspot.appearance = hotspot.appearance || {};
            hotspot.appearance.aspectRatio = aspect;
          }
        }
        aspect = aspect || 1;

        let w = 1.5;
        let h = 1.5;
        if (aspect >= 1) {
          h = 1.5 / aspect;
        } else {
          w = 1.5 * aspect;
        }
        visualEl.setAttribute('width', w.toFixed(3));
        visualEl.setAttribute('height', h.toFixed(3));

        const rawScale = hotspot.appearance?.scale ?? this.defaultSettings.scale;
        let scaleFactor = 1.0;
        if (typeof rawScale === 'number' && isFinite(rawScale)) {
          scaleFactor = rawScale;
        } else if (typeof rawScale === 'string') {
          const p = parseFloat(rawScale.trim().split(/\s+/)[0]);
          if (isFinite(p) && p > 0) scaleFactor = p;
        }

        // Title above photo/image:
        // - For gazeImage: title is ALWAYS visible (visible="true")
        // - For staticPhoto: title appears ONLY on focus (visible="false" initially, shown on focus by swt-static-photo)
        // Position and scale account for the photo scale factor so title is never covered even at 2x+ scale
        const title = hotspot.tooltip?.text || hotspot.title || hotspot.name || '';
        if (title) {
          titleWrap = document.createElement('a-entity');
          titleWrap.setAttribute('id', `swt-photo-title-${index}`);
          const titleScale = Math.min(Math.max(scaleFactor * 0.85, 0.75), 2.5);
          titleWrap.setAttribute('scale', `${titleScale} ${titleScale} ${titleScale}`);
          const titleY = (h * 0.5 * scaleFactor) + (0.32 * titleScale);
          titleWrap.setAttribute('position', `0 ${titleY.toFixed(3)} 0.02`);
          titleWrap.setAttribute('swt-billboard', 'enabled: true');

          // gazeImage is ALWAYS visible; staticPhoto is visible ONLY on focus
          titleWrap.setAttribute('visible', isGazeImage ? 'true' : 'false');

          const titleBg = document.createElement('a-plane');
          titleBg.setAttribute('color', '#000000');
          titleBg.setAttribute('opacity', '0.75');
          const bgWidth = Math.max(1.2, Math.min(3.5, title.length * 0.12 + 0.4));
          titleBg.setAttribute('width', bgWidth.toFixed(2));
          titleBg.setAttribute('height', '0.42');
          titleBg.setAttribute('material', 'shader: flat; side: double; transparent: true');
          titleWrap.appendChild(titleBg);

          const titleText = document.createElement('a-text');
          titleText.setAttribute('value', title);
          titleText.setAttribute('align', 'center');
          titleText.setAttribute('color', '#ffffff');
          titleText.setAttribute('width', '2.8');
          titleText.setAttribute('position', '0 0 0.01');
          titleText.setAttribute('wrap-count', '24');
          titleWrap.appendChild(titleText);

          // Append to hotspotEl so title stays stably positioned above the hotspot
          hotspotEl.appendChild(titleWrap);
        }

        // Fallback: when texture loads asynchronously, re-apply natural aspect ratio if needed
        visualEl.addEventListener('materialtextureloaded', () => {
          const texture = visualEl.getObject3D('mesh')?.material?.map;
          if (texture && texture.image) {
            const nw = texture.image.naturalWidth || texture.image.width;
            const nh = texture.image.naturalHeight || texture.image.height;
            if (nw && nh && nh > 0) {
              const loadedAspect = nw / nh;
              let tw = 1.5;
              let th = 1.5;
              if (loadedAspect >= 1) {
                th = 1.5 / loadedAspect;
              } else {
                tw = 1.5 * loadedAspect;
              }
              visualEl.setAttribute('width', tw.toFixed(3));
              visualEl.setAttribute('height', th.toFixed(3));
              hotspot.appearance = hotspot.appearance || {};
              hotspot.appearance.aspectRatio = loadedAspect;

              if (titleWrap) {
                const titleScale = Math.min(Math.max(scaleFactor * 0.85, 0.75), 2.5);
                const updatedY = (th * 0.5 * scaleFactor) + (0.32 * titleScale);
                titleWrap.setAttribute('position', `0 ${updatedY.toFixed(3)} 0.02`);
                titleWrap.setAttribute('scale', `${titleScale} ${titleScale} ${titleScale}`);
              }
            }
          }
        });
      } else {
        visualEl.setAttribute('width', '1');
        visualEl.setAttribute('height', '1');
      }
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

    // Attach interaction components based on hotspot type
    if (isGaze) {
      visualEl.setAttribute('class', 'clickable');
      visualEl.setAttribute('swt-gaze-hotspot', {
        hotspotData: JSON.stringify(hotspot)
      });

      // Add distinctive outer gaze ring indicator around navigation hotspots (omit on image-based hotspots)
      if (!isPhoto) {
        const gazeRing = document.createElement('a-ring');
        gazeRing.setAttribute('id', `swt-gaze-ring-${index}`);
        gazeRing.setAttribute('radius-inner', '0.62');
        gazeRing.setAttribute('radius-outer', '0.72');
        gazeRing.setAttribute('scale', this.normalizeScale(hotspot.appearance?.scale ?? this.defaultSettings.scale));
        gazeRing.setAttribute('material', `color: ${color}; side: double; transparent: true; opacity: 0.85; shader: flat`);
        gazeRing.setAttribute('swt-billboard', 'enabled: true');
        hotspotEl.appendChild(gazeRing);
      }
    } else if (isStaticPhoto) {
      // Static photos: title appears on focus, and gaze focus opens 3D card
      visualEl.setAttribute('class', 'clickable');
      visualEl.setAttribute('swt-static-photo', {
        titleId: `swt-photo-title-${index}`,
        hotspotData: JSON.stringify(hotspot),
        isEditor: isEditor
      });
    } else if (isEditor) {
      visualEl.setAttribute('class', 'clickable');
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
      if (hotspot.object3D) {
        hotspot.object3D.traverse((child) => {
          if (child.geometry) child.geometry.dispose();
          if (child.material) {
            if (Array.isArray(child.material)) {
              child.material.forEach((m) => {
                if (m.map) m.map.dispose();
                m.dispose();
              });
            } else {
              if (child.material.map) child.material.map.dispose();
              child.material.dispose();
            }
          }
        });
      }
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
