/**
 * StaticPhotoCard.js
 * 
 * Implements the 3D in-scene card view for static photo hotspots.
 * Designed for VR headsets without touch/mouse:
 * - When gazing at the static photo for 2 seconds (or clicking), opens an enlarged 3D card in place of the photo.
 * - Card structure:
 *   |-----------------------------X
 *   |               | Photo title |
 *   |Original photo |             |
 *   |               | Description |
 *   |-----------------------------|
 * - Top-right 'X' icon: closes the card and restores the original photo if gaze focus remains on 'X' for 2 seconds (or click).
 * - Looking away before 2 seconds cancels the countdown.
 */

import { normalizeScale, requestAnimFrame, cancelAnimFrame } from './utils.js';

export { normalizeScale };

const getNow = () =>
  (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());

/**
 * Forces cursor raycasters in the scene to re-evaluate clickable targets
 */
export function refreshRaycasters(sceneEl) {
  if (!sceneEl || !sceneEl.querySelectorAll) return;
  const cursors = sceneEl.querySelectorAll('[raycaster]');
  cursors.forEach((c) => {
    try {
      if (c.components && c.components.raycaster && typeof c.components.raycaster.refreshObjects === 'function') {
        c.components.raycaster.refreshObjects();
      }
    } catch (e) {}
  });
}

/**
 * Controller managing the interactive 3D card for a static photo hotspot
 */
export class StaticPhotoController {
  /**
   * @param {HTMLElement} visualEl - Original 3D photo element (a-image)
   * @param {Object} hotspotData - Hotspot configuration data
   * @param {Object} [options]
   */
  constructor(visualEl, hotspotData = {}, options = {}) {
    this.visualEl = visualEl;
    this.hotspotData = hotspotData;
    this.titleId = options.titleId || '';
    this.isEditor = Boolean(options.isEditor);
    this.openDuration = options.openDuration ?? 2000;
    this.closeDuration = options.closeDuration ?? 2000;

    this.isCardOpen = false;
    this.isPhotoFocused = false;
    this.isCloseFocused = false;

    this.cardEl = null;
    this.closeBtnEl = null;
    this.closeBgEl = null;
    this.titleEl = null;

    this.openAnimId = null;
    this.closeAnimId = null;
    this.closeTimeoutId = null;
    this.openTimeoutId = null;
    this.openStartTime = 0;
    this.closeStartTime = 0;
  }

  /**
   * Resolves floating title entity above the original photo
   */
  getTitleEl() {
    if (!this.titleEl && this.titleId) {
      const parent = this.visualEl?.parentNode;
      const scene = this.visualEl?.sceneEl;
      this.titleEl =
        (parent && parent.querySelector && parent.querySelector(`#${this.titleId}`)) ||
        (scene && scene.querySelector && scene.querySelector(`#${this.titleId}`)) ||
        (typeof document !== 'undefined' && document.getElementById && document.getElementById(this.titleId));
    }
    return this.titleEl;
  }

  /**
   * Updates central reticle circular progress indicator if present
   */
  updateProgressIndicator(ratio, color) {
    const sceneEl = this.visualEl?.sceneEl;
    if (!sceneEl || !sceneEl.querySelector) return;
    const progressEl = sceneEl.querySelector('#swt-gaze-progress-indicator');
    if (progressEl && progressEl.components && progressEl.components['swt-gaze-progress']) {
      progressEl.components['swt-gaze-progress'].setProgress(ratio, color);
    }
  }

