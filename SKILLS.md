---
name: senangwebs-tour
description: A-Frame based 360-degree virtual tour system with a visual no-code editor and a lightweight embeddable viewer.
version: 1.0.22
package: senangwebs-tour
---

# SenangWebs Tour (SWT)

## Quick Reference

- **Purpose**: 360-degree virtual tour viewer and visual editor built on A-Frame WebVR
- **Entry**: `dist/swt.js`, `dist/swt-editor.js`
- **Dependencies**: `@bookklik/senangstart-icons`; peer: `aframe ^1.7.1`
- **Scripts**: `docker compose up -d` (production editor container), `npm run build` (rollup), `npm run dev` (rollup watch), `npm run serve` (http-server)

## Workflow

Start in the project workspace root. Read `README.md`, `EDITOR.md`, `package.json`, and touched source files. Match existing patterns, CSS prefix `swt-`. **A-Frame/WebVR library — verify 360 rendering and hotspot interaction after changes.**

## JavaScript API — Viewer

```js
const tour = new SWT.Tour(sceneElement, config)
// config: { scenes: [{ id, panorama, hotspots: [...] }] }

tour.start()
tour.navigateTo(sceneId)
tour.getCurrentSceneId()
tour.openPhotoModal(actionData)   // open static photo modal view
tour.closePhotoModal()            // close photo modal view
tour.destroy()
tour.addEventListener('tour-started' | 'scene-loading' | 'scene-loaded' | 'hotspot-activated', callback)
```

`start()` and `navigateTo()` return promises. A tour instance can be restarted by
calling `start()` again, including after `destroy()`. `destroy()` is idempotent.

### Scene/Hotspot Data Model
```js
{
  scenes: [{
    id: 'scene1',
    panorama: 'url-to-360-image.jpg',
    hotspots: [{
      position: { x, y, z },
      action: {
        type: 'navigateTo' | 'gazeNavigate' | 'photo',
        target: 'scene-id',       // for navigateTo & gazeNavigate
        duration: 3000,           // for gazeNavigate (ms countdown)
        url: 'photo-hd.jpg',      // for photo modal view
        title: 'Title',           // optional for photo
        description: 'Details'    // optional for photo
      },
      appearance: {
        color: '#ff0000',
        scale: '1.5 1.5 1.5',    // scalar number or vector string
        icon: 'arrow',            // icon name, URL, or thumbnail
        aspectRatio: 1.778        // calculated width/height for photos
      },
      tooltip: { text: 'Hotspot label', description: 'Details' },
      cameraOrientation: { pitch, yaw }
    }]
  }]
}
```

## JavaScript API — Editor

```js
// Editor classes
TourEditor              // main editor controller
SceneManagerEditor      // scene CRUD
HotspotEditor           // hotspot placement/editing
PreviewController       // live preview & refreshHotspots()
UIController            // UI panels
ProjectStorageManager   // save/load projects
ExportManager           // export to JSON or standalone HTML
```

## Focus Areas

- A-Frame scene management: panorama spheres, camera rig, hotspot entities
- Visual editor: click-to-place hotspots on 360 panoramas, drag to reposition, `🎯 Focus` button
- Gaze navigation: hands-free VR navigation with circular countdown ring and configurable timer
- Static photo hotspots: 3D photo planes preserving native aspect ratio with hands-free in-scene 3D card view (photo on left, title & description on right, 2s gaze close on 'X')
- Hotspot resizing: live slider scaling with automatic proportional billboard tooltip adaptation
- Lightweight viewer: standalone HTML export with baked icon SVG data URLs
- Hotspot interactions: navigate between scenes, gaze countdown, in-scene photo cards with 2s gaze close
- Mobile and VR-ready: touch, mouse, Cardboard, Oculus, WebXR
- JSON export/import for project portability
- High performance: `refreshHotspots()` DOM updates without tearing down WebGL or reloading 360 panoramas

## Implementation Guidance

- Preserve backward compatibility for all API method names, event names, and data model structure
- Preserve viewer lifecycle behavior: repeated `start()` calls and `start()` after `destroy()` must work
- Keep `destroy()` safe to call more than once
- A-Frame is a peer dependency — never bundle it; declare clearly
- Test 360 rendering on desktop and mobile browsers
- Verify hotspot click accuracy at various viewport sizes
- Editor state persistence: save/load must maintain scene order, hotspot positions

## Validation

```bash
npm run build                      # rollup build
node tests/test-gaze-navigation.js  # 205 unit tests covering gaze, photo cards, scale, audio, and export
npm run serve                      # http-server on port 8089 for manual testing
```
