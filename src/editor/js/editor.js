// Main Editor Controller
import { debounce, showModal, showToast, loadImageAsDataUrl } from './utils.js';
import EventEmitter, { EditorEvents } from './event-emitter.js';

class TourEditor {
    constructor(options = {}) {
        this.config = {
            title: options.projectName || 'My Virtual Tour',
            description: '',
            initialSceneId: ''
        };
        
        // Store initialization options
        this.options = {
            sceneListElement: options.sceneListElement || null,
            previewElement: options.previewElement || null,
            propertiesElement: options.propertiesElement || null,
            hotspotListElement: options.hotspotListElement || null,
            containerElement: options.containerElement || null,
            autoSave: options.autoSave !== undefined ? options.autoSave : false,
            autoSaveInterval: options.autoSaveInterval || 30000,
            ...options
        };
        
        this.storageManager = new ProjectStorageManager();
        this.sceneManager = new SceneManagerEditor(this);
        this.hotspotEditor = new HotspotEditor(this);
        this.previewController = new PreviewController(this);
        this.uiController = new UIController(this);
        this.exportManager = new ExportManager(this);
        
        this.hasUnsavedChanges = false;
        this.lastRenderedSceneIndex = -1;
        this.listenersSetup = false;
        
        // Initialize event emitter
        this.events = new EventEmitter();
    }

    /**
     * Query an element by ID, scoped to the editor container when one was
     * supplied, falling back to the document.
     * @param {string} id - Element ID
     * @returns {Element|null}
     */
    getScopedElement(id) {
        const root = this.options.containerElement;
        if (root) {
            const scoped = root.querySelector(`#${id}`);
            if (scoped) {
                return scoped;
            }
        }
        return document.getElementById(id);
    }

    /**
     * Subscribe to editor events
     * @param {string} event - Event name (use EditorEvents constants)
     * @param {Function} callback - Callback function
     * @returns {Function} Unsubscribe function
     */
    on(event, callback) {
        return this.events.on(event, callback);
    }

    /**
     * Subscribe to an event once
     * @param {string} event - Event name
     * @param {Function} callback - Callback function
     * @returns {Function} Unsubscribe function
     */
    once(event, callback) {
        return this.events.once(event, callback);
    }

    /**
     * Unsubscribe from an event
     * @param {string} event - Event name
     * @param {Function} callback - Callback to remove
     */
    off(event, callback) {
        this.events.off(event, callback);
    }

    /**
     * Emit an event
     * @param {string} event - Event name
     * @param {Object} data - Event data
     */
    emit(event, data = {}) {
        this.events.emit(event, data);
    }

    /**
     * Initialize editor
     * @param {Object} config - Optional configuration object for programmatic init
     */
    async init(config = {}) {
        // Merge config with existing options
        if (config && Object.keys(config).length > 0) {
            Object.assign(this.options, config);
            if (config.projectName) {
                this.config.title = config.projectName;
            }
        }
        
        // Initialize preview
        const previewInit = await this.previewController.init();
        if (!previewInit) {
            console.error('Failed to initialize preview controller');
            showToast('Failed to initialize preview', 'error');
            return false;
        }
        
        // Setup event listeners
        this.setupEventListeners();
        
        // Populate icon grid (async to wait for custom element registration)
        await this.uiController.populateIconGrid();
        
        // Load saved project if exists (but only if it has valid data)
        if (await this.storageManager.hasProject()) {
            try {
                const projectData = await this.storageManager.loadProject();
                if (projectData && projectData.scenes && projectData.scenes.length > 0) {
                    await this.loadProject();
                } else {
                    // Invalid or empty project, clear it
                    console.error('Invalid or empty project data, clearing storage');
                    await this.storageManager.clearProject();
                }
            } catch (error) {
                console.error('Error loading saved project:', error);
                await this.storageManager.clearProject();
            }
        }
        
        // Start auto-save if enabled
        if (this.options.autoSave) {
            this.storageManager.startAutoSave(async () => {
                await this.saveProject();
            }, this.options.autoSaveInterval);
        }
        
        // Initial render (only if no project was loaded)
        if (this.sceneManager.getScenes().length === 0) {
            this.render();
        }
        
        showToast('Editor ready', 'success');
        
        // Emit ready event
        this.emit(EditorEvents.READY, { config: this.options });
        
        return true;
    }

