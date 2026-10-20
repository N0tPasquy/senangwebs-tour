/**
 * A-Frame components for Gaze Navigation hotspots and visual progress indicator
 */
import AFRAME from 'aframe';
import { StaticPhotoController } from '../StaticPhotoCard.js';
import { normalizeScale } from '../utils.js';

export { normalizeScale };

const THREE = (typeof AFRAME !== 'undefined' && AFRAME.THREE) || (typeof window !== 'undefined' && window.THREE);

if (typeof AFRAME !== 'undefined') {
  /**
   * Component for Gaze Navigation hotspots.
   * Emits swt-gaze-enter and swt-gaze-leave when the reticle gaze enters or exits.
   */
  AFRAME.registerComponent('swt-gaze-hotspot', {
    schema: {
      hotspotData: { type: 'string', default: '{}' }
    },

    init: function () {
      this.onClick = this.onClick.bind(this);
      this.onMouseEnter = this.onMouseEnter.bind(this);
      this.onMouseLeave = this.onMouseLeave.bind(this);
      this.onRaycasterIntersected = this.onRaycasterIntersected.bind(this);
      this.onRaycasterIntersectedCleared = this.onRaycasterIntersectedCleared.bind(this);
      this.isGazing = false;
    },

    play: function () {
      this.el.addEventListener('click', this.onClick);
      this.el.addEventListener('mouseenter', this.onMouseEnter);
      this.el.addEventListener('mouseleave', this.onMouseLeave);
      this.el.addEventListener('raycaster-intersected', this.onRaycasterIntersected);
      this.el.addEventListener('raycaster-intersected-cleared', this.onRaycasterIntersectedCleared);
    },

    pause: function () {
      this.el.removeEventListener('click', this.onClick);
      this.el.removeEventListener('mouseenter', this.onMouseEnter);
      this.el.removeEventListener('mouseleave', this.onMouseLeave);
      this.el.removeEventListener('raycaster-intersected', this.onRaycasterIntersected);
      this.el.removeEventListener('raycaster-intersected-cleared', this.onRaycasterIntersectedCleared);
      this.handleLeave();
    },

    remove: function () {
      this.handleLeave();
    },

    handleEnter: function () {
      if (this.isGazing) return;
      this.isGazing = true;

      const hotspotData = this.getHotspotData();
      const isGazeImage = hotspotData.action?.type === 'gazeImage' || hotspotData.type === 'gazeImage';

      // Show tooltip if exists (only for standard navigation icons, NOT for gazeImage which already has its own title above the image)
      if (hotspotData.tooltip && this.el.sceneEl && !isGazeImage) {
        this.el.sceneEl.emit('swt-hotspot-hover', {
          hotspotData: hotspotData,
          isHovering: true
        });
      }

      // Add visual hover feedback on hotspot itself (only for standard navigation icons; gazeImage has its continuous zoom)
      if (!isGazeImage) {
        this.el.setAttribute('scale', this.getScaledSize(1.15));
      }

      // Emit gaze enter for GazeManager
      if (this.el.sceneEl) {
        this.el.sceneEl.emit('swt-gaze-enter', {
          el: this.el,
          hotspotData: hotspotData
        });
      }
    },

    handleLeave: function () {
      if (!this.isGazing) return;
      this.isGazing = false;

      const hotspotData = this.getHotspotData();
      const isGazeImage = hotspotData.action?.type === 'gazeImage' || hotspotData.type === 'gazeImage';

      // Hide tooltip if exists (only for standard navigation icons)
      if (hotspotData.tooltip && this.el.sceneEl && !isGazeImage) {
        this.el.sceneEl.emit('swt-hotspot-hover', {
          hotspotData: hotspotData,
          isHovering: false
        });
      }

      // Reset scale
      this.el.setAttribute('scale', this.getOriginalScale());

      // Emit gaze leave for GazeManager
      if (this.el.sceneEl) {
        this.el.sceneEl.emit('swt-gaze-leave', {
          el: this.el,
          hotspotData: hotspotData
        });
      }
    },

    onClick: function (evt) {
      const hotspotData = this.getHotspotData();
      // Emit click for editor selection / inspection without navigating
      if (this.el.sceneEl) {
        this.el.sceneEl.emit('swt-hotspot-clicked', {
          hotspotData: hotspotData
        });
      }
    },

    onMouseEnter: function (evt) {
      // Gaze must originate from the camera/reticle cursor, not mouse cursor
      const cursorEl = evt.detail?.cursorEl;
      if (cursorEl && (cursorEl.id === 'swt-mouse-cursor' || cursorEl.getAttribute?.('cursor')?.rayOrigin === 'mouse')) {
        return;
      }
      this.handleEnter();
    },

    onMouseLeave: function (evt) {
      const cursorEl = evt.detail?.cursorEl;
      if (cursorEl && (cursorEl.id === 'swt-mouse-cursor' || cursorEl.getAttribute?.('cursor')?.rayOrigin === 'mouse')) {
        return;
      }
      this.handleLeave();
    },

    onRaycasterIntersected: function (evt) {
      // Gaze must originate from the camera/reticle cursor, not mouse cursor
      const raycasterEl = evt.detail?.el;
      if (raycasterEl && (raycasterEl.id === 'swt-mouse-cursor' || raycasterEl.getAttribute?.('cursor')?.rayOrigin === 'mouse')) {
        return;
      }
      this.handleEnter();
    },

    onRaycasterIntersectedCleared: function (evt) {
      const raycasterEl = evt.detail?.el;
      if (raycasterEl && (raycasterEl.id === 'swt-mouse-cursor' || raycasterEl.getAttribute?.('cursor')?.rayOrigin === 'mouse')) {
        return;
      }
      this.handleLeave();
    },

    getHotspotData: function () {
      try {
        return JSON.parse(this.data.hotspotData);
      } catch (e) {
        return {};
      }
    },

    getOriginalScale: function () {
      const hotspotData = this.getHotspotData();
      return normalizeScale(hotspotData.appearance?.scale);
    },

    getScaledSize: function (multiplier) {
      const scale = this.getOriginalScale();
      const parts = scale.split(' ').map(Number);
      return `${parts[0] * multiplier} ${parts[1] * multiplier} ${parts[2] * multiplier}`;
    }
  });

  /**
   * Component for static photos in 3D scene.
   * Hands-free VR navigation:
   * - Shows floating title and starts 2-second countdown on gaze focus
   * - Opens an enlarged 3D card in place of the original photo
   * - Card includes photo on left, title & description on right, and 'X' close button at top-right
   * - Focusing on 'X' for 2 seconds closes the card and restores original photo to its initial state
   */
  AFRAME.registerComponent('swt-static-photo', {
    schema: {
      titleId: { type: 'string', default: '' },
      hotspotData: { type: 'string', default: '{}' },
      isEditor: { type: 'boolean', default: false }
    },

    init: function () {
      let hotspotData = {};
      try {
        hotspotData = JSON.parse(this.data.hotspotData);
      } catch (e) {}

      this.controller = new StaticPhotoController(this.el, hotspotData, {
        titleId: this.data.titleId,
        isEditor: this.data.isEditor
      });

      this.onEnter = (evt) => {
        const cursorEl = evt?.detail?.cursorEl;
        if (cursorEl && (cursorEl.id === 'swt-mouse-cursor' || cursorEl.getAttribute?.('cursor')?.rayOrigin === 'mouse')) {
          return;
        }
        this.controller?.handlePhotoEnter();
      };

      this.onLeave = (evt) => {
        const cursorEl = evt?.detail?.cursorEl;
        if (cursorEl && (cursorEl.id === 'swt-mouse-cursor' || cursorEl.getAttribute?.('cursor')?.rayOrigin === 'mouse')) {
          return;
        }
        this.controller?.handlePhotoLeave();
      };

      this.onClick = () => {
        this.controller?.handlePhotoClick();
      };
    },

    play: function () {
      this.el.addEventListener('mouseenter', this.onEnter);
      this.el.addEventListener('mouseleave', this.onLeave);
      this.el.addEventListener('raycaster-intersected', this.onEnter);
      this.el.addEventListener('raycaster-intersected-cleared', this.onLeave);
      this.el.addEventListener('click', this.onClick);
    },

    pause: function () {
      this.el.removeEventListener('mouseenter', this.onEnter);
      this.el.removeEventListener('mouseleave', this.onLeave);
      this.el.removeEventListener('raycaster-intersected', this.onEnter);
      this.el.removeEventListener('raycaster-intersected-cleared', this.onLeave);
      this.el.removeEventListener('click', this.onClick);
      if (this.controller) {
        this.controller.handlePhotoLeave();
      }
    },

    remove: function () {
      if (this.controller) {
        this.controller.destroy();
        this.controller = null;
      }
    },

    tick: function () {
      this.controller?.tick();
    },

    getTitleEl: function () {
      return this.controller?.getTitleEl();
    },

    openCard: function () {
      this.controller?.openCard();
    },

    closeCard: function () {
      this.controller?.closeCard();
    }
  });

  /**
   * Component for the circular gaze progress indicator around the central reticle/cursor.
   */
  AFRAME.registerComponent('swt-gaze-progress', {
    schema: {
      innerRadius: { type: 'number', default: 0.034 },
      outerRadius: { type: 'number', default: 0.044 },
      color: { type: 'color', default: '#4CC3D9' }
    },

    init: function () {
      const threeObj = (AFRAME && AFRAME.THREE) || THREE;
      if (!threeObj) return;

      this.innerRadius = this.data.innerRadius;
      this.outerRadius = this.data.outerRadius;
      this.segments = 48;

      // Track mesh (subtle background ring)
      const trackGeom = new threeObj.RingGeometry(this.innerRadius, this.outerRadius, this.segments);
      const trackMat = new threeObj.MeshBasicMaterial({
        color: new threeObj.Color('#ffffff'),
        side: threeObj.DoubleSide,
        transparent: true,
        opacity: 0.25,
        depthTest: false
      });
      this.trackMesh = new threeObj.Mesh(trackGeom, trackMat);
      this.trackMesh.visible = false;
      this.trackMesh.renderOrder = 9998;
      this.el.object3D.add(this.trackMesh);

      // Active progress mesh
      const progressMat = new threeObj.MeshBasicMaterial({
        color: new threeObj.Color(this.data.color),
        side: threeObj.DoubleSide,
        transparent: true,
        opacity: 0.95,
        depthTest: false
      });
      this.progressMesh = new threeObj.Mesh(new threeObj.BufferGeometry(), progressMat);
      this.progressMesh.visible = false;
      this.progressMesh.renderOrder = 9999;
      this.el.object3D.add(this.progressMesh);
    },

    /**
     * Update the progress ring (ratio between 0 and 1)
     * @param {number} ratio
     * @param {string} [color]
     */
    setProgress: function (ratio, color) {
      const threeObj = (AFRAME && AFRAME.THREE) || THREE;
      if (!threeObj) return;

      if (ratio <= 0) {
        if (this.trackMesh) this.trackMesh.visible = false;
        if (this.progressMesh) this.progressMesh.visible = false;
        return;
      }

      if (this.trackMesh) this.trackMesh.visible = true;
      if (this.progressMesh) this.progressMesh.visible = true;

      if (color && this.progressMesh && this.progressMesh.material) {
        this.progressMesh.material.color.set(color);
      }

      if (this.progressMesh) {
        if (this.progressMesh.geometry) {
          this.progressMesh.geometry.dispose();
        }
        const clamped = Math.max(0.001, Math.min(1, ratio));
        const thetaLength = clamped * Math.PI * 2;
        // Start from top (12 o'clock: Math.PI / 2) and advance clockwise (-thetaLength)
        this.progressMesh.geometry = new threeObj.RingGeometry(
          this.innerRadius,
          this.outerRadius,
          this.segments,
          1,
          Math.PI / 2,
          -thetaLength
        );
      }
    },

    reset: function () {
      this.setProgress(0);
    },

    remove: function () {
      if (this.progressMesh) {
        if (this.progressMesh.geometry) this.progressMesh.geometry.dispose();
        if (this.progressMesh.material) this.progressMesh.material.dispose();
        this.el.object3D.remove(this.progressMesh);
      }
      if (this.trackMesh) {
        if (this.trackMesh.geometry) this.trackMesh.geometry.dispose();
        if (this.trackMesh.material) this.trackMesh.material.dispose();
        this.el.object3D.remove(this.trackMesh);
      }
    }
  });
}

export default 'swt-gaze-hotspot';
