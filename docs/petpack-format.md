# Pet Pack Format

Pet Pack is the portable asset format used by Petsona Player and Petsona Studio. Files use the `.petpack` extension and are ZIP archives with a required `manifest.json`.

## Goals

- Portable across Petsona Player installs.
- Easy for Petsona Studio to generate.
- Validatable before import.
- Versioned so future renderers can evolve without breaking older packs.
- Neutral to animal type, character type, and visual style.

## File Extension

```text
.petpack
```

Example:

```text
my-dog.petpack
space-character.petpack
```

## Package Layout

```text
example.petpack
├── manifest.json
├── assets/
│   ├── idle.webp
│   ├── blink.webp
│   ├── click.webp
│   └── look-around.webp
├── previews/
│   ├── thumbnail.webp
│   └── preview-low.webp
└── license.txt
```

Only `manifest.json` and at least one renderable action asset are required for V1. `license.txt`, previews, and advanced actions are optional.

## Manifest V1

```json
{
  "schemaVersion": 1,
  "id": "petsona.example.dog",
  "name": "Example Dog",
  "author": "Petsona Studio",
  "createdAt": "2026-06-16T00:00:00.000Z",
  "renderer": {
    "type": "webp-sequence",
    "width": 512,
    "height": 512,
    "defaultScale": 1
  },
  "actions": {
    "idle": {
      "type": "webp",
      "src": "assets/idle.webp",
      "fps": 12,
      "loop": true
    },
    "blink": {
      "type": "webp",
      "src": "assets/blink.webp",
      "fps": 12,
      "loop": false,
      "trigger": "idle-random"
    },
    "click": {
      "type": "webp",
      "src": "assets/click.webp",
      "fps": 12,
      "loop": false,
      "trigger": "click"
    }
  },
  "interaction": {
    "hitPadding": 72,
    "buttons": [
      {
        "id": "pat",
        "label": "Pat",
        "reply": "That feels nice."
      }
    ],
    "replies": [
      "I'm here."
    ]
  },
  "preview": {
    "thumbnail": "previews/thumbnail.webp",
    "lowResolution": "previews/preview-low.webp"
  },
  "entitlements": {
    "tier": "basic",
    "commercialUse": false,
    "watermarked": false
  }
}
```

## Required Fields

- `schemaVersion`: must be `1` for the first supported format.
- `id`: stable package identifier.
- `name`: display name in Petsona Player.
- `renderer.type`: V1 supports `webp-sequence`.
- `renderer.width`: positive integer.
- `renderer.height`: positive integer.
- `actions`: object containing at least `idle`.
- `actions.idle.src`: path to a package-local asset.

## Action Types

V1 supports:

- `idle`: default loop.
- `blink`: short non-looping idle variation.
- `click`: short non-looping response to click.
- `drag`: looping response while the user holds and drags the pet.

Post-V1 supports:

- `lookAround`: pointer-follow or directional head-turn animation.
- `hover`: short response when pointer enters the pet hit area.
- `sleep`: idle state after long inactivity.
- `message`: animation used when a text bubble appears.

## Validation Rules

Importer must reject a pack when:

- `manifest.json` is missing.
- `schemaVersion` is unsupported.
- Required fields are missing.
- Asset paths escape the package root.
- Required asset files are missing.
- Renderer dimensions are invalid.
- Action definitions use unsupported types.

Importer should warn, but still import, when:

- Preview files are missing.
- Optional actions are missing.
- Entitlement metadata is missing.

## V1 Import Behavior

Petsona Player should:

1. Read and validate `manifest.json`.
2. Copy the original `.petpack` into the user data directory.
3. Extract or cache renderable assets into app-managed storage.
4. Add the pack to the pet library.
5. Set the pack active when the user imports it from an explicit action.
6. Fall back to the bundled default pet if the active pack cannot render.

## Compatibility

Future schema versions should be additive when possible. Breaking changes should introduce a new `schemaVersion` and clear upgrade behavior in Petsona Player.
