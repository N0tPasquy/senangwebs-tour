// UI Controller - Handles DOM manipulation and rendering

// Import icons list from SenangStart icons package (baked into bundle at build time)
import iconsData from "@bookklik/senangstart-icons/src/icons.json";
import { EditorEvents } from "./event-emitter.js";

class UIController {
  constructor(editor) {
    this.editor = editor;
    // Resolve list containers from supplied options, falling back to
    // document-global IDs for the default editor markup
    this.sceneList =
      editor.options.sceneListElement ||
      editor.getScopedElement("sceneList");
    this.hotspotList =
      editor.options.hotspotListElement ||
      editor.getScopedElement("hotspotList");
    this.draggedElement = null;
  }

  /**
   * Look up an editor UI element by ID, scoped to the editor container when
   * one was supplied. Returns null when the element is absent so callers
   * must guard optional form fields.
   * @param {string} id - Element ID
   * @returns {Element|null}
   */
  getEl(id) {
    return this.editor.getScopedElement(id);
  }

  /**
   * Render scene list
   */
  renderSceneList() {
    if (!this.sceneList) return;

    this.sceneList.innerHTML = "";
    const scenes = this.editor.sceneManager.getAllScenes();
    const currentIndex = this.editor.sceneManager.currentSceneIndex;

    if (scenes.length === 0) {
      const empty = document.createElement("div");
      empty.className = "empty-state";
      empty.innerHTML = `
                <p>No scenes yet</p>
                <p class="hint">Click "Add Scene" to upload a 360° panorama</p>
            `;
      this.sceneList.appendChild(empty);
      return;
    }

    scenes.forEach((scene, index) => {
      const card = this.createSceneCard(scene, index, index === currentIndex);
      this.sceneList.appendChild(card);
    });
  }

  /**
   * Create scene card element
   */
  createSceneCard(scene, index, isActive) {
    const card = document.createElement("div");
    card.className = "scene-card" + (isActive ? " active" : "");
    card.draggable = true;
    card.dataset.index = index;

    // Drag handle
    const dragHandle = document.createElement("div");
    dragHandle.className = "drag-handle";
    dragHandle.innerHTML =
      '<ss-icon icon="arrow-up-down-left-right" thickness="2.2"></ss-icon>';

    // Thumbnail - use thumbnail, panorama, or imageUrl (backward compatibility)
    const thumbnail = document.createElement("img");
    thumbnail.src = scene.thumbnail || scene.panorama || scene.imageUrl;
    thumbnail.alt = scene.name;

    // Info
    const info = document.createElement("div");
    info.className = "scene-info";

    const name = document.createElement("div");
    name.className = "scene-name";
    name.textContent = scene.name;

    const meta = document.createElement("div");
    meta.className = "scene-meta";
    meta.textContent = `${scene.hotspots.length} hotspot${
      scene.hotspots.length !== 1 ? "s" : ""
    }`;

    info.appendChild(name);
    info.appendChild(meta);

    // Actions
    const actions = document.createElement("div");
    actions.className = "scene-actions";

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "btn-icon";
    deleteBtn.innerHTML = '<ss-icon icon="trash" thickness="2.2"></ss-icon>';
    deleteBtn.title = "Delete scene";
    deleteBtn.onclick = (e) => {
      e.stopPropagation();
      this.editor.removeScene(index);
    };

    actions.appendChild(deleteBtn);

    card.appendChild(dragHandle);
    card.appendChild(thumbnail);
    card.appendChild(info);
    card.appendChild(actions);

    // Click handler
    card.onclick = () => {
      this.editor.selectScene(index);
    };

    // Drag and drop handlers
    this.setupDragAndDrop(card);

    return card;
  }

