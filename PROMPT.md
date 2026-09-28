# AAC on a Pinch — Build Prompt

Use this as the starting prompt for Claude Code to build the app.

---

## What this is

"AAC on a Pinch" is a backup communication tool for a non-verbal person, used when
their regular AAC (Augmentative and Alternative Communication) device isn't
available. It presents a small set of choices (2 to 6) as large tappable tiles —
each with a picture and a spoken word/phrase — so the person can make a choice
in the moment.

Example: a caregiver has pre-set up a board with two tiles, "This ride" and
"That ride" (each with a photo of the ride). At the amusement park, without the
AAC device on hand, they hand over the phone and the person taps the tile for
the ride they want, which speaks the word aloud.

The person setting up boards ahead of time (photos, recordings) is typically a
caregiver/parent — referred to below as "the user" for setup flows. The tiles
are tapped by the non-verbal person in the moment.

## Core requirements

- **Fully offline, fully local.** No account, no login, no cloud storage, no
  sync, no network calls of any kind after the app is installed. Everything —
  images, audio, board configuration — is stored on-device. This is the whole
  point: it must work with no signal and no backend to depend on.
- **Android phone, installed to the home screen.** Build as a PWA (Progressive
  Web App) — installable via the browser's "Add to Home Screen," works offline
  via a service worker. No Play Store, no native build tooling.
- **Single device.** No multi-device sync in v1.

## Two modes

### 1. Setup / Edit mode

Where the user builds and edits boards ahead of time.

- Create a "board" = a set of 2 to 6 options.
- For each option (tile):
  - **Image**: either upload an existing photo from the device, or capture a
    new one with the camera (`<input type="file" accept="image/*" capture>`).
  - **Label/word**: a short text label for the option (e.g. "This ride").
  - **Audio**: either
    - record their own voice saying the word/phrase (`MediaRecorder` API,
      stored as a local blob), with the ability to re-record/preview/delete, or
    - fall back to the browser's built-in text-to-speech (Web Speech API
      `SpeechSynthesis`) reading the label aloud, for tiles where no recording
      was made.
- Ability to create multiple boards (e.g. "Rides," "Snacks," "Yes or No") and
  switch between them.
- Ability to edit or delete existing tiles/boards later.

### 2. Choice mode (the "in a pinch" screen)

What's handed to the non-verbal person in the moment.

- Large, high-contrast, easy-to-tap grid of tiles (2–6, laid out cleanly for
  any count — e.g. 2 tiles side by side, up to a 2x3 or 3x2 grid for 6).
- Each tile shows the image full-bleed with the label visible.
- Tapping a tile plays its audio (recorded voice, or TTS fallback) immediately.
  Large touch targets, no accidental double-actions.
- Fast board switching (in case more than one board is relevant) without
  dropping back into setup/edit flows.
- Should be usable one-handed, glanceable, and forgiving of imprecise taps —
  this is used in stressful/loud/public moments, not a calm setup session.

## Suggested architecture

- **App shell**: PWA — plain HTML/CSS/JS (framework optional, keep it light).
  `manifest.json` + service worker for installability and offline caching of
  app assets.
- **Storage**: IndexedDB for board/tile metadata and for image + audio blobs.
  No filesystem/cloud storage APIs.
- **Voice recording**: `MediaRecorder` API → store as blob (webm/opus or
  similar).
- **Voice fallback**: Web Speech API `SpeechSynthesis`, using the tile's label
  as the utterance text, when no recording exists for that tile.
- **Images**: file input with `capture` attribute for camera access, or normal
  gallery picking; stored as blobs.
- **Hosting**: static hosting only (e.g. GitHub Pages, Cloudflare Pages) — no
  backend service, no compute, no database service. The hosted files are just
  the app shell; all user data stays in the browser's local storage on the
  phone.

## Explicitly out of scope for v1

- Cloud backup, sync, or multi-device support.
- Accounts/authentication.
- Sharing boards between users/devices.
- Analytics or telemetry of any kind.
