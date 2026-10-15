/**
 * A-Frame component that listens for clicks on hotspots and emits a custom event
 */
if (typeof AFRAME !== 'undefined') {
  AFRAME.registerComponent('swt-hotspot-listener', {
    schema: {
      hotspotData: { type: 'string', default: '{}' }
    },

    init: function () {
      this.onClick = this.onClick.bind(this);
      this.onMouseDown = this.onMouseDown.bind(this);
      this.onMouseEnter = this.onMouseEnter.bind(this);
      this.onMouseLeave = this.onMouseLeave.bind(this);
      this.mouseDownPos = null;
    },

    play: function () {
      this.el.addEventListener('mousedown', this.onMouseDown);
      this.el.addEventListener('click', this.onClick);
      this.el.addEventListener('mouseenter', this.onMouseEnter);
      this.el.addEventListener('mouseleave', this.onMouseLeave);
    },

    pause: function () {
      this.el.removeEventListener('mousedown', this.onMouseDown);
      this.el.removeEventListener('click', this.onClick);
      this.el.removeEventListener('mouseenter', this.onMouseEnter);
      this.el.removeEventListener('mouseleave', this.onMouseLeave);
    },

    onMouseDown: function (evt) {
      const e = evt.detail?.cursorElEvent || evt;
      if (e && e.clientX !== undefined) {
        this.mouseDownPos = { x: e.clientX, y: e.clientY };
      }
    },

    onClick: function (evt) {
      // Discard clicks that were actually camera drags
      if (this.mouseDownPos) {
        const e = evt.detail?.cursorElEvent || evt;
        if (e && e.clientX !== undefined) {
          const dx = Math.abs(e.clientX - this.mouseDownPos.x);
          const dy = Math.abs(e.clientY - this.mouseDownPos.y);
          this.mouseDownPos = null;
          if (dx > 8 || dy > 8) {
            return; // User was dragging the camera, not clicking
          }
        }
        this.mouseDownPos = null;
      }

      const hotspotData = JSON.parse(this.data.hotspotData);
      
      // Emit custom event that the Tour class can listen to
      this.el.sceneEl.emit('swt-hotspot-clicked', {
        hotspotData: hotspotData
      });
    },

    onMouseEnter: function (evt) {
      const hotspotData = JSON.parse(this.data.hotspotData);
      
      // Show tooltip if exists
      if (hotspotData.tooltip) {
        this.el.sceneEl.emit('swt-hotspot-hover', {
          hotspotData: hotspotData,
          isHovering: true
        });
      }

      // Add visual feedback
      this.el.setAttribute('scale', this.getScaledSize(1.2));
    },

    onMouseLeave: function (evt) {
      const hotspotData = JSON.parse(this.data.hotspotData);
      
      // Hide tooltip
      if (hotspotData.tooltip) {
        this.el.sceneEl.emit('swt-hotspot-hover', {
          hotspotData: hotspotData,
          isHovering: false
        });
      }

      // Reset scale
      this.el.setAttribute('scale', this.getOriginalScale());
    },

    getOriginalScale: function () {
      const hotspotData = JSON.parse(this.data.hotspotData);
      return normalizeScale(hotspotData.appearance?.scale);
    },

    getScaledSize: function (multiplier) {
      const scale = this.getOriginalScale();
      const parts = scale.split(' ').map(Number);
      return `${parts[0] * multiplier} ${parts[1] * multiplier} ${parts[2] * multiplier}`;
    }
  });

  /**
   * Normalize a scale value to the "x y z" string form.
   * Accepts numbers (1.5 -> "1.5 1.5 1.5"), single-component strings,
   * and full "x y z" vectors. Falls back to "1 1 1" for invalid input.
   */
  function normalizeScale(value) {
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
   * Billboard component - Makes an entity always face the camera
   */
  AFRAME.registerComponent('swt-billboard', {
    schema: {
      enabled: { type: 'boolean', default: true }
    },

    init: function () {
      this.camera = null;
    },

    tick: function () {
      if (!this.data.enabled) return;

      // Find camera if not cached
      if (!this.camera) {
        this.camera = this.el.sceneEl.camera;
        if (!this.camera) return;
      }

      // Get camera world position
      const cameraPosition = new THREE.Vector3();
      this.camera.getWorldPosition(cameraPosition);

      // Get this element's world position
      const elementPosition = new THREE.Vector3();
      this.el.object3D.getWorldPosition(elementPosition);

      // Make the element look at the camera
      this.el.object3D.lookAt(cameraPosition);
    }
  });
}

export default 'swt-hotspot-listener';