  /**
   * Setup drag and drop for scene reordering
   */
  setupDragAndDrop(card) {
    card.addEventListener("dragstart", (e) => {
      this.draggedElement = card;
      card.classList.add("dragging");
      e.dataTransfer.effectAllowed = "move";
    });

    card.addEventListener("dragend", () => {
      card.classList.remove("dragging");
      this.draggedElement = null;
    });

    card.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";

      if (this.draggedElement && this.draggedElement !== card) {
        const bounding = card.getBoundingClientRect();
        const offset = bounding.y + bounding.height / 2;

        if (e.clientY - offset > 0) {
          card.style.borderBottom = "2px solid var(--accent-color)";
          card.style.borderTop = "";
        } else {
          card.style.borderTop = "2px solid var(--accent-color)";
          card.style.borderBottom = "";
        }
      }
    });

    card.addEventListener("dragleave", () => {
      card.style.borderTop = "";
      card.style.borderBottom = "";
    });

    card.addEventListener("drop", (e) => {
      e.preventDefault();
      card.style.borderTop = "";
      card.style.borderBottom = "";

      if (this.draggedElement && this.draggedElement !== card) {
        const fromIndex = parseInt(this.draggedElement.dataset.index);
        const toIndex = parseInt(card.dataset.index);
        this.editor.reorderScenes(fromIndex, toIndex);
      }
    });
  }

  /**
   * Render hotspot list
   */
  renderHotspotList() {
    if (!this.hotspotList) return;

    this.hotspotList.innerHTML = "";
    const hotspots = this.editor.hotspotEditor.getAllHotspots();
    const currentIndex = this.editor.hotspotEditor.currentHotspotIndex;

    if (hotspots.length === 0) {
      const empty = document.createElement("div");
      empty.className = "empty-state";
      empty.textContent = 'No hotspots. Click "Add Hotspot" to create one.';
      this.hotspotList.appendChild(empty);
      return;
    }

    hotspots.forEach((hotspot, index) => {
      const item = this.createHotspotItem(
        hotspot,
        index,
        index === currentIndex
      );
      this.hotspotList.appendChild(item);
    });
  }

  /**
   * Create hotspot list item
   * Uses unified format with nested appearance, action, and tooltip
   */
  createHotspotItem(hotspot, index, isActive) {
    const item = document.createElement("div");
    item.className = "hotspot-item" + (isActive ? " active" : "");

    // Get values from nested structure
    const color = hotspot.appearance?.color || "#00ff00";
    const icon = hotspot.appearance?.icon || "";
    const title = hotspot.tooltip?.text || "Untitled Hotspot";
    const targetSceneId = hotspot.action?.target || "";

    const colorIndicator = document.createElement("div");
    colorIndicator.className = "hotspot-color";
    colorIndicator.style.backgroundColor = color;
    
    // If hotspot has an icon, show it with the color applied
    if (icon) {
      const iconEl = document.createElement('ss-icon');
      iconEl.setAttribute('icon', icon);
      iconEl.setAttribute('thickness', '2.2');
      iconEl.style.color = color;
      iconEl.style.width = '20px';
      iconEl.style.height = '20px';
      
      colorIndicator.innerHTML = '';
      colorIndicator.appendChild(iconEl);
      
      colorIndicator.style.backgroundColor = "transparent";
      colorIndicator.style.display = "flex";
      colorIndicator.style.alignItems = "center";
      colorIndicator.style.justifyContent = "center";
    }

    const info = document.createElement("div");
    info.className = "hotspot-info";

    const titleEl = document.createElement("div");
    titleEl.className = "hotspot-title";
    titleEl.textContent = title;

    // Check if this is a gaze navigation hotspot or photo hotspot and add visual badge
    const isGaze = hotspot.action?.type === 'gazeNavigate' || hotspot.type === 'gazeNavigate' || hotspot.type === 'gaze';
    const isPhoto = hotspot.action?.type === 'photo' || hotspot.type === 'photo';
    if (isGaze) {
      const durationSec = ((hotspot.action?.duration || 3000) / 1000).toFixed(1);
      const badge = document.createElement("span");
      badge.className = "hotspot-badge badge-gaze";
      badge.textContent = `Gaze ${durationSec}s`;
      titleEl.appendChild(badge);
    } else if (isPhoto) {
      const badge = document.createElement("span");
      badge.className = "hotspot-badge badge-photo";
      badge.textContent = "Photo";
      titleEl.appendChild(badge);
    }

    const target = document.createElement("div");
    target.className = "hotspot-target";
    if (isPhoto) {
      target.textContent = "📷 Static Photo";
    } else if (targetSceneId) {
      const targetScene = this.editor.sceneManager.getSceneById(
        targetSceneId
      );
      target.textContent = targetScene
        ? `→ ${targetScene.name}`
        : `→ ${targetSceneId}`;
    } else {
      target.textContent = "No target";
    }

    info.appendChild(titleEl);
    info.appendChild(target);

    const actions = document.createElement("div");
    actions.className = "hotspot-actions";

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "btn-delete";
    deleteBtn.innerHTML = '<ss-icon icon="trash" thickness="2.2"></ss-icon>';
    deleteBtn.title = "Delete";
    deleteBtn.onclick = (e) => {
      e.stopPropagation();
      this.editor.removeHotspot(index);
    };

    actions.appendChild(deleteBtn);

    item.appendChild(colorIndicator);
    item.appendChild(info);
    item.appendChild(actions);

    item.onclick = () => {
      if (this.editor.hotspotEditor.currentHotspotIndex === index) {
        this.editor.selectHotspot(-1);
      } else {
        this.editor.selectHotspot(index, false);
      }
    };

    return item;
  }

  /**
   * Set active state on icon grid button
   */
  setActiveIconButton(iconName) {
    const grid = this.getEl("hotspotIconGrid");
    if (!grid) return;
    
    // Remove active from all buttons
    grid.querySelectorAll(".icon-btn").forEach(btn => {
      btn.classList.remove("active");
    });
    
    // Find and activate the matching button
    const activeBtn = grid.querySelector(`.icon-btn[data-icon="${iconName}"]`);
    if (activeBtn) {
      activeBtn.classList.add("active");
    }
  }

  /**
   * Populate icon grid from SenangStart icons (baked in at build time)
   * Waits for ss-icon custom element to be defined to avoid race conditions
   */
  async populateIconGrid() {
    const grid = this.getEl("hotspotIconGrid");
    if (!grid) return;

    // Wait for ss-icon custom element to be defined before populating
    // This prevents race conditions where icons don't render if the
    // custom element isn't registered yet when this method runs
    try {
      if (customElements.get('ss-icon') === undefined) {
        // Give a reasonable timeout to avoid infinite waiting
        await Promise.race([
          customElements.whenDefined('ss-icon'),
          new Promise((_, reject) => setTimeout(() => reject(new Error('ss-icon timeout')), 5000))
        ]);
      }
    } catch (err) {
      console.warn('ss-icon custom element not available, icon grid may not render properly:', err.message);
    }

    // Clear existing content
    grid.innerHTML = "";

    // Add "No icon" button first
    const noIconBtn = document.createElement("button");
    noIconBtn.type = "button";
    noIconBtn.className = "icon-btn active";
    noIconBtn.dataset.icon = "";
    noIconBtn.title = "No icon";
    noIconBtn.innerHTML = '<ss-icon icon="x-mark" thickness="1.5" style="opacity: 0.5;"></ss-icon>';
    grid.appendChild(noIconBtn);

    // Add buttons for each icon from imported JSON
    iconsData.forEach(icon => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "icon-btn";
      btn.dataset.icon = icon.slug;
      btn.title = icon.name;
      btn.innerHTML = `<ss-icon icon="${icon.slug}" thickness="2.2"></ss-icon>`;
      grid.appendChild(btn);
    });

    // console.log(`Loaded ${iconsData.length} icons`);
  }

  /**
   * Update properties panel for hotspot
   * Uses unified format with nested appearance, action, and tooltip
   */
  updateHotspotProperties(hotspot) {
    const hotspotAll = this.getEl("hotspotAll");
    const hotspotProperties = this.getEl("hotspotProperties");

    if (!hotspot) {
      // No hotspot selected - show list, hide properties
      if (hotspotAll) hotspotAll.style.display = "block";
      if (hotspotProperties) hotspotProperties.style.display = "none";

      // Clear form (optional elements are guarded)
      const title = this.getEl("hotspotTitle");
      if (title) title.value = "";
      const description = this.getEl("hotspotDescription");
      if (description) description.value = "";
      const target = this.getEl("hotspotTarget");
      if (target) target.value = "";
      const color = this.getEl("hotspotColor");
      if (color) color.value = "#00ff00";
      const colorText = this.getEl("hotspotColorText");
      if (colorText) colorText.value = "#00ff00";
      // Reset icon grid to "no icon" button
      this.setActiveIconButton("");
      const posX = this.getEl("hotspotPosX");
      if (posX) posX.value = "";
      const posY = this.getEl("hotspotPosY");
      if (posY) posY.value = "";
      const posZ = this.getEl("hotspotPosZ");
      if (posZ) posZ.value = "";
      const actionType = this.getEl("hotspotActionType");
      if (actionType) actionType.value = "gazeNavigate";
      const targetGroup = this.getEl("hotspotTargetGroup");
      if (targetGroup) targetGroup.style.display = "block";
      const goToBtn = this.getEl("hotspotGoToSceneBtn");
      if (goToBtn) goToBtn.style.display = "none";
      const gazeDurationGroup = this.getEl("hotspotGazeDurationGroup");
      if (gazeDurationGroup) gazeDurationGroup.style.display = "block";
      const gazeDuration = this.getEl("hotspotGazeDuration");
      if (gazeDuration) gazeDuration.value = "3000";
      const photoGroup = this.getEl("hotspotPhotoGroup");
      if (photoGroup) photoGroup.style.display = "none";
      const photoUrl = this.getEl("hotspotPhotoUrl");
      if (photoUrl) photoUrl.value = "";
      const photoPreviewWrap = this.getEl("hotspotPhotoPreviewWrap");
      if (photoPreviewWrap) photoPreviewWrap.style.display = "none";
      const iconGroup = this.getEl("hotspotIconGroup");
      if (iconGroup) iconGroup.style.display = "block";
      const descGroup = this.getEl("hotspotDescriptionGroup");
      if (descGroup) descGroup.style.display = "none";
      const descFontGroup = this.getEl("hotspotDescFontGroup");
      if (descFontGroup) descFontGroup.style.display = "none";
      const descFontSlider = this.getEl("hotspotDescFont");
      if (descFontSlider) descFontSlider.value = "1.0";
      const descFontNum = this.getEl("hotspotDescFontNum");
      if (descFontNum) descFontNum.value = "1.0";
      const descFontVal = this.getEl("hotspotDescFontVal");
      if (descFontVal) descFontVal.textContent = "1.0x";
      const scaleSlider = this.getEl("hotspotScale");
      if (scaleSlider) scaleSlider.value = "1.0";
      const scaleNum = this.getEl("hotspotScaleNum");
      if (scaleNum) scaleNum.value = "1.0";
      const scaleVal = this.getEl("hotspotScaleVal");
      if (scaleVal) scaleVal.textContent = "1.0x";
      return;
    }

    // Hotspot selected - show both list and properties
    if (hotspotAll) hotspotAll.style.display = "block";
    if (hotspotProperties) hotspotProperties.style.display = "block";

    // Get values from nested structure
    const title = hotspot.tooltip?.text || "";
    const description = hotspot.tooltip?.description || "";
    const targetSceneId = hotspot.action?.target || "";
    const color = hotspot.appearance?.color || "#4CC3D9";
    const icon = hotspot.appearance?.icon || "";

    const titleEl = this.getEl("hotspotTitle");
    if (titleEl) titleEl.value = title;
    const descriptionEl = this.getEl("hotspotDescription");
    if (descriptionEl) descriptionEl.value = description;
    const targetEl = this.getEl("hotspotTarget");
    if (targetEl) targetEl.value = targetSceneId;
    const colorEl = this.getEl("hotspotColor");
    if (colorEl) colorEl.value = color;

    // Update color text input if it exists
    const colorText = this.getEl("hotspotColorText");
    if (colorText) {
      colorText.value = color;
    }

    // Update icon grid active button
    this.setActiveIconButton(icon);

    // Update position inputs
    const pos = hotspot.position || { x: 0, y: 0, z: 0 };
    const posX = this.getEl("hotspotPosX");
    if (posX) posX.value = pos.x;
    const posY = this.getEl("hotspotPosY");
    if (posY) posY.value = pos.y;
    const posZ = this.getEl("hotspotPosZ");
    if (posZ) posZ.value = pos.z;

    // Update target dropdown
    this.updateTargetSceneOptions();

    // Update Action Type, Target, Photo and Gaze Duration controls
    const isGazeImage = hotspot.action?.type === 'gazeImage' || hotspot.type === 'gazeImage';
    const isPhoto = hotspot.action?.type === 'photo' || hotspot.type === 'photo';
    const isGazeIcon = !isPhoto && !isGazeImage;

    const actionTypeEl = this.getEl("hotspotActionType");
    if (actionTypeEl) {
      actionTypeEl.value = isPhoto ? "photo" : (isGazeImage ? "gazeImage" : "gazeNavigate");
    }

    const targetGroup = this.getEl("hotspotTargetGroup");
    if (targetGroup) {
      targetGroup.style.display = isPhoto ? "none" : "block";
    }

    const goToBtn = this.getEl("hotspotGoToSceneBtn");
    if (goToBtn) {
      goToBtn.style.display = (!isPhoto && targetSceneId) ? "inline-block" : "none";
    }

    const gazeDurationGroup = this.getEl("hotspotGazeDurationGroup");
    if (gazeDurationGroup) {
      gazeDurationGroup.style.display = isPhoto ? "none" : "block";
    }
    const gazeDurationEl = this.getEl("hotspotGazeDuration");
    if (gazeDurationEl) {
      gazeDurationEl.value = hotspot.action?.duration || 3000;
    }

    const photoGroup = this.getEl("hotspotPhotoGroup");
    if (photoGroup) {
      photoGroup.style.display = (isPhoto || isGazeImage) ? "block" : "none";
    }

    const iconGroup = this.getEl("hotspotIconGroup");
    if (iconGroup) {
      iconGroup.style.display = isGazeIcon ? "block" : "none";
    }

    const colorGroup = this.getEl("hotspotColorGroup") || this.getEl("hotspotColor")?.closest(".form-group");
    if (colorGroup) {
      colorGroup.style.display = isPhoto ? "none" : "block";
    }

    const descGroup = this.getEl("hotspotDescriptionGroup");
    if (descGroup) {
      descGroup.style.display = isPhoto ? "block" : "none";
    }

    const descFontGroup = this.getEl("hotspotDescFontGroup");
    if (descFontGroup) {
      descFontGroup.style.display = isPhoto ? "block" : "none";
    }
    const rawDescFont = hotspot.appearance?.descFontSize ?? hotspot.action?.descFontSize ?? 1.0;
    const descFontVal = typeof rawDescFont === 'number' && isFinite(rawDescFont) ? rawDescFont : (parseFloat(rawDescFont) || 1.0);
    const descFontSlider = this.getEl("hotspotDescFont");
    if (descFontSlider) descFontSlider.value = descFontVal;
    const descFontNum = this.getEl("hotspotDescFontNum");
    if (descFontNum) descFontNum.value = descFontVal;
    const descFontValText = this.getEl("hotspotDescFontVal");
    if (descFontValText) descFontValText.textContent = descFontVal.toFixed(1) + "x";

    // Scale controls
    const rawScale = hotspot.appearance?.scale;
    let scaleVal = 1.0;
    if (typeof rawScale === 'number' && isFinite(rawScale)) {
      scaleVal = rawScale;
    } else if (typeof rawScale === 'string') {
      const firstPart = parseFloat(rawScale.trim().split(/\s+/)[0]);
      if (isFinite(firstPart) && firstPart > 0) scaleVal = firstPart;
    }
    const scaleSlider = this.getEl("hotspotScale");
    if (scaleSlider) scaleSlider.value = scaleVal;
    const scaleNum = this.getEl("hotspotScaleNum");
    if (scaleNum) scaleNum.value = scaleVal;
    const scaleValText = this.getEl("hotspotScaleVal");
    if (scaleValText) scaleValText.textContent = scaleVal.toFixed(1) + "x";

    const photoUrlInput = this.getEl("hotspotPhotoUrl");
    const photoUrl = hotspot.action?.url || hotspot.appearance?.icon || "";
    if (photoUrlInput) {
      if (photoUrl.startsWith("data:")) {
        photoUrlInput.value = "[Photo uploaded]";
        photoUrlInput.setAttribute("title", "Photo uploaded from computer");
      } else {
        photoUrlInput.value = photoUrl;
        photoUrlInput.removeAttribute("title");
      }
    }
    const photoPreviewWrap = this.getEl("hotspotPhotoPreviewWrap");
    const photoPreview = this.getEl("hotspotPhotoPreview");
    if (photoPreviewWrap && photoPreview) {
      if ((isPhoto || isGazeImage) && photoUrl) {
        photoPreview.src = photoUrl;
        photoPreviewWrap.style.display = "block";
      } else {
        photoPreviewWrap.style.display = "none";
      }
    }
  }

  /**
   * Update properties panel for scene
   */
  updateSceneProperties(scene) {
    const startingPosDisplay = this.getEl("startingPositionDisplay");
    
    if (!scene) {
      const sceneId = this.getEl("sceneId");
      if (sceneId) sceneId.value = "";
      const sceneName = this.getEl("sceneName");
      if (sceneName) sceneName.value = "";
      const sceneImageUrl = this.getEl("sceneImageUrl");
      if (sceneImageUrl) sceneImageUrl.value = "";
      if (startingPosDisplay) {
        startingPosDisplay.textContent = "Not set (camera keeps current position)";
      }
      return;
    }

    const sceneId = this.getEl("sceneId");
    if (sceneId) sceneId.value = scene.id || "";
    const sceneName = this.getEl("sceneName");
    if (sceneName) sceneName.value = scene.name || "";
    // Support both panorama (unified) and imageUrl (legacy)
    const sceneImageUrl = this.getEl("sceneImageUrl");
    if (sceneImageUrl) sceneImageUrl.value = scene.panorama || scene.imageUrl || "";
    
    // Update starting position display
    if (startingPosDisplay) {
      if (scene.startingPosition) {
        const pitchDeg = (scene.startingPosition.pitch * 180 / Math.PI).toFixed(1);
        const yawDeg = (scene.startingPosition.yaw * 180 / Math.PI).toFixed(1);
        startingPosDisplay.textContent = `Pitch: ${pitchDeg}° | Yaw: ${yawDeg}°`;
        startingPosDisplay.style.color = "var(--accent-primary)";
      } else {
        startingPosDisplay.textContent = "Not set (camera keeps current position)";
        startingPosDisplay.style.color = "var(--text-muted)";
      }
    }
  }

  /**
   * Update properties panel for tour
   */
  updateTourProperties(config) {
    const tourTitle = this.getEl("tourTitle");
    if (tourTitle) tourTitle.value = config.title || "";
    const tourDescription = this.getEl("tourDescription");
    if (tourDescription) tourDescription.value = config.description || "";
    const tourInitialScene = this.getEl("tourInitialScene");
    if (tourInitialScene) tourInitialScene.value = config.initialSceneId || "";

    // Also update project name in header if it exists
    const projectName = this.getEl("project-name");
    if (projectName) {
      projectName.value = config.title || "";
    }
  }

  /**
   * Update target scene options in hotspot properties
   */
  updateTargetSceneOptions() {
    const select = this.getEl("hotspotTarget");
    if (!select) return;

    const scenes = this.editor.sceneManager.getAllScenes();
    const currentValue = select.value;

    select.innerHTML = '<option value="">Select target scene...</option>';

    scenes.forEach((scene) => {
      const option = document.createElement("option");
      option.value = scene.id;
      option.textContent = scene.name;
      select.appendChild(option);
    });

    select.value = currentValue;
  }

  /**
   * Update initial scene options in tour properties
   */
  updateInitialSceneOptions() {
    const select = this.getEl("tourInitialScene");
    if (!select) return;

    const scenes = this.editor.sceneManager.getAllScenes();
    const currentValue = select.value;

    select.innerHTML = '<option value="">Select initial scene...</option>';

    scenes.forEach((scene) => {
      const option = document.createElement("option");
      option.value = scene.id;
      option.textContent = scene.name;
      select.appendChild(option);
    });

    select.value = currentValue;
  }

  /**
   * Show/hide loading indicator
   */
  setLoading(isLoading) {
    const indicator = document.querySelector(".loading-indicator");
    if (indicator) {
      indicator.style.display = isLoading ? "block" : "none";
    }
    
    if (isLoading) {
        this.editor.emit(EditorEvents.UI_LOADING_START);
    } else {
        this.editor.emit(EditorEvents.UI_LOADING_END);
    }
  }

  /**
   * Switch properties tab
   */
  switchTab(tabName) {
    const root = this.editor.options.containerElement || document;

    // Update tab buttons
    root.querySelectorAll(".tab-btn").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.tab === tabName);
    });

    // Update tab content
    root.querySelectorAll(".tab-content").forEach((content) => {
      content.classList.toggle("active", content.id === tabName + "Tab");
    });
  }
}

export default UIController;