    /**
     * Setup event listeners
     */
    setupEventListeners() {
        if (this.listenersSetup) {
            return;
        }

        const addSceneBtns = document.querySelectorAll('#addSceneBtn');
        const sceneUploads = document.querySelectorAll('#sceneUpload');
        const importBtns = document.querySelectorAll('#importBtn');
        const importUploads = document.querySelectorAll('#importUpload');
        if (addSceneBtns.length > 1 || sceneUploads.length > 1 || importBtns.length > 1 || importUploads.length > 1) {
            console.error('Duplicate IDs found in DOM. This will cause double-trigger issues.');
        }
        
        // Toolbar buttons
        document.getElementById('newBtn')?.addEventListener('click', () => this.newProject());
        document.getElementById('saveBtn')?.addEventListener('click', () => this.saveProject());
        document.getElementById('exportBtn')?.addEventListener('click', () => this.exportManager.showExportPreview());
        document.getElementById('importBtn')?.addEventListener('click', () => this.importProject());
        document.getElementById('helpBtn')?.addEventListener('click', () => this.openModal('helpModal'));

        document.getElementById('addSceneBtn')?.addEventListener('click', () => {
            const sceneUpload = document.getElementById('sceneUpload');
            if (sceneUpload) {
                sceneUpload.click();
            }
        });
        
        document.getElementById('sceneUpload')?.addEventListener('change', (e) => {
            if (e.target.files && e.target.files.length > 0) {
                this.handleSceneUpload(e.target.files);
                setTimeout(() => {
                    e.target.value = '';
                }, 100);
            }
        });

        document.getElementById('addHotspotBtn')?.addEventListener('click', () => {
            this.addHotspotAtCursor();
        });
        
        document.getElementById('clearHotspotsBtn')?.addEventListener('click', () => {
            if (this.hotspotEditor.clearAllHotspots()) {
                this.render();
            }
        });

        // Properties tabs
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.uiController.switchTab(btn.dataset.tab);
            });
        });

        document.getElementById('hotspotTitle')?.addEventListener('input', (e) => {
            const tooltipEl = this.previewController.tour?.hotspotManager?.tooltipEl;
            if (tooltipEl && tooltipEl.getAttribute('visible') === 'true') {
                const textEl = tooltipEl.querySelector('a-text');
                if (textEl) textEl.setAttribute('value', e.target.value);
            }
        });

        document.getElementById('hotspotTitle')?.addEventListener('input', debounce((e) => {
            this.updateCurrentHotspot('tooltip.text', e.target.value);
            this.updateCurrentHotspot('action.title', e.target.value);
        }, 300));
        
        document.getElementById('hotspotDescription')?.addEventListener('input', debounce((e) => {
            this.updateCurrentHotspot('tooltip.description', e.target.value);
            this.updateCurrentHotspot('action.description', e.target.value);
        }, 300));
        
        document.getElementById('hotspotTarget')?.addEventListener('change', (e) => {
            const targetVal = e.target.value;
            this.updateCurrentHotspot('action.target', targetVal);
            const goToBtn = document.getElementById('hotspotGoToSceneBtn');
            if (goToBtn) {
                goToBtn.style.display = targetVal ? 'inline-block' : 'none';
            }
        });

        document.getElementById('hotspotGoToSceneBtn')?.addEventListener('click', () => {
            const targetSelect = document.getElementById('hotspotTarget');
            const targetSceneId = targetSelect?.value;
            if (targetSceneId) {
                const targetIndex = this.sceneManager.scenes.findIndex(s => s.id === targetSceneId);
                if (targetIndex >= 0) {
                    this.selectScene(targetIndex);
                    showToast('Switched to scene: ' + (this.sceneManager.scenes[targetIndex].name || targetSceneId), 'info');
                }
            }
        });

        document.getElementById('hotspotActionType')?.addEventListener('change', async (e) => {
            const actionType = e.target.value;
            const isPhoto = actionType === 'photo';
            const isGazeImage = actionType === 'gazeImage';
            const isGazeIcon = actionType === 'gazeNavigate';
            
            const targetGroup = document.getElementById('hotspotTargetGroup');
            const goToBtn = document.getElementById('hotspotGoToSceneBtn');
            const gazeGroup = document.getElementById('hotspotGazeDurationGroup');
            const photoGroup = document.getElementById('hotspotPhotoGroup');
            const iconGroup = document.getElementById('hotspotIconGroup');
            const colorGroup = document.getElementById('hotspotColorGroup') || document.getElementById('hotspotColor')?.closest('.form-group');
            const descGroup = document.getElementById('hotspotDescriptionGroup');
            const descFontGroup = document.getElementById('hotspotDescFontGroup');
            
            if (targetGroup) targetGroup.style.display = isPhoto ? 'none' : 'block';
            if (goToBtn) {
                const targetVal = document.getElementById('hotspotTarget')?.value;
                goToBtn.style.display = (!isPhoto && targetVal) ? 'inline-block' : 'none';
            }
            if (gazeGroup) gazeGroup.style.display = isPhoto ? 'none' : 'block';
            if (photoGroup) photoGroup.style.display = (isPhoto || isGazeImage) ? 'block' : 'none';
            if (iconGroup) iconGroup.style.display = isGazeIcon ? 'block' : 'none';
            if (colorGroup) colorGroup.style.display = isPhoto ? 'none' : 'block';
            if (descGroup) descGroup.style.display = isPhoto ? 'block' : 'none';
            if (descFontGroup) descFontGroup.style.display = isPhoto ? 'block' : 'none';

            await this.updateCurrentHotspot('action.type', actionType);

            if (isGazeIcon || isGazeImage) {
                const durInput = document.getElementById('hotspotGazeDuration');
                const dur = durInput ? parseInt(durInput.value, 10) || 3000 : 3000;
                await this.updateCurrentHotspot('action.duration', dur);
            }
            if (isPhoto || isGazeImage) {
                const cur = this.hotspotEditor.getCurrentHotspot();
                if (cur && cur.action?.url) {
                    await this.updateCurrentHotspot('appearance.icon', cur.action.url);
                }
            }
            await this.previewController.refreshHotspots();
        });

        document.getElementById('hotspotGazeDuration')?.addEventListener('input', debounce((e) => {
            const dur = Math.max(100, parseInt(e.target.value, 10) || 3000);
            this.updateCurrentHotspot('action.duration', dur);
        }, 300));

        // Photo hotspot file upload and URL
        document.getElementById('hotspotUploadPhotoBtn')?.addEventListener('click', () => {
            document.getElementById('hotspotPhotoFile')?.click();
        });

        document.getElementById('hotspotPhotoFile')?.addEventListener('change', async (e) => {
            const file = e.target.files?.[0];
            if (file) {
                try {
                    showToast('Processing photo...', 'info', 1000);
                    // Optimize image: max 1920 for high-res modal view, max 512 for 3D sphere plane
                    const fullDataUrl = await loadImageAsDataUrl(file, { maxDimension: 1920, quality: 0.85 });
                    const thumbDataUrl = await loadImageAsDataUrl(file, { maxDimension: 512, quality: 0.80 });

                    // Compute aspect ratio from loaded image
                    const img = new Image();
                    await new Promise((resolve) => {
                        img.onload = resolve;
                        img.onerror = resolve;
                        img.src = fullDataUrl;
                    });
                    const aspect = (img.naturalWidth && img.naturalHeight) ? (img.naturalWidth / img.naturalHeight) : 1;

                    const curIndex = this.hotspotEditor.currentHotspotIndex;
                    const curHotspot = this.hotspotEditor.getHotspot(curIndex);
                    if (curHotspot) {
                        if (!curHotspot.action) curHotspot.action = {};
                        if (!curHotspot.appearance) curHotspot.appearance = {};
                        curHotspot.action.url = fullDataUrl;
                        curHotspot.appearance.icon = thumbDataUrl;
                        curHotspot.appearance.aspectRatio = aspect;

                        const photoUrlInput = document.getElementById('hotspotPhotoUrl');
                        if (photoUrlInput) {
                            photoUrlInput.value = `[Photo: ${file.name}]`;
                            photoUrlInput.setAttribute('title', file.name);
                        }

                        const previewWrap = document.getElementById('hotspotPhotoPreviewWrap');
                        const previewImg = document.getElementById('hotspotPhotoPreview');
                        if (previewWrap && previewImg) {
                            previewImg.src = thumbDataUrl;
                            previewWrap.style.display = 'block';
                        }

                        await this.previewController.refreshHotspots();
                        this.uiController.renderHotspotList();
                        this.markUnsavedChanges();
                        showToast('Photo uploaded and optimized successfully', 'success');
                    }
                } catch (err) {
                    console.error('Error loading photo:', err);
                    showToast('Error loading photo', 'error');
                }
            }
        });

        document.getElementById('hotspotPhotoUrl')?.addEventListener('input', debounce(async (e) => {
            const url = e.target.value.trim();
            if (url.startsWith('[Photo:') || url.startsWith('[Photo uploaded') || url.startsWith('[Foto:') || url.startsWith('[Foto caricata')) return;
            const curIndex = this.hotspotEditor.currentHotspotIndex;
            const curHotspot = this.hotspotEditor.getHotspot(curIndex);
            if (curHotspot) {
                if (!curHotspot.action) curHotspot.action = {};
                if (!curHotspot.appearance) curHotspot.appearance = {};
                curHotspot.action.url = url;
                curHotspot.appearance.icon = url;

                if (url) {
                    try {
                        const img = new Image();
                        await new Promise((resolve) => {
                            img.onload = resolve;
                            img.onerror = resolve;
                            img.src = url;
                        });
                        if (img.naturalWidth && img.naturalHeight) {
                            curHotspot.appearance.aspectRatio = img.naturalWidth / img.naturalHeight;
                        }
                    } catch (err) {}
                }

                const previewWrap = document.getElementById('hotspotPhotoPreviewWrap');
                const previewImg = document.getElementById('hotspotPhotoPreview');
                if (previewWrap && previewImg) {
                    if (url) {
                        previewImg.src = url;
                        previewWrap.style.display = 'block';
                    } else {
                        previewWrap.style.display = 'none';
                    }
                }

                await this.previewController.refreshHotspots();
                this.uiController.renderHotspotList();
                this.markUnsavedChanges();
            }
        }, 300));

        document.getElementById('hotspotPreviewPhotoBtn')?.addEventListener('click', () => {
            const cur = this.hotspotEditor.getCurrentHotspot();
            if (cur && (cur.action?.url || cur.appearance?.icon)) {
                const actionData = {
                    url: cur.action?.url || cur.appearance?.icon,
                    title: cur.tooltip?.text || cur.action?.title || '',
                    description: cur.tooltip?.description || cur.action?.description || ''
                };
                this.previewController.tour?.openPhotoModal(actionData);
            } else {
                showToast('Please upload or enter a photo first', 'warning');
            }
        });
        
        document.getElementById('hotspotColor')?.addEventListener('input', (e) => {
            this.updateCurrentHotspot('appearance.color', e.target.value);
        });

        // Icon grid button clicks
        document.getElementById('hotspotIconGrid')?.addEventListener('click', (e) => {
            const btn = e.target.closest('.icon-btn');
            if (btn) {
                const iconValue = btn.dataset.icon;
                // Update active state
                document.querySelectorAll('#hotspotIconGrid .icon-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                // Update hotspot
                this.updateCurrentHotspot('appearance.icon', iconValue);
            }
        });

        document.getElementById('pointCameraToHotspotBtn')?.addEventListener('click', () => {
            const cur = this.hotspotEditor.getCurrentHotspot();
            if (cur) {
                this.previewController.pointCameraToHotspot(cur);
            }
        });

        document.getElementById('closeHotspotPropertiesBtn')?.addEventListener('click', () => {
            this.selectHotspot(-1);
        });

        const handleScaleUpdate = (val) => {
            const num = Math.max(0.1, parseFloat(val) || 1.0);
            const slider = document.getElementById('hotspotScale');
            const numInput = document.getElementById('hotspotScaleNum');
            const valText = document.getElementById('hotspotScaleVal');
            if (slider && parseFloat(slider.value) !== num) slider.value = num;
            if (numInput && parseFloat(numInput.value) !== num) numInput.value = num;
            if (valText) valText.textContent = num.toFixed(1) + 'x';

            // Real-time visual feedback on 3D element in preview
            const curIndex = this.hotspotEditor.currentHotspotIndex;
            const curHotspot = this.hotspotEditor.getCurrentHotspot();
            if (curHotspot) {
                if (!curHotspot.appearance) curHotspot.appearance = {};
                curHotspot.appearance.scale = num;
            }

            const activeHotspotEl = this.previewController.tour?.hotspotManager?.activeHotspots?.[curIndex];
            if (activeHotspotEl) {
                const visualEl = activeHotspotEl.querySelector('.clickable') || activeHotspotEl.querySelector('a-image, a-plane');
                if (visualEl) {
                    visualEl.setAttribute('scale', `${num} ${num} ${num}`);
                    if (curHotspot) {
                        if (visualEl.hasAttribute('swt-gaze-hotspot')) {
                            visualEl.setAttribute('swt-gaze-hotspot', {
                                hotspotData: JSON.stringify(curHotspot)
                            });
                        }
                        if (visualEl.hasAttribute('swt-hotspot-listener')) {
                            visualEl.setAttribute('swt-hotspot-listener', {
                                hotspotData: JSON.stringify(curHotspot)
                            });
                        }
                    }
                }
                const ringEl = activeHotspotEl.querySelector('a-ring');
                if (ringEl) {
                    ringEl.setAttribute('scale', `${num} ${num} ${num}`);
                }

                // Real-time update of photo floating title position and scale so it stays above the photo
                const photoTitleWrap = activeHotspotEl.querySelector(`#swt-photo-title-${curIndex}`) || activeHotspotEl.querySelector('[id^="swt-photo-title"]');
                if (photoTitleWrap) {
                    const photoImg = activeHotspotEl.querySelector('a-image');
                    const h = photoImg ? (parseFloat(photoImg.getAttribute('height')) || 1.5) : 1.5;
                    const titleScale = Math.min(Math.max(num * 0.85, 0.75), 2.5);
                    photoTitleWrap.setAttribute('scale', `${titleScale} ${titleScale} ${titleScale}`);
                    const titleY = (h * 0.5 * num) + (0.32 * titleScale);
                    photoTitleWrap.setAttribute('position', `0 ${titleY.toFixed(3)} 0.02`);
                }
            }

            // Real-time update of tooltip title position and scale
            const tooltipEl = this.previewController.tour?.hotspotManager?.tooltipEl;
            if (tooltipEl && tooltipEl.getAttribute('visible') === 'true') {
                if (curHotspot && curHotspot.position) {
                    const tooltipScale = Math.min(Math.max(num * 0.9, 0.6), 3.0);
                    tooltipEl.setAttribute('scale', `${tooltipScale} ${tooltipScale} ${tooltipScale}`);

                    let elementHalfHeight = 0.5;
                    const isPhoto = curHotspot.action?.type === 'photo' || curHotspot.type === 'photo';
                    if (isPhoto) {
                        const aspect = curHotspot.appearance?.aspectRatio || 1;
                        elementHalfHeight = aspect >= 1 ? (1.5 / aspect) * 0.5 : 1.5 * 0.5;
                    }
                    const offsetY = (elementHalfHeight * num) + (tooltipScale * 0.45);
                    tooltipEl.setAttribute('position', `${curHotspot.position.x} ${curHotspot.position.y + offsetY} ${curHotspot.position.z}`);
                }
            }
        };

        document.getElementById('hotspotScale')?.addEventListener('input', (e) => {
            handleScaleUpdate(e.target.value);
        });

        document.getElementById('hotspotScale')?.addEventListener('change', debounce(async (e) => {
            const num = Math.max(0.1, parseFloat(e.target.value) || 1.0);
            await this.updateCurrentHotspot('appearance.scale', `${num} ${num} ${num}`);
        }, 200));

        document.getElementById('hotspotScaleNum')?.addEventListener('input', debounce(async (e) => {
            const num = Math.max(0.1, parseFloat(e.target.value) || 1.0);
            handleScaleUpdate(num);
            await this.updateCurrentHotspot('appearance.scale', `${num} ${num} ${num}`);
        }, 300));

        // Description font size slider handlers for photo hotspots
        const handleDescFontUpdate = (val) => {
            const num = Math.min(3.0, Math.max(0.4, parseFloat(val) || 1.0));
            const slider = document.getElementById('hotspotDescFont');
            const numInput = document.getElementById('hotspotDescFontNum');
            const valText = document.getElementById('hotspotDescFontVal');
            if (slider && parseFloat(slider.value) !== num) slider.value = num;
            if (numInput && parseFloat(numInput.value) !== num) numInput.value = num;
            if (valText) valText.textContent = num.toFixed(1) + 'x';

            const curHotspot = this.hotspotEditor.getCurrentHotspot();
            if (curHotspot) {
                if (!curHotspot.appearance) curHotspot.appearance = {};
                curHotspot.appearance.descFontSize = num;
                if (!curHotspot.action) curHotspot.action = {};
                curHotspot.action.descFontSize = num;
            }
        };

        document.getElementById('hotspotDescFont')?.addEventListener('input', (e) => {
            handleDescFontUpdate(e.target.value);
        });

        document.getElementById('hotspotDescFont')?.addEventListener('change', debounce(async (e) => {
            const num = Math.min(3.0, Math.max(0.4, parseFloat(e.target.value) || 1.0));
            await this.updateCurrentHotspot('appearance.descFontSize', num);
            await this.updateCurrentHotspot('action.descFontSize', num);
        }, 200));

        document.getElementById('hotspotDescFontNum')?.addEventListener('input', debounce(async (e) => {
            const num = Math.min(3.0, Math.max(0.4, parseFloat(e.target.value) || 1.0));
            handleDescFontUpdate(num);
            await this.updateCurrentHotspot('appearance.descFontSize', num);
            await this.updateCurrentHotspot('action.descFontSize', num);
        }, 300));

        document.getElementById('hotspotPosX')?.addEventListener('input', debounce((e) => {
            this.updateCurrentHotspotPosition('x', parseFloat(e.target.value) || 0);
        }, 300));
        
        document.getElementById('hotspotPosY')?.addEventListener('input', debounce((e) => {
            this.updateCurrentHotspotPosition('y', parseFloat(e.target.value) || 0);
        }, 300));
        
        document.getElementById('hotspotPosZ')?.addEventListener('input', debounce((e) => {
            this.updateCurrentHotspotPosition('z', parseFloat(e.target.value) || 0);
        }, 300));

        document.getElementById('sceneId')?.addEventListener('input', debounce((e) => {
            this.updateCurrentScene('id', sanitizeId(e.target.value));
        }, 300));
        
        document.getElementById('sceneName')?.addEventListener('input', debounce((e) => {
            this.updateCurrentScene('name', e.target.value);
        }, 300));
        
        document.getElementById('sceneImageUrl')?.addEventListener('input', debounce((e) => {
            this.updateCurrentSceneImage(e.target.value);
        }, 300));

        document.getElementById('setStartingPosBtn')?.addEventListener('click', () => {
            this.setSceneStartingPosition();
        });
        
        document.getElementById('clearStartingPosBtn')?.addEventListener('click', () => {
            this.clearSceneStartingPosition();
        });

        document.getElementById('tourTitle')?.addEventListener('input', debounce((e) => {
            this.config.title = e.target.value;
            this.markUnsavedChanges();
            this.emit(EditorEvents.TOUR_TITLE_CHANGE, { title: e.target.value });
            const projectName = document.getElementById('project-name');
            if (projectName && projectName.value !== e.target.value) {
                projectName.value = e.target.value;
            }
        }, 300));
        
        document.getElementById('project-name')?.addEventListener('input', debounce((e) => {
            this.config.title = e.target.value;
            this.markUnsavedChanges();
            this.emit(EditorEvents.TOUR_TITLE_CHANGE, { title: e.target.value });
            const tourTitle = document.getElementById('tourTitle');
            if (tourTitle && tourTitle.value !== e.target.value) {
                tourTitle.value = e.target.value;
            }
        }, 300));
        
        document.getElementById('tourDescription')?.addEventListener('input', debounce((e) => {
            this.config.description = e.target.value;
            this.markUnsavedChanges();
            this.emit(EditorEvents.TOUR_DESCRIPTION_CHANGE, { description: e.target.value });
        }, 300));
        
        document.getElementById('tourInitialScene')?.addEventListener('change', (e) => {
            this.config.initialSceneId = e.target.value;
            this.markUnsavedChanges();
            this.emit(EditorEvents.INITIAL_SCENE_CHANGE, { initialSceneId: e.target.value });
        });

        // Tour Background Audio
        document.getElementById('tourUploadAudioBtn')?.addEventListener('click', () => {
            document.getElementById('tourAudioFile')?.click();
        });

        document.getElementById('tourAudioFile')?.addEventListener('change', async (e) => {
            const file = e.target.files?.[0];
            if (file) {
                try {
                    showToast('Processing audio...', 'info', 1000);
                    const reader = new FileReader();
                    const dataUrl = await new Promise((resolve, reject) => {
                        reader.onload = () => resolve(reader.result);
                        reader.onerror = reject;
                        reader.readAsDataURL(file);
                    });

                    const currentVol = typeof this.config.audio?.volume === 'number' ? this.config.audio.volume : 0.5;
                    this.config.audio = {
                        url: dataUrl,
                        volume: currentVol,
                        loop: true,
                        _fileName: file.name
                    };

                    this.previewController.tour?.setAudio(this.config.audio);
                    this.uiController.updateTourProperties(this.config);
                    this.markUnsavedChanges();
                    this.emit(EditorEvents.TOUR_AUDIO_CHANGE, { audio: this.config.audio });
                    showToast('Audio track uploaded successfully', 'success');
                } catch (err) {
                    console.error('Error loading audio:', err);
                    showToast('Error loading audio file', 'error');
                }
            }
        });

        document.getElementById('tourAudioUrl')?.addEventListener('input', debounce((e) => {
            const url = e.target.value.trim();
            if (url.startsWith('[Audio:') || url.startsWith('[Audio uploaded')) return;

            if (url) {
                const currentVol = typeof this.config.audio?.volume === 'number' ? this.config.audio.volume : 0.5;
                this.config.audio = {
                    url: url,
                    volume: currentVol,
                    loop: true
                };
                this.previewController.tour?.setAudio(this.config.audio);
                this.uiController.updateTourProperties(this.config);
                this.markUnsavedChanges();
                this.emit(EditorEvents.TOUR_AUDIO_CHANGE, { audio: this.config.audio });
            } else if (this.config.audio) {
                delete this.config.audio;
                this.previewController.tour?.setAudio(null);
                this.uiController.updateTourProperties(this.config);
                this.markUnsavedChanges();
                this.emit(EditorEvents.TOUR_AUDIO_CHANGE, { audio: null });
            }
        }, 300));

        document.getElementById('tourRemoveAudioBtn')?.addEventListener('click', () => {
            delete this.config.audio;
            const fileInput = document.getElementById('tourAudioFile');
            if (fileInput) fileInput.value = '';
            this.previewController.tour?.setAudio(null);
            this.uiController.updateTourProperties(this.config);
            this.markUnsavedChanges();
            this.emit(EditorEvents.TOUR_AUDIO_CHANGE, { audio: null });
            showToast('Audio track removed', 'info');
        });

        document.getElementById('tourAudioVolume')?.addEventListener('input', (e) => {
            const vol = parseFloat(e.target.value) || 0;
            if (!this.config.audio) {
                this.config.audio = { volume: vol, loop: true };
            } else {
                this.config.audio.volume = vol;
            }
            const volumeVal = document.getElementById('tourAudioVolumeVal');
            if (volumeVal) {
                volumeVal.textContent = `${Math.round(vol * 100)}%`;
            }
            this.previewController.tour?.setAudioVolume(vol);
            this.markUnsavedChanges();
            this.emit(EditorEvents.TOUR_AUDIO_CHANGE, { audio: this.config.audio });
        });

        // Tour Welcome Popup
        document.getElementById('tourWelcomeEnabled')?.addEventListener('change', (e) => {
            const isChecked = e.target.checked;
            if (isChecked) {
                if (!this.config.welcome) {
                    this.config.welcome = {
                        enabled: true,
                        title: document.getElementById('tourWelcomeTitle')?.value || 'Welcome to the Tour',
                        description: document.getElementById('tourWelcomeDesc')?.value || '',
                        buttonText: document.getElementById('tourWelcomeBtnText')?.value || 'Start Tour'
                    };
                } else {
                    this.config.welcome.enabled = true;
                }
            } else {
                if (this.config.welcome) {
                    this.config.welcome.enabled = false;
                }
            }
            const fields = document.getElementById('tourWelcomeFields');
            if (fields) fields.style.display = isChecked ? 'block' : 'none';
            this.markUnsavedChanges();
            this.emit(EditorEvents.TOUR_WELCOME_CHANGE, { welcome: this.config.welcome });
        });

        document.getElementById('tourWelcomeTitle')?.addEventListener('input', debounce((e) => {
            if (!this.config.welcome) {
                this.config.welcome = { enabled: true, title: '', description: '', buttonText: 'Start Tour' };
            }
            this.config.welcome.title = e.target.value;
            this.markUnsavedChanges();
            this.emit(EditorEvents.TOUR_WELCOME_CHANGE, { welcome: this.config.welcome });
        }, 300));

        document.getElementById('tourWelcomeDesc')?.addEventListener('input', debounce((e) => {
            if (!this.config.welcome) {
                this.config.welcome = { enabled: true, title: 'Welcome to the Tour', description: '', buttonText: 'Start Tour' };
            }
            this.config.welcome.description = e.target.value;
            this.markUnsavedChanges();
            this.emit(EditorEvents.TOUR_WELCOME_CHANGE, { welcome: this.config.welcome });
        }, 300));

        document.getElementById('tourWelcomeBtnText')?.addEventListener('input', debounce((e) => {
            if (!this.config.welcome) {
                this.config.welcome = { enabled: true, title: 'Welcome to the Tour', description: '', buttonText: 'Start Tour' };
            }
            this.config.welcome.buttonText = e.target.value;
            this.markUnsavedChanges();
            this.emit(EditorEvents.TOUR_WELCOME_CHANGE, { welcome: this.config.welcome });
        }, 300));

        document.getElementById('exportJsonBtn')?.addEventListener('click', () => {
            this.exportManager.exportJSON();
        });
        
        document.getElementById('copyJsonBtn')?.addEventListener('click', () => {
            this.exportManager.copyJSON();
        });
        
        document.getElementById('exportViewerBtn')?.addEventListener('click', async () => {
            await this.exportManager.exportViewerHTML();
        });

        document.querySelectorAll('.modal-close').forEach(btn => {
            btn.addEventListener('click', () => {
                const modal = btn.closest('.modal');
                if (modal) {
                    this.closeModal(modal.id);
                }
            });
        });

        document.getElementById('importUpload')?.addEventListener('change', (e) => {
            if (e.target.files && e.target.files.length > 0) {
                this.handleImportFile(e.target.files[0]);
                setTimeout(() => {
                    e.target.value = '';
                }, 100);
            }
        });

        window.addEventListener('beforeunload', (e) => {
            if (this.hasUnsavedChanges) {
                e.preventDefault();
                e.returnValue = '';
            }
        });

        // Listen for preview scene changes (sync UI without reloading preview)
        this.on(EditorEvents.PREVIEW_SCENE_CHANGE, (data) => {
            if (data && data.sceneId) {
                this.syncSceneSelection(data.sceneId);
            }
        });
        
        this.listenersSetup = true;
    }

    /**
     * Handle scene upload
     */
    async handleSceneUpload(files) {
        if (!files || files.length === 0) {
            return;
        }

        this.uiController.setLoading(true);

        for (const file of files) {
            if (!file.type.startsWith('image/')) {
                showToast(`${file.name} is not an image`, 'error');
                continue;
            }

            const scene = await this.sceneManager.addScene(file);
            if (scene) {
                this.emit(EditorEvents.SCENE_ADD, { scene, file });
            }
        }
        this.uiController.setLoading(false);
        this.render();
        this.markUnsavedChanges();
    }

    /**
     * Add hotspot at position
     */
    async addHotspotAtPosition(position) {
        const distance = Math.sqrt(position.x * position.x + position.y * position.y + position.z * position.z);
        if (distance > 5) {
            const scale = 5 / distance;
            position.x *= scale;
            position.y *= scale;
            position.z *= scale;
            position.x = parseFloat(position.x.toFixed(2));
            position.y = parseFloat(position.y.toFixed(2));
            position.z = parseFloat(position.z.toFixed(2));
        }
        
        // Capture current camera orientation for reliable pointing later
        const cameraRotation = this.previewController.getCameraRotation();
        const cameraOrientation = cameraRotation ? {
            pitch: cameraRotation.x,
            yaw: cameraRotation.y
        } : null;
        
        const hotspot = this.hotspotEditor.addHotspot(position, '', cameraOrientation);
        if (hotspot) {
            await this.previewController.refreshHotspots();
            this.uiController.renderHotspotList();
            this.selectHotspot(this.hotspotEditor.currentHotspotIndex, false);
            this.markUnsavedChanges();
            this.emit(EditorEvents.HOTSPOT_ADD, { 
                hotspot, 
                position, 
                sceneId: this.sceneManager.getCurrentScene()?.id 
            });
        } else {
            console.error('Failed to add hotspot');
        }
    }

    /**
     * Add hotspot at current cursor position (center of view)
     * This uses the A-Cursor's raycaster intersection with the sky sphere
     */
    addHotspotAtCursor() {
        const scene = this.sceneManager.getCurrentScene();
        if (!scene) {
            showToast('Please select a scene first', 'error');
            return;
        }

        const position = this.previewController.getCursorIntersection();
        if (!position) {
            showToast('Could not get cursor position. Please ensure the preview is loaded.', 'error');
            return;
        }

        this.addHotspotAtPosition(position);
    }

    /**
     * Select scene by index
     */
    selectScene(index) {
        if (this.sceneManager.setCurrentScene(index)) {
            this.lastRenderedSceneIndex = -1;
            this.hotspotEditor.currentHotspotIndex = -1;
            
            const scene = this.sceneManager.getCurrentScene();
            if (scene) {
                this.previewController.loadScene(scene, false);
                this.lastRenderedSceneIndex = index;
            }
            
            this.uiController.renderSceneList();
            this.uiController.updateSceneProperties(scene);
            this.uiController.renderHotspotList();
            this.uiController.updateHotspotProperties(null);
            this.uiController.updateInitialSceneOptions();
            this.uiController.updateTargetSceneOptions();
            
            this.emit(EditorEvents.SCENE_SELECT, { scene, index });
        }
    }

    /**
     * Select hotspot by index
     * @param {number} index - Hotspot index, or -1 to deselect
     * @param {boolean} [pointCamera=false] - Whether to animate camera to hotspot
     */
    selectHotspot(index, pointCamera = false) {
        if (index === -1) {
            this.hotspotEditor.currentHotspotIndex = -1;
            this.uiController.renderHotspotList();
            this.uiController.updateHotspotProperties(null);
            this.previewController.cancelCameraAnimation();
            return;
        }

        if (this.hotspotEditor.setCurrentHotspot(index)) {
            const hotspot = this.hotspotEditor.getHotspot(index);
            
            this.uiController.renderHotspotList();
            this.uiController.updateHotspotProperties(hotspot);
            this.uiController.updateTargetSceneOptions();
            this.uiController.switchTab('hotspot');
            
            if (hotspot && pointCamera) {
                this.previewController.pointCameraToHotspot(hotspot);
            }
            
            this.emit(EditorEvents.HOTSPOT_SELECT, { hotspot, index });
        }
    }

    /**
     * Sync UI selection with preview navigation (without reloading preview)
     */
    syncSceneSelection(sceneId) {
        const index = this.sceneManager.getSceneIndexById(sceneId);
        if (index === -1 || index === this.sceneManager.currentSceneIndex) {
            return;
        }

        // Silent update of current scene index
        this.sceneManager.currentSceneIndex = index;
        this.lastRenderedSceneIndex = index;
        this.hotspotEditor.currentHotspotIndex = -1;
        
        const scene = this.sceneManager.getCurrentScene();
        
        // Update UI components
        this.uiController.renderSceneList();
        this.uiController.updateSceneProperties(scene);
        this.uiController.renderHotspotList();
        this.uiController.updateHotspotProperties(null);
        this.uiController.updateTargetSceneOptions();
        
        // We do NOT call previewController.loadScene here to avoid reload loop
        
        this.emit(EditorEvents.SCENE_SELECT, { scene, index, synced: true });
    }

    /**
     * Remove scene
     */
    removeScene(index) {
        const scene = this.sceneManager.getScene(index);
        if (this.sceneManager.removeScene(index)) {
            this.render();
            this.markUnsavedChanges();
            this.emit(EditorEvents.SCENE_REMOVE, { scene, index });
        }
    }

    /**
     * Remove hotspot
     */
    async removeHotspot(index) {
        const hotspot = this.hotspotEditor.getHotspot(index);
        if (this.hotspotEditor.removeHotspot(index)) {
            await this.previewController.refreshHotspots();
            this.uiController.renderHotspotList();
            this.uiController.updateHotspotProperties(null);
            this.markUnsavedChanges();
            this.emit(EditorEvents.HOTSPOT_REMOVE, { hotspot, index });
        }
    }

    /**
     * Duplicate hotspot
     */
    async duplicateHotspot(index) {
        const hotspot = this.hotspotEditor.duplicateHotspot(index);
        if (hotspot) {
            await this.previewController.refreshHotspots();
            this.uiController.renderHotspotList();
            this.markUnsavedChanges();
            this.emit(EditorEvents.HOTSPOT_DUPLICATE, { hotspot, originalIndex: index });
        }
    }

    /**
     * Reorder scenes
     */
    reorderScenes(fromIndex, toIndex) {
        if (this.sceneManager.reorderScenes(fromIndex, toIndex)) {
            this.render();
            this.markUnsavedChanges();
            this.emit(EditorEvents.SCENE_REORDER, { fromIndex, toIndex });
        }
    }

    /**
     * Update current hotspot property
     */
    async updateCurrentHotspot(property, value) {
        const index = this.hotspotEditor.currentHotspotIndex;
        if (this.hotspotEditor.updateHotspot(index, property, value)) {
            const contentProps = ['appearance.icon', 'appearance.color', 'appearance.descFontSize', 'action.descFontSize', 'action.type', 'action.url', 'action.target', 'action.title', 'action.description', 'tooltip.text', 'tooltip.description'];
            if (contentProps.includes(property)) {
                await this.previewController.refreshHotspots();
            } else {
                await this.previewController.updateHotspotMarker(index);
            }
            this.uiController.renderHotspotList();
            this.markUnsavedChanges();
            this.emit(EditorEvents.HOTSPOT_UPDATE, { 
                hotspot: this.hotspotEditor.getHotspot(index), 
                index, 
                property, 
                value 
            });
        }
    }

    /**
     * Update current hotspot position (X, Y, or Z)
     */
    async updateCurrentHotspotPosition(axis, value) {
        const index = this.hotspotEditor.currentHotspotIndex;
        const hotspot = this.hotspotEditor.getHotspot(index);
        
        if (hotspot) {
            if (!hotspot.position) {
                hotspot.position = { x: 0, y: 0, z: 0 };
            }
            
            hotspot.position[axis] = value;
            
            // Clear camera orientation since position changed manually
            // Will fallback to position-based calculation when pointing camera
            hotspot.cameraOrientation = null;
            
            const pos = hotspot.position;
            const distance = Math.sqrt(pos.x * pos.x + pos.y * pos.y + pos.z * pos.z);
            if (distance > 5) {
                const scale = 5 / distance;
                pos.x *= scale;
                pos.y *= scale;
                pos.z *= scale;
                
                const posInput = document.getElementById(`hotspotPos${axis.toUpperCase()}`);
                if (posInput) {
                    posInput.value = pos[axis].toFixed(2);
                }
                showToast('Position clamped to 5-unit radius', 'info');
            }
            
            await this.previewController.updateHotspotMarker(index);
            this.uiController.renderHotspotList();
            this.markUnsavedChanges();
            this.emit(EditorEvents.HOTSPOT_POSITION_CHANGE, { 
                hotspot, 
                index, 
                axis, 
                value, 
                position: hotspot.position 
            });
        }
    }

    /**
     * Update current scene property
     */
    updateCurrentScene(property, value) {
        const index = this.sceneManager.currentSceneIndex;
        if (this.sceneManager.updateScene(index, property, value)) {
            this.uiController.renderSceneList();
            this.markUnsavedChanges();
            this.emit(EditorEvents.SCENE_UPDATE, { 
                scene: this.sceneManager.getScene(index), 
                index, 
                property, 
                value 
            });
        }
    }

    /**
     * Update current scene image URL
     */
    async updateCurrentSceneImage(imageUrl) {
        const index = this.sceneManager.currentSceneIndex;
        if (index < 0) return;
        
        // Use panorama for unified format
        if (this.sceneManager.updateScene(index, 'panorama', imageUrl)) {
            const scene = this.sceneManager.getCurrentScene();
            if (scene) {
                scene.thumbnail = imageUrl;
            }
            
            this.uiController.renderSceneList();
            this.lastRenderedSceneIndex = -1;
            
            if (scene) {
                await this.previewController.loadScene(scene);
                this.lastRenderedSceneIndex = index;
                showToast('Scene image updated', 'success');
            }
            this.markUnsavedChanges();
            this.emit(EditorEvents.SCENE_IMAGE_CHANGE, { scene, index, imageUrl });
        }
    }

    /**
     * Set scene starting position to current camera rotation
     */
    setSceneStartingPosition() {
        const scene = this.sceneManager.getCurrentScene();
        if (!scene) {
            showToast('No scene selected', 'error');
            return;
        }
        
        const rotation = this.previewController.getCameraRotation();
        if (!rotation) {
            showToast('Could not get camera rotation', 'error');
            return;
        }
        
        scene.startingPosition = {
            pitch: rotation.x,
            yaw: rotation.y
        };
        
        this.uiController.updateSceneProperties(scene);
        this.markUnsavedChanges();
        showToast('Starting position set', 'success');
        this.emit(EditorEvents.SCENE_STARTING_POSITION_SET, { scene, startingPosition: scene.startingPosition });
    }

    /**
     * Clear scene starting position
     */
    clearSceneStartingPosition() {
        const scene = this.sceneManager.getCurrentScene();
        if (!scene) {
            showToast('No scene selected', 'error');
            return;
        }
        
        scene.startingPosition = null;
        
        this.uiController.updateSceneProperties(scene);
        this.markUnsavedChanges();
        showToast('Starting position cleared', 'success');
        this.emit(EditorEvents.SCENE_STARTING_POSITION_CLEAR, { scene });
    }

    /**
     * Render all UI
     */
    render() {
        this.uiController.renderSceneList();
        this.uiController.renderHotspotList();
        this.uiController.populateIconGrid(); // Re-render icon grid to ensure icons display
        
        const currentScene = this.sceneManager.getCurrentScene();
        const currentHotspot = this.hotspotEditor.getCurrentHotspot();
        
        this.uiController.updateSceneProperties(currentScene);
        this.uiController.updateHotspotProperties(currentHotspot);
        this.uiController.updateTourProperties(this.config);
        this.uiController.updateInitialSceneOptions();
        this.uiController.updateTargetSceneOptions();
        
        if (currentScene) {
            const emptyState = document.querySelector('.preview-empty');
            if (emptyState) {
                emptyState.style.display = 'none';
            }
            
            const currentSceneIndex = this.sceneManager.currentSceneIndex;
            if (currentSceneIndex !== this.lastRenderedSceneIndex) {
                this.previewController.loadScene(currentScene);
                this.lastRenderedSceneIndex = currentSceneIndex;
            }
            
            if (currentHotspot) {
                this.previewController.highlightHotspot(this.hotspotEditor.currentHotspotIndex);
            }
        } else {
            const emptyState = document.querySelector('.preview-empty');
            if (emptyState) {
                emptyState.style.display = 'flex';
            }
            this.lastRenderedSceneIndex = -1;
        }
        
        this.emit(EditorEvents.UI_RENDER);
    }

    /**
     * Save project
     */
    async saveProject() {
        const projectData = {
            config: this.config,
            scenes: this.sceneManager.getAllScenes()
        };

        if (await this.storageManager.saveProject(projectData)) {
            this.hasUnsavedChanges = false;
            showToast('Project saved', 'success');
            this.emit(EditorEvents.PROJECT_SAVE, { projectData });
            return true;
        }
        return false;
    }

    /**
     * Load project
     */
    async loadProject() {
        const projectData = await this.storageManager.loadProject();
        if (projectData) {
            this.config = projectData.config || this.config;
            this.sceneManager.loadScenes(projectData.scenes || []);
            this.lastRenderedSceneIndex = -1;
            this.hasUnsavedChanges = false;
            this.render();
            showToast('Project loaded', 'success');
            this.emit(EditorEvents.PROJECT_LOAD, { projectData });
            return true;
        }
        return false;
    }

    /**
     * New project
     * Confirms once before modifying any state; cancellation leaves
     * configuration, scenes, and unsaved-state untouched.
     */
    newProject() {
        const hasScenes = this.sceneManager.getScenes().length > 0;
        if ((this.hasUnsavedChanges || hasScenes) &&
            !confirm('You have unsaved changes. Create new project?')) {
            return false;
        }

        // Confirmed - now commit the reset
        this.config = {
            title: 'My Virtual Tour',
            description: '',
            initialSceneId: ''
        };
        
        this.sceneManager.resetScenes();
        this.lastRenderedSceneIndex = -1;
        this.hasUnsavedChanges = false;
        this.render();
        
        showToast('New project created', 'success');
        this.emit(EditorEvents.PROJECT_NEW, { config: this.config });
        return true;
    }

    /**
     * Import project
     */
    importProject() {
const importUpload = document.getElementById('importUpload');
        if (importUpload) {
            importUpload.click();
        }
    }

    /**
     * Handle import file
     * Validates and normalizes imported data (both exported tour JSON with
     * `initialScene` and editor project files with `config.initialSceneId`)
     * before replacing project state.
     */
    async handleImportFile(file) {
        try {
            this.uiController.setLoading(true);
            
            const importedData = await this.storageManager.importFromFile(file);
            const projectData = this.normalizeImportedData(importedData);
            
            this.config = projectData.config;
            this.sceneManager.loadScenes(projectData.scenes || []);
            this.lastRenderedSceneIndex = -1;
            this.hotspotEditor.currentHotspotIndex = -1;
            this.hasUnsavedChanges = true;
            
            this.render();
            this.uiController.setLoading(false);
            
            showToast('Project imported successfully', 'success');
            this.emit(EditorEvents.PROJECT_IMPORT, { projectData, file });
        } catch (error) {
            this.uiController.setLoading(false);
            console.error('Import failed:', error);
            showToast('Invalid or corrupt project file', 'error');
        }
    }

    /**
     * Validate and normalize imported tour data into editor project format
     * @param {Object} data - Raw imported data
     * @returns {Object} Normalized project data: { config, scenes }
     */
    normalizeImportedData(data) {
        if (!data || typeof data !== 'object') {
            throw new Error('Invalid project data');
        }

        // Accept both editor project files ({ config: { initialSceneId }, scenes })
        // and exported tour JSON ({ initialScene, scenes })
        const scenes = Array.isArray(data.scenes) ? data.scenes : [];
        if (scenes.length === 0) {
            throw new Error('No scenes found in project data');
        }

        // Validate each scene has id and a panorama
        const validScenes = scenes.filter(
            (scene) => scene && typeof scene === 'object' && scene.id &&
                (scene.panorama || scene.imageUrl)
        );
        if (validScenes.length === 0) {
            throw new Error('No valid scenes found in project data');
        }

        let initialSceneId = '';
        if (data.config && typeof data.config === 'object') {
            initialSceneId = data.config.initialSceneId || '';
        } else if (data.initialScene) {
            initialSceneId = data.initialScene;
        }
        // Keep the imported starting scene only if it still exists after import
        if (!validScenes.some((scene) => scene.id === initialSceneId)) {
            initialSceneId = validScenes[0].id;
        }

        return {
            config: {
                title: (data.config && data.config.title) || data.title || 'My Virtual Tour',
                description: (data.config && data.config.description) || data.description || '',
                initialSceneId
            },
            scenes: validScenes
        };
    }

    /**
     * Open modal and emit event
     */
    openModal(modalId) {
        showModal(modalId);
        this.emit(EditorEvents.MODAL_OPEN, { modalId });
    }

    /**
     * Close modal and emit event
     */
    closeModal(modalId) {
        hideModal(modalId);
        this.emit(EditorEvents.MODAL_CLOSE, { modalId });
    }

    /**
     * Mark unsaved changes
     */
    markUnsavedChanges() {
        this.hasUnsavedChanges = true;
        this.emit(EditorEvents.UNSAVED_CHANGES);
    }

    /**
     * Start playing background audio in preview mode
     */
    playPreviewAudio() {
        if (this.previewController?.tour && this.config.audio?.url) {
            this.previewController.tour.playAudio().catch(() => {});
        }
    }

    /**
     * Pause background audio when exiting preview mode
     */
    pausePreviewAudio() {
        if (this.previewController?.tour) {
            this.previewController.tour.pauseAudio();
        }
    }
}

// Initialize editor when DOM is ready
document.addEventListener('DOMContentLoaded', async () => {
    if (document.querySelector('[data-swt-editor]')) {
        // Declarative initialization will handle it
        return;
    }
    window.editor = new TourEditor();
    await window.editor.init();
});

export default TourEditor;
export { EditorEvents } from './event-emitter.js';
