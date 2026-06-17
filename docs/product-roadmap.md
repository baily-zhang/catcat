# Petsona Product Roadmap

Petsona turns a pet or character image into an interactive desktop companion. The product is built around one reusable desktop player, AI-generated Pet Packs, and a web studio that sells generation and export rights through Creem.

## Product Model

- **Petsona Player**: the desktop app users install once. It renders pets, handles desktop interaction, imports local `.petpack` files, and later syncs with a user account.
- **Petsona Studio**: the web generation surface. Users upload images, preview AI output, pay for export rights, and download Pet Packs.
- **Pet Pack**: a portable asset package with a `.petpack` extension. It contains a manifest, transparent animation assets, thumbnails, and interaction metadata.
- **Creem**: payment and subscription provider for one-time packs, subscriptions, and entitlement webhooks.

## Commercial Loop

Free users can upload an image, generate a low-resolution or watermarked preview, and try default pets in Petsona Player.

Paid users can export high-resolution Pet Packs, unlock interaction actions, remove watermarks, use more monthly generations, sync packs across devices, access commercial licensing, and buy marketplace packs.

Initial product tiers:

- **Basic Pet Pack**: one-time purchase. Includes idle, blink, and click actions.
- **Interactive Pet Pack**: one-time purchase. Adds look-around, pointer-follow, and expression actions.
- **Petsona Pro**: subscription. Includes monthly generation credits, high-resolution exports, sync, commercial license options, and priority queueing.

## V1 Scope

V1 should prove the smallest paid workflow:

1. User uploads a source image in Petsona Studio.
2. The backend creates a generation job.
3. Seedance generates a basic animation video.
4. The processing pipeline extracts frames, removes background, and builds transparent assets.
5. The system generates a valid `.petpack`.
6. The web page shows a low-resolution preview.
7. The user unlocks export through Creem test mode or an internal paid flag.
8. The user downloads the `.petpack`.
9. Petsona Player imports the `.petpack`.
10. The imported pet can idle, blink, and respond to click.

Out of V1:

- Account sync.
- Public marketplace.
- Multi-device sync.
- Real subscription quota enforcement.
- Per-user custom app builds.
- Creator revenue sharing.

## Epics And Stories

### Epic 1: Petsona Player

Goal: make the desktop app a reusable Pet Pack player instead of a single hardcoded pet.

Stories:

1. Define the `.petpack` package structure and manifest contract.
2. Validate Pet Pack manifests before import.
3. Import local `.petpack` files from a file picker.
4. Import local `.petpack` files by drag and drop.
5. Copy imported packs into the app user data directory.
6. Persist active pet, window size, and window position.
7. Render idle, blink, and click actions from imported packs.
8. Add a basic pet library panel with select and delete.
9. Show clear import errors for unsupported versions, missing assets, and invalid manifests.
10. Preserve bundled default pet behavior as a fallback.
11. Support look-around and pointer-follow actions.
12. Add automated validation tests for manifest parsing.

V1 stories: 1, 2, 3, 4, 5, 6, 7, 9, 10.

### Epic 2: Petsona Studio

Goal: provide the web workflow for upload, preview, paid unlock, and download.

Stories:

1. Upload a source image.
2. Create a generation job.
3. Display job state: queued, generating, processing, completed, failed.
4. Show a low-resolution preview when the job completes.
5. Download the generated `.petpack` after entitlement is granted.
6. Show a user's generation history.
7. Retry failed jobs.
8. Let users select Basic, Interactive, or Pro output.

V1 stories: 1, 2, 3, 4, 5.

### Epic 3: AI Generation Pipeline

Goal: turn an uploaded image into transparent desktop pet assets.

Stories:

1. Create Seedance prompt templates for Basic Pet Pack actions.
2. Call Seedance to generate animation video from an uploaded image.
3. Store raw generation output.
4. Extract frames from generated video.
5. Remove solid-color or green-screen background without damaging white, gray, whisker, mouth, or ear detail.
6. Build transparent WebP animation assets.
7. Generate `manifest.json`.
8. Generate preview thumbnail and low-resolution preview.
9. Validate output frame count, dimensions, alpha coverage, and loop quality.
10. Package assets into `.petpack`.
11. Log failures with enough context for retry/debugging.
12. Add fixture-based pipeline tests.

V1 stories: 1, 2, 3, 4, 5, 6, 7, 8, 9, 10.

### Epic 4: Creem Payments And Entitlements

Goal: convert preview interest into paid export rights.

Stories:

1. Define products: Basic Pet Pack, Interactive Pet Pack, Petsona Pro.
2. Create Creem checkout sessions.
3. Handle Creem payment success webhooks.
4. Handle Creem subscription lifecycle webhooks.
5. Store orders and entitlements.
6. Allow free users to view only low-resolution or watermarked previews.
7. Allow entitled users to download high-resolution `.petpack` files.
8. Enforce monthly generation credits for subscriptions.
9. Show billing and download history.
10. Add webhook signature verification tests.

V1 stories: 1, 2 in test mode, 3, 5, 6, 7.

### Epic 5: Account And Sync

Goal: make purchased pets portable across devices and sessions.

Stories:

1. Add user authentication.
2. Store generated packs in a user library.
3. Let Petsona Player log into a user account.
4. Sync purchased packs into Petsona Player.
5. Restore purchases on a new device.
6. Delete or archive packs.
7. Sync active pet and basic settings.
8. Sync subscription status.

V1 stories: none.

### Epic 6: Marketplace And Licensing

Goal: grow beyond single-user generation into a pack ecosystem.

Stories:

1. Publish official Pet Packs.
2. Create pack detail pages.
3. Sell marketplace packs.
4. Add commercial license flags.
5. Review and moderate submitted packs.
6. Add reporting.
7. Add creator payouts.
8. Add merchandising and featured collections.

V1 stories: none.

## Suggested First Commit Sequence

1. `docs: define petsona roadmap`
2. `docs: specify petpack format`
3. `chore: rename app metadata to petsona`
4. `feat: add petpack manifest validation`
5. `feat: import petpack files into player storage`
6. `feat: render imported petpack actions`
7. `feat: support petpack drag and drop import`
8. `test: cover petpack manifest validation`