  /**
   * Builds the 3D card DOM element
   */
  createCard() {
    const imageUrl =
      this.hotspotData.action?.url ||
      this.hotspotData.appearance?.icon ||
      (this.visualEl && this.visualEl.getAttribute && this.visualEl.getAttribute('src')) ||
      '';

    const title =
      this.hotspotData.tooltip?.text ||
      this.hotspotData.action?.title ||
      this.hotspotData.title ||
      this.hotspotData.name ||
      '';

    const description =
      this.hotspotData.tooltip?.description ||
      this.hotspotData.action?.description ||
      this.hotspotData.description ||
      '';

    let aspect = this.hotspotData.appearance?.aspectRatio || 1;
    if (!this.hotspotData.appearance?.aspectRatio && this.visualEl && this.visualEl.getAttribute) {
      const w = parseFloat(this.visualEl.getAttribute('width'));
      const h = parseFloat(this.visualEl.getAttribute('height'));
      if (w && h && h > 0) aspect = w / h;
    }

    const card = document.createElement('a-entity');
    card.setAttribute('class', 'swt-photo-card');
    card.setAttribute('swt-billboard', 'enabled: true');
    card.setAttribute('position', '0 0 0.05');

    // Normalize card scale to 1 1 1 so the modal card is always displayed at optimal, prominent VR size
    card.setAttribute('scale', '1 1 1');

    // Card dimensions: 7.8m width x 4.6m height for expansive, immersive VR landscape viewing
    const cardW = 7.8;
    const cardH = 4.6;

    // Card border plane for polished outline
    const border = document.createElement('a-plane');
    border.setAttribute('class', 'swt-photo-card-border');
    border.setAttribute('width', (cardW + 0.08).toFixed(2));
    border.setAttribute('height', (cardH + 0.08).toFixed(2));
    border.setAttribute('position', '0 0 -0.005');
    border.setAttribute('color', '#334155');
    border.setAttribute('material', 'shader: flat; side: double; transparent: true');
    card.appendChild(border);

    // Card background plane
    const bg = document.createElement('a-plane');
    bg.setAttribute('class', 'swt-photo-card-bg');
    bg.setAttribute('width', cardW.toFixed(2));
    bg.setAttribute('height', cardH.toFixed(2));
    bg.setAttribute('color', '#0f172a');
    bg.setAttribute('opacity', '0.94');
    bg.setAttribute('material', 'shader: flat; side: double; transparent: true');
    card.appendChild(bg);

    // Vertical divider line between photo and information
    const divider = document.createElement('a-plane');
    divider.setAttribute('class', 'swt-photo-card-divider');
    divider.setAttribute('width', '0.02');
    divider.setAttribute('height', (cardH - 0.4).toFixed(2));
    divider.setAttribute('position', '-0.1 0 0.01');
    divider.setAttribute('color', '#334155');
    divider.setAttribute('material', 'shader: flat; side: double; transparent: true');
    card.appendChild(divider);

    // Left Column: Original photo, enlarged preserving aspect ratio (up to 3.4m wide x 4.0m high)
    let imgW = 3.4;
    let imgH = 3.4 / aspect;
    if (imgH > 4.0) {
      imgH = 4.0;
      imgW = 4.0 * aspect;
    }
    if (imgW > 3.4) {
      imgW = 3.4;
      imgH = 3.4 / aspect;
    }
    const img = document.createElement('a-image');
    img.setAttribute('class', 'swt-photo-card-img');
    img.setAttribute('src', imageUrl);
    img.setAttribute('width', imgW.toFixed(3));
    img.setAttribute('height', imgH.toFixed(3));
    img.setAttribute('position', '-2.0 0 0.02');
    img.setAttribute('material', 'shader: flat; side: front; transparent: true');
    card.appendChild(img);

    // Right Column Top: "Photo title"
    if (title) {
      const titleEl = document.createElement('a-text');
      titleEl.setAttribute('class', 'swt-photo-card-title');
      titleEl.setAttribute('value', title);
      titleEl.setAttribute('align', 'left');
      titleEl.setAttribute('anchor', 'left');
      titleEl.setAttribute('baseline', 'top');
      titleEl.setAttribute('position', '0.2 1.85 0.02');
      titleEl.setAttribute('width', '2.95');
      titleEl.setAttribute('wrap-count', '22');
      titleEl.setAttribute('color', '#ffffff');
      card.appendChild(titleEl);
    }

    // Right Column: "Description" (calibrated font size & wrap-count to cleanly fit 100+ words without overflow)
    if (description) {
      let descY = 1.45;
      if (!title) {
        descY = 1.85;
      } else if (title.length > 45) {
        descY = 1.15;
      } else if (title.length > 22) {
        descY = 1.30;
      }

      // Font size multiplier from editor slider (default 1.0)
      const rawDescFont =
        this.hotspotData.appearance?.descFontSize ??
        this.hotspotData.action?.descFontSize ??
        this.hotspotData.tooltip?.descFontSize ??
        this.hotspotData.descFontSize ??
        1.0;
      const descFontScale =
        typeof rawDescFont === 'number' && isFinite(rawDescFont)
          ? Math.min(3.0, Math.max(0.4, rawDescFont))
          : Math.min(3.0, Math.max(0.4, parseFloat(rawDescFont) || 1.0));

      const baseWrapCount = 46;
      const wrapCount = Math.max(16, Math.min(90, Math.round(baseWrapCount / descFontScale)));

      const descEl = document.createElement('a-text');
      descEl.setAttribute('class', 'swt-photo-card-desc');
      descEl.setAttribute('value', description);
      descEl.setAttribute('align', 'left');
      descEl.setAttribute('anchor', 'left');
      descEl.setAttribute('baseline', 'top');
      descEl.setAttribute('position', `0.2 ${descY.toFixed(2)} 0.02`);
      descEl.setAttribute('width', '3.45');
      descEl.setAttribute('wrap-count', String(wrapCount));
      descEl.setAttribute('color', '#cbd5e1');
      card.appendChild(descEl);
    }

    // Top Right: 'X' close button as an a-circle with geometry, mesh, and .clickable
    const closeBtn = document.createElement('a-circle');
    closeBtn.setAttribute('class', 'clickable swt-photo-card-close');
    closeBtn.setAttribute('position', '3.45 1.85 0.03');
    closeBtn.setAttribute('radius', '0.28');
    closeBtn.setAttribute('color', '#334155');
    closeBtn.setAttribute('material', 'shader: flat; side: double; transparent: true');

    const closeText = document.createElement('a-text');
    closeText.setAttribute('class', 'swt-photo-card-close-icon');
    closeText.setAttribute('value', 'X');
    closeText.setAttribute('align', 'center');
    closeText.setAttribute('position', '0 0 0.01');
    closeText.setAttribute('width', '2.6');
    closeText.setAttribute('color', '#ffffff');
    closeBtn.appendChild(closeText);

    card.appendChild(closeBtn);
    this.closeBtnEl = closeBtn;
    this.closeBgEl = closeBtn;

    this.setupCloseButtonListeners(closeBtn);

    return card;
  }

