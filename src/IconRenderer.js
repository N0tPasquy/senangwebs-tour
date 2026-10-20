/**
 * IconRenderer - Converts SenangStart icon names to image data URLs for A-Frame
 */
export class IconRenderer {
  constructor() {
    this.iconCache = new Map();
    this.renderContainer = null;
  }

  /**
   * Validate an icon name (icon names are slugs such as 'arrow-right').
   * Rejects anything that could break out of an attribute or inject markup.
   * @param {string} iconName
   * @returns {boolean}
   */
  isValidIconName(iconName) {
    return typeof iconName === 'string' && /^[a-z0-9][a-z0-9_-]*$/i.test(iconName);
  }

  /**
   * Validate a color value (hex, rgb(), hsl(), or simple named colors).
   * Rejects values containing quotes, semicolons, braces, or other markup.
   * @param {string} color
   * @returns {boolean}
   */
  isValidColor(color) {
    if (typeof color !== 'string' || color.length > 64) return false;
    return /^#[0-9a-f]{3,8}$|^rgba?\([\d\s.,%]+\)$|^hsla?\([\d\s.,%]+\)$|^[a-z]+$/i.test(color.trim());
  }

  /**
   * Initialize the hidden render container
   */
  init() {
    if (this.renderContainer) return;
    
    this.renderContainer = document.createElement('div');
    this.renderContainer.id = 'swt-icon-renderer';
    this.renderContainer.style.cssText = `
      position: absolute;
      left: -9999px;
      top: -9999px;
      width: 128px;
      height: 128px;
      pointer-events: none;
      visibility: hidden;
    `;
    document.body.appendChild(this.renderContainer);
  }

  /**
   * Generate an image data URL from a SenangStart icon
   * @param {string} iconName - SenangStart icon name (e.g., 'arrow-right')
   * @param {string} color - Hex color for the icon
   * @param {number} size - Size in pixels (default 128)
   * @returns {Promise<string>} - Data URL of the icon image
   */
  async generateIconDataUrl(iconName, color = '#ffffff', size = 128) {
    const cacheKey = `${iconName}-${color}-${size}`;
    
    if (this.iconCache.has(cacheKey)) {
      return this.iconCache.get(cacheKey);
    }

    // Reject unsafe icon names and colors before any rendering happens
    if (!this.isValidIconName(iconName)) {
      console.warn(`Invalid icon name "${iconName}", skipping icon render`);
      return null;
    }
    if (!this.isValidColor(color)) {
      console.warn(`Invalid color "${color}", skipping icon render`);
      return null;
    }

    this.init();

    // Create the ss-icon element with DOM APIs (no HTML string interpolation)
    this.renderContainer.innerHTML = '';
    const ssIcon = document.createElement('ss-icon');
    ssIcon.setAttribute('icon', iconName);
    ssIcon.setAttribute('thickness', '2.5');
    ssIcon.style.color = color;
    ssIcon.style.width = `${size}px`;
    ssIcon.style.height = `${size}px`;
    ssIcon.style.display = 'block';
    this.renderContainer.appendChild(ssIcon);

    return new Promise((resolve) => {
      // Wait for the custom element to render
      setTimeout(() => {
        try {
          const renderedIcon = this.renderContainer.querySelector('ss-icon');
          if (!renderedIcon || !renderedIcon.shadowRoot) {
            console.warn(`Icon ${iconName} not rendered properly`);
            resolve(null);
            return;
          }

          // Get the SVG from shadow root
          const svg = renderedIcon.shadowRoot.querySelector('svg');
          if (!svg) {
            console.warn(`SVG not found for icon ${iconName}`);
            resolve(null);
            return;
          }

          // Clone and prepare SVG
          const svgClone = svg.cloneNode(true);
          svgClone.setAttribute('width', size);
          svgClone.setAttribute('height', size);
          svgClone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
          
          // Apply the color to all paths/elements
          svgClone.querySelectorAll('path, circle, rect, line, polyline, polygon').forEach(el => {
            el.setAttribute('stroke', color);
            // Keep fill as currentColor if it's set
            const fill = el.getAttribute('fill');
            if (fill && fill !== 'none') {
              el.setAttribute('fill', color);
            }
          });

          // Convert SVG to data URL safely without deprecated unescape
          const svgString = new XMLSerializer().serializeToString(svgClone);
          const bytes = new TextEncoder().encode(svgString);
          let binary = '';
          for (let i = 0; i < bytes.length; i++) {
            binary += String.fromCharCode(bytes[i]);
          }
          const dataUrl = 'data:image/svg+xml;base64,' + btoa(binary);
          
          // Cache the result
          this.iconCache.set(cacheKey, dataUrl);
          
          resolve(dataUrl);
        } catch (error) {
          console.error('Error generating icon data URL:', error);
          resolve(null);
        }
      }, 100); // Wait for custom element to render
    });
  }

  /**
   * Clear the icon cache
   */
  clearCache() {
    this.iconCache.clear();
  }

  /**
   * Destroy the renderer
   */
  destroy() {
    if (this.renderContainer && this.renderContainer.parentNode) {
      this.renderContainer.parentNode.removeChild(this.renderContainer);
    }
    this.renderContainer = null;
    this.iconCache.clear();
  }
}
