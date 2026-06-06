---
name: senangwebs-tour
description: A-Frame based 360-degree virtual tour system with a visual no-code editor and a lightweight embeddable viewer.
version: 1.0.19
package: senangwebs-tour
---

# SenangWebs Tour (SWT)

## Quick Reference

- **Purpose**: 360-degree virtual tour viewer and visual editor built on A-Frame WebVR
- **Entry**: `dist/swt.js`
- **Dependencies**: `@bookklik/senangstart-icons`; peer: `aframe ^1.7.1`
- **Scripts**: `npm run build` (rollup), `npm run dev` (rollup watch), `npm run serve` (http-server)

## Workflow

Start in `C:\wamp64\www\sw-libraries\senangwebs-tour`. Read `README.md`, `package.json`, and touched source files. Match existing patterns, CSS prefix `swt-`. **A-Frame/WebVR library — verify 360 rendering and hotspot interaction after changes.**

## JavaScript API — Viewer

```js
const tour = new SWT.Tour(sceneElement, config)
// config: { scenes: [{ id, panorama, hotspots: [...] }] }

tour.start()
tour.navigateTo(sceneId)
tour.getCurrentSceneId()
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
      action: { type: 'navigateTo', target: 'scene-id' },
      appearance: { color, scale },
      tooltip: { text: 'Hotspot label' },
      cameraOrientation: { x, y, z }
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
PreviewController       // live preview
UIController            // UI panels
ProjectStorageManager   // save/load projects
ExportManager           // export to JSON or standalone HTML
```

## Focus Areas

- A-Frame scene management: panorama spheres, camera rig, hotspot entities
- Visual editor: click-to-place hotspots on 360 panoramas, drag to reposition
- Lightweight viewer: 12KB minified, standalone HTML export
- Hotspot interactions: navigate between scenes, open links, show info panels
- Mobile and VR-ready: works with Cardboard, Oculus, etc.
- JSON export/import for project portability
- Asset loading: progressive panorama loading

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
npm run build      # rollup build
npm run serve      # http-server on port 8080 for manual testing
```