  /**
   * Sets up focus and click listeners on the card's 'X' close button
   */
  setupCloseButtonListeners(closeBtn) {
    const onEnter = (evt) => {
      const cursorEl = evt?.detail?.cursorEl || evt?.detail?.el;
      if (cursorEl && (cursorEl.id === 'swt-mouse-cursor' || cursorEl.getAttribute?.('cursor')?.rayOrigin === 'mouse')) {
        return;
      }
      this.handleCloseEnter();
    };

    const onLeave = (evt) => {
      const cursorEl = evt?.detail?.cursorEl || evt?.detail?.el;
      if (cursorEl && (cursorEl.id === 'swt-mouse-cursor' || cursorEl.getAttribute?.('cursor')?.rayOrigin === 'mouse')) {
        return;
      }
      this.handleCloseLeave();
    };

    const onClick = () => {
      this.handleCloseClick();
    };

    closeBtn.addEventListener('mouseenter', onEnter);
    closeBtn.addEventListener('mouseleave', onLeave);
    closeBtn.addEventListener('raycaster-intersected', onEnter);
    closeBtn.addEventListener('raycaster-intersected-cleared', onLeave);
    closeBtn.addEventListener('click', onClick);

    this._closeListeners = { onEnter, onLeave, onClick };
  }

  /**
   * Focus entered the 'X' close button -> starts 2000ms countdown
   */
  handleCloseEnter() {
    if (this.isCloseFocused) return;
    this.isCloseFocused = true;
    this.closeStartTime = getNow();

    if (this.closeBgEl) {
      this.closeBgEl.setAttribute('color', '#ef4444');
    }
    if (this.closeBtnEl) {
      this.closeBtnEl.setAttribute('scale', '1.2 1.2 1.2');
    }

    // Fail-safe setTimeout ensures close executes after duration even if frame callbacks are delayed
    if (this.closeTimeoutId) {
      clearTimeout(this.closeTimeoutId);
    }
    this.closeTimeoutId = setTimeout(() => {
      if (this.isCloseFocused && this.isCardOpen) {
        this.cancelCloseCountdown();
        this.closeCard();
      }
    }, this.closeDuration);

    const tick = () => {
      if (!this.isCloseFocused || !this.isCardOpen) {
        this.cancelCloseCountdown();
        return;
      }

      const elapsed = getNow() - this.closeStartTime;
      const progress = Math.min(1, elapsed / this.closeDuration);

      this.updateProgressIndicator(progress, '#ef4444');

      if (progress >= 1) {
        this.cancelCloseCountdown();
        this.closeCard();
        return;
      }

      this.closeAnimId = requestAnimFrame(tick);
    };

    this.closeAnimId = requestAnimFrame(tick);
  }

  /**
   * Focus left the 'X' close button -> cancels countdown immediately
   */
  handleCloseLeave() {
    if (!this.isCloseFocused) return;
    this.cancelCloseCountdown();
  }

