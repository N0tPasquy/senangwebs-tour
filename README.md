# SenangWebs Tour (SWT)

A powerful, data-driven 360° virtual tour system built on A-Frame WebVR. Create immersive virtual tours with a visual editor, or integrate the lightweight viewer library into your own projects.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE.md)
[![Built with A-Frame](https://img.shields.io/badge/Built%20with-AFrame-ef2d5e.svg)](https://aframe.io/)
[![Built with SenangStart Icons](https://img.shields.io/badge/Built%20with-SenangStart%20Icons-2563EB.svg)](https://github.com/bookklik-technologies/senangstart-icons)

| viewer                                                                                                        | editor                                                                                                        |
| ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| ![SenangWebs Tour Preview](https://raw.githubusercontent.com/a-hakim/senangwebs-tour/master/swt_preview2.png) | ![SenangWebs Tour Preview](https://raw.githubusercontent.com/a-hakim/senangwebs-tour/master/swt_preview1.png) |

## Table of Contents

- [Features](#-features)
- [Quick Start](#-quick-start)
  - [Using the Visual Editor](#using-the-visual-editor-no-coding-required)
  - [Integrating with Code](#integrating-with-code-viewer-library)
- [Custom Editor Integration](#-custom-editor-integration)
  - [Declarative Mode](#option-1-declarative-mode-html-attributes)
  - [Programmatic Mode](#option-2-programmatic-mode-javascript-api)
- [Building from Source](#️-building-from-source)
- [API Documentation](#-api-documentation)
- [Editor Features](#-editor-features)
- [Browser Compatibility](#-browser-compatibility)
- [Documentation](#-documentation)
- [Contributing](#-contributing)
- [License](#-license)

## Features

### Core Capabilities

- **Visual Editor** - No-code tour builder with click-to-place hotspot interface
- **Viewer Library** - JavaScript library for embedding tours
- **Standalone Viewer** - HTML viewer with drag-and-drop JSON support
- **Mobile & VR Headset Ready** - Designed for VR headsets with phone inside (hands-free reticle gaze interaction, no screen touches needed)
- **Gaze Navigation Hotspots** - Automatic navigation upon holding gaze on an icon hotspot with animated circular countdown ring
- **Gaze Image Hotspots** - Immersive navigation hotspots displaying a custom photo that zooms in over the gaze duration to fill the view, transitioning into the next scene
- **Static 3D Photos & In-Scene Cards** - Photos placed in 3D space with native aspect ratio; hands-free VR "In grande" 3D card view (photo on left, title & description on right, close 'X' with 2-second gaze countdown)
- **Background Audio Loop** - Seamless looping ambient audio track with a comfortable scaled volume ceiling (35% maximum output for non-intrusive listening), live volume adjustments, and automatic autoplay policy unlocking on user interaction
- **Dynamic Hotspot Scaling** - Scale hotspots and photos with proportional title position and dimension adjustment
- **Customizable Hotspots** - Custom icons, colors, scales, and title text
- **Multiple Export Formats** - JSON configuration or standalone HTML files

### Developer-Friendly

- **Two Integration Modes** - Declarative (HTML attributes) or Programmatic (JavaScript API)
- **Modular Architecture** - Six-controller editor pattern with clear separation of concerns
- **Event System** - React to scene loads, hotspot clicks, and navigation events
- **Data-Driven** - Pure JSON configuration, no internal state management
- **Built with Rollup** - Modern ES6+ modules with sourcemaps for debugging

## Quick Start

### Using the Visual Editor (No Coding Required)

1. **Build and Start Local Server**:

   ```bash
   npm install
   npm run build   # generate the dist/ bundles
   npm run serve   # serve on http://localhost:8080
   ```

   > `npm run dev` only watches/rebuilds the bundles - it does not start a server.
   > Use `npm run serve` (or any static file server) alongside it during development.

2. **Open Editor**: Navigate to `http://localhost:8080/examples/editor.html`

3. **Create Your Tour**:

   - Click **"Add Scene"** and upload 360° panorama images (JPG/PNG)
   - Click **"Add Hotspot"** then click on the preview to place navigation points
   - Configure hotspot properties: color, scale, tooltip text, target scene
   - See changes instantly in the live A-Frame preview

4. **Export Your Tour**:

   - **JSON Export** → Portable config file for library integration
   - **Viewer Export** → Standalone HTML file (loads the runtime from a pinned CDN version)

5. **Test Standalone Viewer**: Open `http://localhost:8080/examples/viewer.html` and drag-and-drop your exported JSON

### Integrating with Code (Viewer Library)

**Minimal Example** (see `examples/example-simple.html`):

```html
<!DOCTYPE html>
<html>
  <head>
    <script src="https://unpkg.com/senangwebs-tour@latest/dist/swt.min.js"></script>
  </head>
  <body>
    <a-scene id="tour-scene">
      <a-camera><a-cursor></a-cursor></a-camera>
    </a-scene>

    <script>
      const config = {
        initialScene: "room1",
        scenes: {
          room1: {
            name: "Living Room",
            panorama: "path/to/panorama1.jpg",
            hotspots: [
              {
                position: { x: 5, y: 0, z: -5 },
                action: { type: "navigateTo", target: "room2" },
                appearance: { color: "#FF6B6B", scale: 1.5 },
                tooltip: { text: "Go to Kitchen" },
              },
            ],
          },
          room2: {
            name: "Kitchen",
            panorama: "path/to/panorama2.jpg",
            hotspots: [
              {
                position: { x: -5, y: 0, z: 5 },
                action: { type: "navigateTo", target: "room1" },
                appearance: { color: "#4ECDC4", scale: 1.5 },
                tooltip: { text: "Back to Living Room" },
              },
            ],
          },
        },
      };

      const scene = document.querySelector("#tour-scene");
      scene.addEventListener("loaded", () => {
        const tour = new SWT.Tour(scene, config);
        tour.addEventListener("scene-loaded", (e) => {
          console.log("Now viewing:", e.detail.sceneId);
        });
        tour.start();
      });
    </script>
  </body>
</html>
```

## Custom Editor Integration

Build your own tour editor using the `swt-editor.js` bundle. Two initialization modes are supported:

### Option 1: Declarative Mode (HTML Attributes)

**Zero JavaScript** - perfect for quick prototypes:

```html
<!DOCTYPE html>
<html>
  <head>
    <script src="https://unpkg.com/senangwebs-tour@latest/dist/swt.js"></script>
    <script src="https://unpkg.com/senangwebs-tour@latest/dist/swt-editor.js"></script>
    <link
      rel="stylesheet"
      href="https://unpkg.com/senangwebs-tour@latest/dist/swt-editor.css"
    />
  </head>
  <body>
    <!-- Auto-initializes on page load -->
    <div
      data-swt-editor
      data-swt-auto-init="true"
      data-swt-project-name="My Virtual Tour"
    >
      <div data-swt-scene-list></div>
      <div data-swt-preview-area></div>
      <div data-swt-properties-panel></div>
    </div>
  </body>
</html>
```

**Supported HTML Attributes:**
| Attribute | Description | Default |
|-----------|-------------|---------|
| `data-swt-editor` | Marks the editor container (required) | - |
| `data-swt-auto-init` | Auto-initialize on DOMContentLoaded | `false` |
| `data-swt-project-name` | Initial project name | `"Untitled Tour"` |
| `data-swt-auto-save` | Enable LocalStorage auto-save | `false` |
| `data-swt-auto-save-interval` | Auto-save interval (milliseconds) | `30000` |
| `data-swt-scene-list` | Scene list panel container | - |
| `data-swt-preview-area` | A-Frame preview container | - |
| `data-swt-properties-panel` | Hotspot properties panel | - |

**Example:** `examples/editor-declarative.html`

### Option 2: Programmatic Mode (JavaScript API)

**Full control** - for custom workflows and advanced integrations:

```html
<!DOCTYPE html>
<html>
  <head>
    <script src="https://unpkg.com/senangwebs-tour@latest/dist/swt.js"></script>
    <script src="https://unpkg.com/senangwebs-tour@latest/dist/swt-editor.js"></script>
    <link
      rel="stylesheet"
      href="https://unpkg.com/senangwebs-tour@latest/dist/swt-editor.css"
    />
  </head>
  <body>
    <div id="editor-container">
      <div id="scenes"></div>
      <div id="preview"></div>
      <div id="properties"></div>
    </div>

    <script>
      // Create editor instance with custom config
      const editor = new TourEditor({
        projectName: "My Custom Tour",
        autoSave: true,
        autoSaveInterval: 30000,
      });

      // Initialize with DOM elements
      editor.init({
        sceneListElement: document.getElementById("scenes"),
        previewElement: document.getElementById("preview"),
        propertiesElement: document.getElementById("properties"),
      });

      // Subscribe to editor events via the event emitter
      editor.on(EditorEvents.SCENE_ADD, (data) => {
        console.log("New scene:", data.scene.name);
      });

      // Export tour configuration
      const config = editor.exportManager.generateJSON();
    </script>
  </body>
</html>
```

`EditorEvents` is exposed globally by `swt-editor.js` (e.g. `EditorEvents.SCENE_ADD` = `"scene:add"`). See the `EditorEvents` map in the source for all available event names.

**Available Classes** (all attached to `window` after loading `swt-editor.js`):

- `TourEditor` - Main coordinator, orchestrates all managers
- `SceneManagerEditor` - Scene CRUD operations
- `HotspotEditor` - Hotspot placement and editing
- `PreviewController` - A-Frame preview rendering
- `UIController` - DOM rendering and updates
- `ProjectStorageManager` - LocalStorage persistence
- `ExportManager` - JSON and HTML export

**Examples:**

- `examples/editor-declarative.html` - Declarative HTML-only mode
- `examples/editor.html` - Full-featured programmatic editor

## Building from Source

### Installation & Build

```bash
# Install dependencies
npm install

# Build all bundles (viewer + editor)
npm run build

# Development mode (watch for changes)
npm run dev
```

## API Documentation

### Viewer Library API

#### Constructor

```javascript
new SWT.Tour(aframeSceneElement, tourConfiguration);
```

**Parameters:**

- `aframeSceneElement` (HTMLElement) - A-Frame `<a-scene>` DOM element
- `tourConfiguration` (Object) - Tour config (see structure below)

**Returns:** `Tour` instance

---

#### Configuration Structure

Both the editor and viewer use the same data format. Scenes are stored as an **array**:

```javascript
{
  initialScene: "scene-id",       // Required: Starting scene ID
  cursor: ".custom-cursor",        // Optional: Cursor selector or false to disable
  audio: {                         // Optional: Background audio configuration
    url: "ambient.mp3",            // Required: Audio URL or base64 data URL
    volume: 0.5,                   // Optional: Baseline volume (0.0 to 1.0, default: 0.5)
    loop: true                     // Optional: Loop playback continuously (default: true)
  },
  scenes: [                        // Required: Array of scenes
    {
      id: "scene-id",              // Required: Scene identifier
      name: "Scene Name",          // Required: Display name
      panorama: "url-or-dataurl",  // Required: Image URL or base64
      mediaType: "video",          // Optional: Force video handling when the URL has no recognizable extension
      thumbnail: "url",            // Optional: Thumbnail for editor
      startingPosition: {          // Optional: Initial camera orientation
        pitch: 0.1,                // Vertical angle (radians)
        yaw: 1.5                   // Horizontal angle (radians)
      },
      hotspots: [                  // Optional: Array of hotspots
        {
          id: "hotspot-1",         // Optional: Auto-generated if omitted
          position: {              // Required: 3D coordinates
            x: 10,
            y: 1.5,
            z: -3
          },
          action: {                // Required: Hotspot action
            type: "gazeNavigate",  // "gazeNavigate" | "gazeImage" | "photo"
            target: "scene-id-2",  // Required for gazeNavigate & gazeImage: Target scene ID
            duration: 3000,        // Optional for gazeNavigate & gazeImage: Countdown in ms (default: 3000)
            url: "photo.jpg"       // Required for gazeImage & photo: Image URL or data URL
          },
          appearance: {            // Optional: Visual customization
            color: "#00ff00",      // Default: "#00ff00" (or "#ffffff" for photos)
            scale: "1.5 1.5 1.5",  // Scalar number (e.g. 1.5) or 3D vector string
            icon: "arrow",         // Icon name, image URL, or thumbnail data URL
            aspectRatio: 1.778     // Optional: Calculated aspect ratio (width / height) for photos
          },
          tooltip: {               // Optional: Hover/focus text
            text: "Click here",    // Tooltip title
            description: "Details" // Optional: Extended description
          },
          cameraOrientation: {     // Optional: Camera direction when created
            pitch: -0.02,          // Vertical angle (radians)
            yaw: 2.06              // Horizontal angle (radians)
          }
        }
      ]
    }
  ]
}
```

**Important Notes:**

- `scenes` is an **array** (not an object)
- The library also accepts `scenes` as an object keyed by ID for backward compatibility
- Hotspot `position` is in 3D space (typically on 10-unit sphere surface)
- `audio.volume` represents baseline volume (`0.0`–`1.0`, default `0.5`). To guarantee a comfortable, non-intrusive ambient background soundtrack, the runtime scales actual output volume by `0.35` (`actualOutputVolume = volume * 0.35`). For example, 100% slider outputs 35% actual volume, and 50% default outputs 17.5% volume.

---

#### Methods

##### `tour.start()`

Initialize and start the tour. Loads the initial scene and sets up internal event
listeners. Calling it again restarts the tour from `initialScene`; it also works
after `tour.destroy()`.

**Returns:** `Promise<void>`

**Example:**

```javascript
const tour = new SWT.Tour(sceneElement, config);
tour.start();
```

---

##### `tour.navigateTo(sceneId)`

Navigate to a specific scene by ID.

**Parameters:**

- `sceneId` (String) - Target scene ID (must exist in `scenes` object)

**Returns:** `Promise<void>`

**Example:**

```javascript
tour.navigateTo("bedroom"); // Loads scene with id "bedroom"
```

---

##### `tour.getCurrentSceneId()`

Get the ID of the currently active scene.

**Returns:** `String` - Current scene ID

**Example:**

```javascript
const currentScene = tour.getCurrentSceneId();
console.log("Viewing:", currentScene); // "living-room"
```

---

##### `tour.destroy()`

Clean up and remove the tour. Removes all hotspots, internal event listeners, and
managed assets, then resets the current scene. It is safe to call more than once.
The same instance can be started again with `tour.start()`.

**Returns:** `void`

**Example:**

```javascript
tour.destroy(); // Cleanup before removing from DOM
```

---

##### `tour.openPhotoModal(actionData)`

Open a full-screen responsive modal dialog displaying a static photo with title and description.
The modal includes accessible styling (white background card, dismiss button, backdrop click, and Escape key).

**Parameters:**

- `actionData` (Object) - Object containing:
  - `url` (String) - High-resolution image URL or data URL
  - `title` (String, optional) - Modal heading
  - `description` (String, optional) - Detailed caption or body text

**Returns:** `void`

**Example:**

```javascript
tour.openPhotoModal({
  url: "assets/artwork.jpg",
  title: "Ancient Sculpture",
  description: "Discovered in the northern gallery during the 1924 excavation."
});
```

---

##### `tour.closePhotoModal()`

Close the active photo modal dialog and clean up DOM listeners.

**Returns:** `void`

---

##### `tour.playAudio()`

Play or resume the looping background audio. Resolves when audio playback begins. If playback is blocked by browser autoplay policy, it automatically starts upon the user's first touch, click, or key press.

**Returns:** `Promise<void>`

**Example:**

```javascript
tour.playAudio().catch((err) => {
  console.log("Autoplay waiting for user gesture:", err);
});
```

---

##### `tour.pauseAudio()`

Pause background audio playback.

**Returns:** `void`

**Example:**

```javascript
tour.pauseAudio();
```

---

##### `tour.stopAudio()`

Stop background audio playback and rewind to the start (`currentTime = 0`).

**Returns:** `void`

**Example:**

```javascript
tour.stopAudio();
```

---

##### `tour.setAudioVolume(volume)`

Adjust background audio volume dynamically. The value is clamped between `0.0` and `1.0`, and output volume is scaled relative to the 35% maximum output ceiling.

**Parameters:**

- `volume` (Number) - Baseline volume level between `0.0` (mute) and `1.0` (35% maximum output)

**Returns:** `void`

**Example:**

```javascript
tour.setAudioVolume(0.5); // Sets actual volume to 0.5 * 0.35 = 0.175
```

---

##### `tour.setAudio(audioConfig)`

Dynamically update or replace the background audio configuration. Replaces track, restarts playback if already playing, or removes audio completely if passed `null`.

**Parameters:**

- `audioConfig` (Object|null) - Object with `{ url, volume, loop }`, or `null` to remove audio

**Returns:** `void`

**Example:**

```javascript
// Replace track
tour.setAudio({
  url: "assets/new-ambient.mp3",
  volume: 0.5,
  loop: true
});

// Remove audio
tour.setAudio(null);
```

---

##### `tour.cleanupAudio()`

Stop playback, release audio resources, and remove autoplay unlock event listeners.

**Returns:** `void`

---

##### `tour.addEventListener(eventName, callback)`

Listen to tour events. Custom event system (not DOM events).

**Parameters:**

- `eventName` (String) - Event name (see Events section)
- `callback` (Function) - Handler function receiving event object

**Returns:** `void`

**Example:**

```javascript
tour.addEventListener("scene-loaded", (event) => {
  console.log("Scene:", event.detail.sceneId);
});
```

---

#### Events

All events include a `detail` object with event-specific data.

##### `tour-started`

Fired when `tour.start()` is called.

**Detail:**

```javascript
{
  sceneId: String; // Initial scene ID
}
```

---

##### `scene-loading`

Fired before a scene begins loading.

**Detail:**

```javascript
{
  sceneId: String; // ID of scene being loaded
}
```

---

##### `scene-loaded`

Fired after a scene is fully loaded and rendered.

**Detail:**

```javascript
{
  sceneId: String; // ID of loaded scene
}
```

---

##### `hotspot-activated`

Fired when a hotspot is clicked/activated.

**Detail:**

```javascript
{
  hotspotData: Object, // Full hotspot configuration
  sceneId: String;     // Current scene ID
}
```

---

#### Usage Example

```javascript
const scene = document.querySelector("#vr-scene");
const tour = new SWT.Tour(scene, {
  initialScene: "room1",
  scenes: {
    room1: {
      name: "Living Room",
      panorama: "360-living-room.jpg",
      hotspots: [
        {
          position: { x: 5, y: 0, z: -5 },
          action: { type: "navigateTo", target: "room2" },
          appearance: { color: "#FF6B6B" },
          tooltip: { text: "Kitchen" },
        },
      ],
    },
    room2: {
      name: "Kitchen",
      panorama: "360-kitchen.jpg",
      hotspots: [],
    },
  },
});

// Listen to events
tour.addEventListener("tour-started", (e) => {
  console.log("Tour started at:", e.detail.sceneId);
});

tour.addEventListener("scene-loading", (e) => {
  console.log("Loading scene:", e.detail.sceneId);
  // Show loading indicator
});

tour.addEventListener("scene-loaded", (e) => {
  console.log("Loaded:", e.detail.sceneId);
  // Hide loading indicator
});

tour.addEventListener("hotspot-activated", (e) => {
  console.log("Hotspot clicked:", e.detail.hotspotData.id);
  console.log("Navigating to:", e.detail.hotspotData.action.target);
});

// Start the tour
tour.start();

// Programmatic navigation
setTimeout(() => {
  tour.navigateTo("room2");
}, 5000);

// Cleanup
// tour.destroy();
```

## Editor Features

### Visual Tour Creation

- **Click-to-Place Hotspots** - Raycast-based placement on panorama sphere
- **Real-Time Preview** - Instant A-Frame rendering as you edit
- **Scene Management** - Add, remove, reorder scenes with thumbnails
- **Precise Camera Pointing (`🎯 Focus`)** - Smoothly orient the view directly to any selected hotspot in 3D space
- **Smart Deselection** - Deselect hotspots by clicking empty sky or toggling the sidebar list item
- **Protected Editor Mode** - Gaze countdowns and automatic navigation are safely deactivated in editor preview to prevent accidental scene changes while authoring
- **Manual "Go" Navigation** - Explicit `➔ Go` button in the sidebar to test scene transitions on demand
- **Background Audio Track** - Upload audio tracks (MP3/WAV/OGG converted to Base64 data URLs) or link external audio stream URLs. Includes a live volume slider (0% to 100%, defaulting to 50%), real-time percentage readout, one-click track removal, and automatic preview audio playback (plays when previewing, pauses on preview exit or Escape)

### Hotspot Configuration & Types

- **Three Action Types:**
  - **Classic Navigation (`navigateTo`)** - Standard click/tap navigation to target scenes
  - **Gaze Navigation (`gazeNavigate`)** - Hands-free VR navigation with customizable countdown timer (default: 3000ms) and animated circular countdown ring
  - **Static Photo (`photo`)** - Embed photos in 3D space with native aspect ratio (16:9, 4:3, 9:16 portrait, etc.). Hands-free VR navigation: gazing for 2 seconds (or clicking) opens an enlarged 3D Card (photo on left, title & description on right). Gazing at the top-right 'X' icon for 2 seconds closes the card and restores the original photo to its initial state.
- **Photo Upload & Optimization** - Dual-resolution processing: 512px lightweight thumbnail for 3D billboard quad and up to 1920px HD data URL for modal view
- **Dynamic Scale Controls** - Live slider (0.1x to 5.0x) and numeric input with automatic proportional tooltip scaling and height offset
- **3D Position** - Click-to-place or manual X/Y/Z coordinate input (radius clamped to 5 units)
- **Visual Customization** - Curated SenangStart icon grid or custom uploaded images, color picker, and real-time preview
- **Tooltips** - Real-time title and description editing with proportional billboard placement

### Data Management

- **LocalStorage Persistence** - Auto-save projects (configurable interval)
- **Import/Export** - Load and save tour JSON configurations
- **Data URLs** - Panoramas embedded as base64 (no external files needed)
- **Thumbnail Generation** - Auto-generated scene previews (100x50px)

### Export Options

1. **JSON Export** - Portable configuration file for library integration

   - Converts editor's `imageUrl` to library's `panorama` format
   - Compatible with `SWT.Tour` viewer library
   - Use in custom integrations or standalone viewer

2. **Viewer Export** - Standalone HTML file
   - Loads the pinned `swt.min.js` runtime from a CDN (requires internet access)
   - Includes full tour JSON configuration with icons baked in as data URLs
   - Panorama images are embedded as URLs/data URLs from the project
   - Drag-and-drop ready for distribution

   > Note: exported viewers need network access to load the library runtime
   > from unpkg. panoramas supplied as regular URLs are also fetched from
   > their source at view time.

### Developer Tools

- **ES6 Module Architecture** - Six-controller pattern with clear separation
- **Sourcemaps** - Debug original ES6 source in browser DevTools
- **Two Init Modes** - Declarative (HTML) or Programmatic (JS API)
- **Comprehensive Event System** - 30+ events including unified `change` event for any modification
- **Load/Export API** - `generateJSON()` and `loadJSON()` for round-trip data management
- **Global Access** - All classes attached to `window` for console debugging

## Browser Compatibility

| Browser       | Version     | Notes                          |
| ------------- | ----------- | ------------------------------ |
| Chrome        | 90+         | Recommended - best performance |
| Firefox       | 88+         | Full support                   |
| Safari        | 14+         | WebGL support required         |
| Edge          | 90+         | Chromium-based                 |
| Mobile Safari | iOS 14+     | Touch and gyroscope support    |
| Chrome Mobile | Android 90+ | Touch and gyroscope support    |

**Requirements:**

- WebGL 1.0 or higher
- ES6 module support (for editor)
- LocalStorage (for editor persistence)

**VR Headsets:**

- Oculus Quest 1/2/3
- Meta Quest Pro
- HTC Vive
- Valve Index
- Any WebXR-compatible headset

## Documentation

- **[EDITOR.md](./EDITOR.md)** - Complete guide to building custom editors
- **[.github/copilot-instructions.md](./.github/copilot-instructions.md)** - AI agent development instructions
- **[examples/](./examples/)** - Live code examples and demos

## Contributing

Contributions are welcome! Here's how you can help:

1. **Report Bugs** - Open an issue with reproduction steps
2. **Suggest Features** - Share your ideas in GitHub Issues
3. **Submit PRs** - Fork, create a feature branch, and submit a pull request
4. **Improve Docs** - Help make documentation clearer and more comprehensive

## License

MIT License - see [LICENSE.md](./LICENSE.md) for details.

## Acknowledgments

- **[A-Frame](https://aframe.io/)** - WebVR framework powering the 3D rendering
- **[Rollup](https://rollupjs.org/)** - Module bundler for clean ES6+ builds