  /**
   * Cancels the active close countdown
   */
  cancelCloseCountdown() {
    this.isCloseFocused = false;
    if (this.closeAnimId) {
      cancelAnimFrame(this.closeAnimId);
      this.closeAnimId = null;
    }
    if (this.closeTimeoutId) {
      clearTimeout(this.closeTimeoutId);
      this.closeTimeoutId = null;
    }
    if (this.closeBgEl) {
      this.closeBgEl.setAttribute('color', '#334155');
    }
    if (this.closeBtnEl) {
      this.closeBtnEl.setAttribute('scale', '1 1 1');
    }
    this.updateProgressIndicator(0);
  }

  /**
   * Click on 'X' close button -> closes immediately
   */
  handleCloseClick() {
    this.cancelCloseCountdown();
    this.closeCard();
  }

  /**
   * Focus entered original photo -> shows title and starts 2000ms open countdown
   */
  handlePhotoEnter() {
    if (this.isCardOpen) return;
    if (this.isPhotoFocused) return;
    this.isPhotoFocused = true;

    const title = this.getTitleEl();
    if (title) {
      title.setAttribute('visible', 'true');
    }

    if (this.isEditor) return;

    this.startOpenCountdown();
  }

  /**
   * Focus left original photo -> hides title and cancels open countdown
   */
  handlePhotoLeave() {
    if (!this.isPhotoFocused) return;
    this.isPhotoFocused = false;
    this.cancelOpenCountdown();

    if (!this.isCardOpen) {
      const title = this.getTitleEl();
      if (title) {
        title.setAttribute('visible', 'false');
      }
    }
  }

  /**
   * Starts 2000ms countdown to open card
   */
  startOpenCountdown() {
    this.cancelOpenCountdown();
    this.openStartTime = getNow();

    if (this.openTimeoutId) {
      clearTimeout(this.openTimeoutId);
    }
    this.openTimeoutId = setTimeout(() => {
      if (this.isPhotoFocused && !this.isCardOpen) {
        this.cancelOpenCountdown();
        this.openCard();
      }
    }, this.openDuration);

    const tick = () => {
      if (!this.isPhotoFocused || this.isCardOpen) {
        this.cancelOpenCountdown();
        return;
      }

      const elapsed = getNow() - this.openStartTime;
      const progress = Math.min(1, elapsed / this.openDuration);

      this.updateProgressIndicator(progress, '#4CC3D9');

      if (progress >= 1) {
        this.cancelOpenCountdown();
        this.openCard();
        return;
      }

      this.openAnimId = requestAnimFrame(tick);
    };

    this.openAnimId = requestAnimFrame(tick);
  }

  /**
   * Cancels the active open countdown
   */
  cancelOpenCountdown() {
    if (this.openAnimId) {
      cancelAnimFrame(this.openAnimId);
      this.openAnimId = null;
    }
    if (this.openTimeoutId) {
      clearTimeout(this.openTimeoutId);
      this.openTimeoutId = null;
    }
    this.updateProgressIndicator(0);
  }

  /**
   * Click on photo -> emits hotspot click and immediately opens card (if not editor)
   */
  handlePhotoClick() {
    const sceneEl = this.visualEl?.sceneEl;
    if (sceneEl && sceneEl.emit) {
      sceneEl.emit('swt-hotspot-clicked', { hotspotData: this.hotspotData });
    }

    if (this.isEditor) return;

    if (!this.isCardOpen) {
      this.cancelOpenCountdown();
      this.openCard();
    }
  }

  /**
   * Per-frame tick handler called directly by A-Frame component.
   * Checks cursor raycaster intersections for fail-safe hands-free gaze tracking.
   */
  tick() {
    const sceneEl = this.visualEl?.sceneEl;
    if (!sceneEl || !sceneEl.querySelector) return;
    const cursorEl = sceneEl.querySelector('[cursor]') || sceneEl.querySelector('a-cursor');
    if (!cursorEl || !cursorEl.components || !cursorEl.components.raycaster) return;

    const intersected = cursorEl.components.raycaster.intersectedEls || [];

    if (this.isCardOpen && this.closeBtnEl) {
      const isTargetIntersected = intersected.some(
        (item) => item === this.closeBtnEl || (this.closeBtnEl.contains && this.closeBtnEl.contains(item))
      );

      if (isTargetIntersected) {
        if (!this.isCloseFocused) {
          this.handleCloseEnter();
        } else {
          const elapsed = getNow() - this.closeStartTime;
          const progress = Math.min(1, elapsed / this.closeDuration);
          this.updateProgressIndicator(progress, '#ef4444');
          if (progress >= 1) {
            this.cancelCloseCountdown();
            this.closeCard();
          }
        }
      } else {
        if (this.isCloseFocused) {
          this.handleCloseLeave();
        }
      }
    } else if (!this.isCardOpen && this.visualEl && !this.isEditor) {
      const isPhotoIntersected = intersected.some(
        (item) => item === this.visualEl || (this.visualEl.contains && this.visualEl.contains(item))
      );

      if (isPhotoIntersected) {
        if (!this.isPhotoFocused) {
          this.handlePhotoEnter();
        } else {
          const elapsed = getNow() - this.openStartTime;
          const progress = Math.min(1, elapsed / this.openDuration);
          this.updateProgressIndicator(progress, '#4CC3D9');
          if (progress >= 1) {
            this.cancelOpenCountdown();
            this.openCard();
          }
        }
      } else {
        if (this.isPhotoFocused) {
          this.handlePhotoLeave();
        }
      }
    }
  }

  /**
   * Opens the 3D card in place of the original photo
   */
  openCard() {
    if (this.isCardOpen) return;
    this.isCardOpen = true;
    this.cancelOpenCountdown();

    // Hide original photo and disable its raycasting
    if (this.visualEl) {
      this.visualEl.setAttribute('visible', 'false');
      if (this.visualEl.classList) {
        if (typeof this.visualEl.classList.remove === 'function') {
          this.visualEl.classList.remove('clickable');
        } else if (typeof this.visualEl.classList.delete === 'function') {
          this.visualEl.classList.delete('clickable');
        }
      }
      const currentClass = (this.visualEl.getAttribute && this.visualEl.getAttribute('class')) || '';
      if (currentClass.includes('clickable')) {
        this.visualEl.setAttribute('class', currentClass.replace(/\bclickable\b/g, '').trim());
      }
    }

    // Hide floating title
    const title = this.getTitleEl();
    if (title) {
      title.setAttribute('visible', 'false');
    }

    // Build card and mount in place of photo
    this.cardEl = this.createCard();
    const parent = this.visualEl?.parentNode;
    if (parent && parent.appendChild) {
      parent.appendChild(this.cardEl);
    }

    // Refresh raycasters in scene so cursor picks up the new clickable close button
    refreshRaycasters(this.visualEl?.sceneEl);

    const sceneEl = this.visualEl?.sceneEl;
    if (sceneEl && sceneEl.emit) {
      sceneEl.emit('swt-photo-card-opened', {
        hotspotData: this.hotspotData,
        cardEl: this.cardEl
      });
    }
  }

  /**
   * Closes the 3D card and restores original photo
   */
  closeCard() {
    if (!this.isCardOpen) return;
    this.isCardOpen = false;
    this.cancelCloseCountdown();

    // Remove card element
    if (this.cardEl && this.cardEl.parentNode) {
      this.cardEl.parentNode.removeChild(this.cardEl);
    }
    this.cardEl = null;
    this.closeBtnEl = null;
    this.closeBgEl = null;

    // Restore original photo
    if (this.visualEl) {
      this.visualEl.setAttribute('visible', 'true');
      if (this.visualEl.classList) {
        if (typeof this.visualEl.classList.add === 'function') {
          this.visualEl.classList.add('clickable');
        }
      }
      const currentClass = (this.visualEl.getAttribute && this.visualEl.getAttribute('class')) || '';
      if (!currentClass.includes('clickable')) {
        this.visualEl.setAttribute('class', (currentClass + ' clickable').trim());
      }
    }

    // Restore floating title behavior (hidden)
    const title = this.getTitleEl();
    if (title) {
      title.setAttribute('visible', 'false');
    }

    // Refresh raycasters in scene
    refreshRaycasters(this.visualEl?.sceneEl);

    const sceneEl = this.visualEl?.sceneEl;
    if (sceneEl && sceneEl.emit) {
      sceneEl.emit('swt-photo-card-closed', {
        hotspotData: this.hotspotData
      });
    }
  }

  /**
   * Complete cleanup of timers and card entity
   */
  destroy() {
    this.cancelOpenCountdown();
    this.cancelCloseCountdown();
    if (this.cardEl && this.cardEl.parentNode) {
      this.cardEl.parentNode.removeChild(this.cardEl);
    }
    this.cardEl = null;
    this.isCardOpen = false;
    this.visualEl = null;
    this.titleEl = null;
  }
}
