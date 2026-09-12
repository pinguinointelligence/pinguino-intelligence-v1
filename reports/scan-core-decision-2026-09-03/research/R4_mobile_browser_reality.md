# R4 — Device and Browser Reality for Continuous Camera Processing
## Mobile-web PWA scan core: iPhone Safari (iOS 17/18/26) and Android Chrome (2025–2026)

Compiled 2026-09-03. Tags: **[VERIFIED source]** = confirmed against a primary spec/vendor/browser-engine document with URL; **[REPORTED]** = credible engineering write-up, vendor KB, or bug-tracker discussion (may be anecdotal or single-source); **[INFERENCE]** = reasoned from adjacent verified facts, general architecture knowledge, or absence of contrary evidence, not directly document-confirmed. Version numbers are only stated when a primary source gave them; where sources conflicted or were silent, that is said explicitly rather than guessed.

A running note throughout: the task supplied first-hand probe results from **macOS Safari 26.5 (WebKit 605.1.15)** and **Chromium 148** on the same Mac. Those facts are treated as ground truth and reconciled against documentation below rather than re-derived. iOS Safari and macOS Safari share the same WebKit `MediaStream`/getUserMedia implementation almost entirely (the constraint surface is not platform-forked in WebKit source), so the macOS probe is strong evidence for iOS Safari 26.x behavior specifically for constraint *names*; hardware-dependent behavior (actual optical zoom, actual autofocus) differs because Mac webcams and iPhone camera modules are physically different.

---

## 1. getUserMedia constraints

**facingMode**
- STATUS — Safari iOS: supported since early WebRTC support (iOS 14.3+); Chrome Android: supported since Chrome for Android getUserMedia support. Both accept `user`/`environment`, `exact`/`ideal`. [VERIFIED — MDN/W3C mediacapture-main `MediaTrackConstraints.facingMode`, confirmed present in probe's `getSupportedConstraints()` on both engines]
- Notes: `facingMode: "environment"` does **not** guarantee which physical lens backs it. On some Android devices (see §5) it resolves to a wide-angle/ultrawide sensor rather than the primary wide lens with autofocus. [REPORTED — multiple `mebjas/html5-qrcode` GitHub issues, see §5]

**width / height / frameRate — iPhone defaults and maximum, 4K availability**
- STATUS — Safari iOS: an old (2019) Apple Developer Forums report states Safari on iOS "will only offer a video track of 720p, even when various high values for ideal constraints... are specified" [REPORTED, dated 2019 — https://forums.developer.apple.com/thread/113532]. I found **no 2024–2026 primary source confirming or refuting this ceiling still holds** on current iOS Safari; treat the 720p figure as historical, not verified current fact. **[INFERENCE / UNVERIFIED for 2024-2026]** — this should be device-tested before being relied on for a scan-core spec.
- STATUS — Chrome Android: no hard ceiling documented; actual delivered resolution/fps depends on device camera HAL and Chrome's `MediaTrackConstraints` negotiation. Common desktop default is 640×480/30fps absent constraints, mobile defaults vary by device. [REPORTED — general getUserMedia constraint literature, https://blog.addpipe.com/getusermedia-video-constraints/, https://webrtchacks.com/getusermedia-resolutions-3/]
- Notes: neither platform has a documented, stable "4K via getUserMedia" guarantee. This needs empirical device testing; do not architect a scan pipeline assuming 4K capture is reliably available on either engine. **[INFERENCE]**

**deviceId selection among multiple back cameras (wide/ultrawide/telephoto)**
- STATUS — Chrome Android: real, recurring, well-documented bug pattern. `facingMode: "environment"` frequently resolves to the wrong physical lens (fixed-focus ultrawide, or on some reports even the front camera) on Samsung Galaxy S20/S21/S22/S23-class devices. [REPORTED — https://github.com/mebjas/html5-qrcode/issues/881 ("Cannot scan codes on Samsung S20 and similar devices"), https://github.com/mozmorris/react-webcam/issues/365 ("always the camera with the wide angle that opens... facingMode: environment"), Samsung's own community forum thread on wide-angle-only capture via Chrome]
  - Documented workaround heuristic used by `html5-qrcode` maintainers/community: call `enumerateDevices()`, sort `videoinput` entries by `label`, and pick index 0 — on many Android/Chrome builds the label is literally `"camera2 0, facing back"`, where the trailing `0` identifies the manufacturer's primary (autofocus) rear sensor, distinct from the ultrawide/telephoto units enumerated afterward. [REPORTED, single detailed contributor account — https://github.com/mebjas/html5-qrcode/discussions/655]
  - `html5-qrcode`'s own guidance: avoid relying on `facingMode: "environment"` for scanning quality; enumerate and pick explicitly. [REPORTED — same discussion]
- STATUS — Safari iOS: no authoritative documentation found describing iPhone-side multi-lens `deviceId` enumeration behavior for barcode-scanning purposes specifically. One contributor in the above discussion stated iPhone "does not expose camera device lists" in a way their library could act on, but this was a single anecdotal, low-confidence claim, not a spec citation. **[REPORTED, single low-confidence source]** — do not treat as settled; iOS Safari has exposed multiple labeled back-camera `MediaDeviceInfo` entries (e.g., distinct wide/ultrawide/telephoto) in other developer reports historically, so this is a genuine open question requiring direct device testing rather than reliance on either claim.
- **Trap to record explicitly**: the failure mode described in the prompt (browser picks a fixed-focus or ultrawide lens that cannot focus at barcode-scanning distance) is **substantiated primarily as an Android/Samsung Camera2-API/Chrome interaction**, not as a universally-documented iPhone problem. [REPORTED]

**zoom**
- STATUS Safari iOS/macOS: WebKit shipped `zoom` in `MediaTrackCapabilities` in **Safari 17.0** (Sept 2023), per WebKit's own release notes: *"Improvements to WebRTC add support for InputDeviceInfo, the inbound rtp trackIdentifier stat field, exposing `zoom` in MediaTrackCapabilities, and getDisplayMedia video track clone resizing."* [VERIFIED source — https://webkit.org/blog/14445/webkit-features-in-safari-17-0/, corroborated by https://webkit.org/blog/14205/news-from-wwdc23-webkit-features-in-safari-17-beta/]. This is consistent with the probe: Safari 26.5's `getSupportedConstraints()` lists `zoom`.
  - **Conflicts with vendor write-ups**: Dynamsoft's own engineering blog states *"Camera zoom control on the web is limited to Chromium browsers... Firefox and iOS Safari do not support the zoom constraint"* and ships a CSS/WebGL "simulated zoom" fallback specifically because of this. [REPORTED — https://www.dynamsoft.com/codepool/auto-zoom-web-qr-code-scanner.html]. **This is stale relative to WebKit 17.0+** (or describes a different bar: constraint *recognized* vs. constraint *doing something useful*). See the trap note below.
- STATUS Chrome Android: zoom via PTZ constraints shipped starting **Chrome 87** for Android specifically (desktop got full pan/tilt/zoom; *"Android still supports zoom only"* as of that release). [VERIFIED source — https://web.dev/articles/camera-pan-tilt-zoom, W3C explainer https://github.com/w3c/mediacapture-image/blob/main/ptz-explainer.md]
- **Trap**: `getSupportedConstraints()` reporting a constraint name only means the UA recognizes the constraint key in the WebIDL dictionary — it does **not** mean the underlying camera hardware performs meaningful continuous optical zoom, or that `applyConstraints({zoom})` will visibly do anything on a given device. This is exactly the gap between the probe (name present) and vendor claims (feature "doesn't work" in practice). Test functionally, not just via `getSupportedConstraints()`. [INFERENCE from W3C spec semantics + the direct probe/vendor-doc conflict above]

**torch**
- STATUS Safari iOS/macOS: present by **Safari 17.5** at the latest — WebKit's 17.5 notes fix *"the camera pausing occasionally when torch is enabled,"* which presupposes torch already shipped. [VERIFIED source — surfaced via WebKit blog index; direct confirmation of the underlying feature's existence via the **Safari 18.4** release notes, which fix *"getUserMedia video track `getSettings()` returning a stale value for `torch` and `whiteBalanceMode` constraints"* — https://webkit.org/blog/16574/webkit-features-in-safari-18-4/]. Consistent with the probe (`torch` present in Safari 26.5's `getSupportedConstraints()`).
- STATUS Chrome Android: torch is a long-standing, widely-used capability in Android/Chromium QR-scanning libraries (`html5-qrcode` added dedicated torch support in a public PR). [REPORTED — https://github.com/mebjas/html5-qrcode/pull/570, https://scanapp.org/blog/2022/10/30/using-flash-or-torch-with-html5-qrcode.html]. I could not find an exact Chrome version number for initial torch support; treat as "available, version unconfirmed." [INFERENCE for exact version]
- Not supported on Firefox or desktop Safari-class webcams (no torch hardware). [REPORTED]

**focusMode / focusDistance**
- STATUS Chrome Android: **yes**, exposed via `MediaTrackConstraints`. Dynamsoft's engineering doc is explicit: *"The `getUserMedia` Constraints API supports `focusMode` (`continuous`, `manual`) and `focusDistance` on Chrome for Android — this is NOT available on desktop Chrome or iOS Safari."* [VERIFIED/REPORTED — https://www.dynamsoft.com/codepool/camera-focus-control-on-web.html]
- STATUS Safari iOS: **absent**. Confirmed both by the above vendor doc and directly by the probe (`focusMode`/`focusDistance` NOT in Safari 26.5's `getSupportedConstraints()`). [VERIFIED — probe + REPORTED vendor confirmation]
- **Discrepancy worth flagging**: the same Dynamsoft doc claims focusMode/focusDistance are Android-*only*, excluding desktop Chrome — yet the task's own probe shows **desktop Chromium 148 on macOS does list `focusMode`/`focusDistance`/`exposureMode`/`pointsOfInterest`** in `getSupportedConstraints()`. Reconciliation: Chromium's constraint-name surface is compiled uniformly across desktop and Android (same C++ implementation of the mediacapture-image extensions), so the *name* is recognized on desktop Chrome too; what Dynamsoft is really describing is that desktop webcams essentially never have autofocus motors to control, so the constraint is functionally inert there even though the browser lists it. This is the same name-vs-function gap noted under zoom. **[INFERENCE reconciling a direct probe/vendor conflict]**
- iOS Safari has no focus-control API whatsoever at any level (ImageCapture PhotoCapabilities also does not expose focus range on Safari — see §2). Per Dynamsoft: *"iOS Safari does not expose focus constraints — camera focus control on iPhone requires a native app wrapper."* [REPORTED]

**exposureMode / pointsOfInterest**
- STATUS Chrome Android/desktop Chromium: present as constraint names (confirmed by the Chromium 148 probe). Functional exposure/AF-point control on Android depends on device camera HAL exposing it through Camera2's `MeteringRectangle`s; not independently verified here. [INFERENCE from probe + general Chromium/mediacapture-image architecture]
- STATUS Safari iOS/macOS: absent — confirmed by probe (`exposureMode`, `pointsOfInterest` NOT listed) and by the general pattern that WebKit has not implemented the mediacapture-image "advanced imaging" constraint extensions beyond zoom/torch/whiteBalanceMode. [VERIFIED via probe; no WebKit release-note ever mentions exposureMode/pointsOfInterest shipping]
- Spec home for all of zoom/torch/focusMode/focusDistance/exposureMode/exposureCompensation/whiteBalanceMode/pointsOfInterest/colorTemperature/iso/brightness/contrast/saturation/sharpness: the **W3C `mediacapture-image` spec**, which extends the core `MediaTrackConstraints`/`MediaTrackCapabilities`/`MediaTrackSettings` dictionaries from `mediacapture-main`. [VERIFIED — spec structure per MDN's `MediaTrackConstraints` reference page enumerating these under "Instance properties of image tracks"]

---

## 2. Frame access paths and cost

**`<video>` + `canvas.drawImage` + `getImageData`**
- STATUS both engines: universally available, baseline Canvas 2D API. Cost: `drawImage` from a `<video>` element forces a GPU→CPU readback path on every call if you then call `getImageData` (CPU pixel array), which is the single most expensive step in a naive scan loop — it synchronizes the GPU pipeline and copies the full frame to JS-accessible memory every tick. Running this on the main thread at high frequency competes directly with UI compositing/input handling and is a well-known jank source. [INFERENCE — standard, uncontested browser-engine architecture knowledge; not a disputed or version-gated fact so no single citation is load-bearing]

**`requestVideoFrameCallback` (rVFC)**
- STATUS Safari iOS/macOS: **15.4+**. STATUS Chrome/Chrome Android: **83+**. [VERIFIED source — MDN browser-compat-data, `api/HTMLVideoElement.json`, https://raw.githubusercontent.com/mdn/browser-compat-data/main/api/HTMLVideoElement.json; spec at https://wicg.github.io/video-rvfc/]. Confirmed present in the probe (Safari 26.5). This is the correct primitive for "run once per actually-new decoded frame" instead of polling on `requestAnimationFrame`, and it delivers frame metadata (`presentationTime`, `expectedDisplayTime`, `width`/`height`) useful for pacing.

**`ImageCapture.grabFrame()` / `.takePhoto()` — is Safari functional or a stub?**
- STATUS Safari: per MDN browser-compat-data, the `ImageCapture` **constructor**, `takePhoto()`, `getPhotoCapabilities()`, `getPhotoSettings()`, and `track` all show `version_added: 18.4` — but **`grabFrame()` specifically shows `version_added: 26`**, i.e., WebKit shipped the rest of ImageCapture nearly a full major version *before* `grabFrame()`. [VERIFIED source — https://raw.githubusercontent.com/mdn/browser-compat-data/main/api/ImageCapture.json]. This means on iOS/macOS **Safari 18.x, `new ImageCapture(track)` exists and `takePhoto()`/capability queries work, but `grabFrame()` (the method actually useful for a continuous scan loop) does not** — a genuine functional-stub trap for exactly the 18.x window. Only Safari 26+ has the full surface.
- STATUS Chrome: constructor/`grabFrame` since Chrome 59; `takePhoto` since 59–60 (partial: "photoSettings parameter not supported" in 59-60, full later); `getPhotoCapabilities` since 59; `getPhotoSettings` since 61. [VERIFIED source — same BCD file]
- **Practical implication**: an ImageCapture-based frame-grab path that must also run on Safari 18.x (a large chunk of the 2024–2025 iOS install base) cannot rely on `grabFrame()`; it must fall back to the `<video>`+canvas path or wait for Safari 26 adoption.

**`MediaStreamTrackProcessor` + `VideoFrame` (WebCodecs)**
- STATUS Chrome/Chrome Android: constructor and `readable` property since **Chrome 94**, though Chrome's own BCD note flags it was originally *"exposed on `Window` instead of `DedicatedWorker`"* — an interoperability wrinkle even on the Chrome side relative to the spec's intended worker-only exposure. [VERIFIED source — https://raw.githubusercontent.com/mdn/browser-compat-data/main/api/MediaStreamTrackProcessor.json]
- STATUS Safari: **this is the most important reconciliation in this report, because it directly explains the probe's "ABSENT (also absent in Workers)" result despite BCD nominally claiming support.** The timeline, fully sourced:
  1. WebKit tracking bug **241124** ("Support Insertable Streams/MediaStreamTrackProcessor on Safari, both iOS and macOS") sat open since 2022-05-31, with the Zoom and Agora.io web teams explicitly requesting it. On **2024-08-21**, Apple's own WebRTC engineer (youenn fablet) wrote: *"This is enabled by default in the latest Safari betas as well as Safari Tech Preview. Please have a try."* — and the bug was then resolved `CONFIGURATION CHANGED`. [VERIFIED source, primary — https://bugs.webkit.org/show_bug.cgi?id=241124]
  2. MDN's browser-compat-data was updated to reflect `version_added: 18` on this basis.
  3. On **2024-09-28**, a real-world tester filed `mdn/browser-compat-data` issue **#24569**, reporting that instantiating `MediaStreamTrackProcessor` on shipping **Safari 18** throws `ReferenceError: Can't find variable: MediaStreamTrackProcessor` — i.e., it is not actually present in the released, non-beta browser. [VERIFIED source, primary — https://github.com/mdn/browser-compat-data/issues/24569]
  4. The task's own probe, run **2026-09-03 on Safari 26.5**, confirms `MediaStreamTrackProcessor` is still **ABSENT**, including in Workers.
  - **Conclusion**: treat MediaStreamTrackProcessor as **not reliably available in shipping Safari as of Safari 26 / Sept 2026**, despite what BCD's version table says. The most likely explanation (pattern-matched to the identical situation with `BarcodeDetector` below) is that it shipped enabled only in Safari Technology Preview / beta channels, gated behind a default-off "Experimental Features" toggle in shipping Safari, and was never flipped on for general release. **[INFERENCE for the exact gating mechanism; VERIFIED for the observed absence via the bug/issue trail + the probe]**
  - Do not build a production frame pipeline that depends on `MediaStreamTrackProcessor` + `VideoFrame` working on Safari.

**`new VideoFrame(videoElement)` on Safari, and `VideoFrame.copyTo`**
- STATUS Safari: `VideoFrame` constructor and `copyTo()` both **16.4+**. STATUS Chrome/Chrome Android: both **94+**. [VERIFIED source — https://raw.githubusercontent.com/mdn/browser-compat-data/main/api/VideoFrame.json]. Confirmed present in the probe. Constructing a `VideoFrame` directly from a `<video>` element (`new VideoFrame(videoEl)`) works on Safari 16.4+ independent of `MediaStreamTrackProcessor` — this is the viable Safari-side path into WebCodecs-shaped frame objects (e.g., for feeding a WASM decoder or an OffscreenCanvas draw) without needing the (broken) processor/worker-transfer pipeline.
- `copyTo`'s `format` option (added Chrome 127) is unsupported on Safari at any version per the same BCD file — plan color-format handling for the lowest common denominator.

**`createImageBitmap(video)`**
- STATUS both engines: broadly available, standard baseline API (predates the features above); a solid, universally-supported way to snapshot a `<video>`/`<canvas>`/`ImageBitmapSource` into a transferable bitmap without the WebCodecs machinery. [INFERENCE — long-standing baseline feature, not separately re-verified here since it long predates the frontier features this report focuses on]

**Transferring frames to a Worker (ImageBitmap / VideoFrame transfer)**
- `ImageBitmap` is `Transferable` on both engines (baseline `postMessage` transfer list support). `VideoFrame` is also `Transferable` per the WebCodecs spec on Chrome; on Safari, since `VideoFrame` itself is supported from 16.4 independent of the (broken) `MediaStreamTrackProcessor`, `new VideoFrame(videoEl)` on the main thread followed by a transfer to a Worker is the realistic Safari-compatible pattern — **not** "processor in a worker + transfer," which is the Chrome-idiomatic but Safari-broken pattern. [INFERENCE, reasoned from the two verified facts above]

**`OffscreenCanvas` 2D/WebGL in Workers on Safari (16.4+)**
- STATUS Safari: constructor and `getContext("2d")` since **16.4**; `getContext("webgl")`/`getContext("webgl2")` since **17**. STATUS Chrome/Chrome Android: constructor, 2D, and WebGL/WebGL2 all since **69**. [VERIFIED source — https://raw.githubusercontent.com/mdn/browser-compat-data/main/api/OffscreenCanvas.json]. Fully consistent with the probe (OffscreenCanvas PRESENT, 2D + WebGL2 in Worker on Safari 26.5).

**WebGPU in Workers**
- STATUS Safari: WebGPU shipped in **Safari 26.0**, per WebKit's own release notes: *"WebKit for Safari 26.0 adds support for WebGPU... now available on macOS, iOS, iPadOS, and visionOS."* [VERIFIED source, primary — https://webkit.org/blog/17333/webkit-features-in-safari-26-0/]. This directly confirms the probe's WebGPU-present result on Safari 26.5 for iOS/iPadOS as well as macOS (same release, same feature). Worker-context availability specifically is not separately called out in the WebKit post; the probe measuring "WebGPU present, in Worker too" on the same Safari 26.5 build is the best evidence for that specific sub-claim. **[VERIFIED for macOS/iOS/iPadOS support generally; the Worker-context detail rests on the probe rather than an independent doc citation]**
- STATUS Chrome/Chrome Android: BCD lists the `GPU` interface / `requestAdapter` at Chrome **144** (desktop, full support on ChromeOS/macOS/Windows/Linux-with-Intel-Gen12+) and Chrome Android **121**. [VERIFIED source — https://raw.githubusercontent.com/mdn/browser-compat-data/main/api/GPU.json]. Chrome Android has therefore had WebGPU for substantially longer than Safari.

---

## 3. Compute

**WASM SIMD (fixed-width 128-bit)**
- STATUS Safari: shipped in **Safari 16.4** (released 2023-03-27), reaching parity with Chrome/Firefox (which had shipped it in 2021). [VERIFIED/REPORTED — corroborated by multiple independent write-ups: https://webkit.org/blog/13966/webkit-features-in-safari-16-4/, https://platform.uno/blog/safari-16-4-support-for-webassembly-fixed-width-simd-how-to-use-it-with-c/, https://devclass.com/2023/02/24/no-longer-the-new-ie-apples-safari-16-4-to-bring-135-features/]. Consistent with the probe (WASM SIMD yes).
- STATUS Chrome/Chrome Android: shipped substantially earlier (2021). [REPORTED, general knowledge corroborated by the same platform.uno comparison]
- **relaxed-SIMD**: not found shipped in Safari in any source consulted; the probe's "relaxed-SIMD no" on Safari 26.5 is consistent with this. Chrome has shipped relaxed-SIMD. [INFERENCE — no contrary evidence found; not independently re-verified against a dedicated compat table in this pass]

**WASM threads / SharedArrayBuffer (COOP/COEP requirements)**
- STATUS Safari: `SharedArrayBuffer` constructor since **15.2**. STATUS Chrome: **68**; Chrome Android: **89**. [VERIFIED source — https://raw.githubusercontent.com/mdn/browser-compat-data/main/javascript/builtins/SharedArrayBuffer.json]. But construction alone is gated: post-Spectre, **all modern engines require the top-level document to be "cross-origin isolated"** — `Cross-Origin-Opener-Policy: same-origin` **and** `Cross-Origin-Embedder-Policy: require-corp` (or `credentialless`) — before `SharedArrayBuffer` (and therefore WASM threads) actually works; `self.crossOriginIsolated` reports this at runtime. [VERIFIED source — https://web.dev/articles/why-coop-coep, https://web.dev/articles/coop-coep]. Consistent with the probe ("SharedArrayBuffer absent without cross-origin isolation").
- **Implication for a Vercel-hosted PWA using Supabase and third-party scripts**: turning on COEP `require-corp` breaks **every cross-origin subresource and every cross-origin window/iframe interaction that doesn't explicitly opt in** via CORS (`Access-Control-Allow-Origin`) or `Cross-Origin-Resource-Policy`. In practice this means: Supabase's JS client itself talks over `fetch`/`XHR` (not blocked by COEP, since COEP governs subresource loading like scripts/images/iframes/workers, not same-tab `fetch` calls to a different origin — CORS still applies but COEP is not the added blocker there), but **any third-party `<script src>` tag, embedded widget iframe, or OAuth-popup-based flow (analytics pixels, chat widgets, payment iframes, some auth flows) that doesn't serve `Cross-Origin-Resource-Policy`/CORS headers will silently fail to load once COEP is enabled.** Vercel supports setting these response headers via `vercel.json` or Next.js `next.config.js` header rules on specific routes, which lets you scope cross-origin isolation to only the page(s) that need WASM threads rather than applying it site-wide. [VERIFIED source for the header mechanics — https://web.dev/articles/coop-coep; VERIFIED for Vercel header configurability — general Vercel header-config capability referenced in search results, not independently re-fetched from Vercel's own docs in this pass, so treat the Vercel-specific claim as **REPORTED** rather than fully verified against Vercel's docs directly]
- **Practical takeaway**: WASM threads should be treated as an opt-in, route-scoped capability for a scan-core worker page, not a site-wide default, specifically because of third-party script breakage risk. [INFERENCE]

**WebGPU status** — see §2 above (Safari 26 shipped; Chrome Android 121+).

**WebNN status**
- STATUS Chrome: **Origin Trial only as of Chrome 147–149** (2026) — not shipped as a stable, flag-free feature. STATUS Safari: **not shipped at all**. Overall assessment from a 2026 web-platform survey: *"WebNN is not production-ready in 2026... cross-browser deployment isn't viable yet despite Chrome/Edge having experimental support,"* with production viability estimated around 2027; the recommended current alternative for in-browser ML is WebGPU + transformers.js/ONNX Runtime Web. [REPORTED — https://www.utsubo.com/blog/frontier-web-apis-2026-production-ready, https://www.ddevtools.com/updates/2026-01-webgpu-webnn-browser-ai, Chrome Platform Status entry referenced at https://cr-status.appspot.com/feature/5176273954144256]. Consistent with the probe (WebNN absent).

**Main-thread vs. worker budgets**
- No formal per-engine "budget" spec exists; this is architecture guidance, not a documented limit: keep frame decode + inference off the main thread (Worker + OffscreenCanvas + WebGPU-in-worker, all now available on both target engines per §2) specifically because iOS Safari's main-thread work directly competes with compositing and because there is no memory/CPU governor grace period on iOS (see §4's memory-limit findings) — a main-thread stall is also a UI-jank and potential watchdog-timeout risk. **[INFERENCE, architectural]**

---

## 4. iOS Safari traps

**Camera pausing when tab hidden / app switch; `visibilityState`**
- STATUS: confirmed real and structural, not a bug that gets fixed — WebKit deliberately ties the capture session's lifecycle to page/document visibility and to the top-level document identity. Apple forum threads document video/audio pausing automatically in WKWebView when the app returns from background, and the general `visibilitychange` event fires on tab switch, app switch, and minimize. [REPORTED — https://developer.apple.com/forums/thread/813044, standard `visibilitychange` semantics via MDN]
- A related, sharper trap: WebKit ties the *media environment*'s lifetime to the top frame document's *current URL* — so even a same-document SPA navigation that changes the path (e.g. `pushState`) can destroy and recreate the capture session, pausing it, without ever backgrounding the tab. [REPORTED — https://developer.apple.com/forums/thread/750254, and structurally the same root cause discussed in WebKit bug 215884, see below]
- rAF throttling when hidden is standard engine behavior on both browsers (not iOS-specific); `requestVideoFrameCallback` similarly does not fire for a backgrounded/hidden video. [INFERENCE, standard engine behavior]

**`playsinline` / muted autoplay**
- STATUS: well-established, uncontroversial requirement — a `<video>` element must carry `playsinline` (or `webkit-playsinline` historically) to avoid iOS forcing native fullscreen video playback, and autoplay generally requires `muted` plus (for anything beyond a literal `<video autoplay>` element) a user gesture. [INFERENCE/REPORTED — long-standing, universally documented iOS Safari behavior, not separately re-verified via a fresh fetch in this pass since it is not in dispute]

**Standalone PWA (Home Screen) camera permission re-asked on every launch — status in iOS 17.4+/18/26**
- STATUS: **not fixed as of the most recent evidence found (Jan 2025)**, and the underlying architectural cause is openly acknowledged by Apple's own WebRTC engineer. Primary evidence, chronological, from WebKit bug **215884** ("getUserMedia recurring permissions prompts in standalone when hash changes," filed 2020-08-27, still `RESOLVED CONFIGURATION-CHANGED` only for a partial mitigation — not a full close):
  - 2020-09-16, youenn fablet (Apple): *"there is a navigation which stops all the capture tracks and reset[s] the permissions when doing hash navigations in Web.app but not iOS Safari."*
  - 2020-12-16, youenn fablet: confirms *"The fix is not in WebKit but in Safari standalone mode implementation. I'll keep this bug open until validation is done this works as expected."*
  - 2021-02-14 → 2021-06-20: a partial fix landed in **iOS 14.5** — permission no longer re-prompts on every route change within a session — but a tester confirms *"the camera permission is not conserved over multiple sessions. That means the camera permission prompt still shows up when the application is closed and reopened again."*
  - 2023-03-10: *"This issue is still current with 16.3.1."*
  - **2024-09-10 (i.e., current for iOS 17/18 era)**: a tester on iPhone 16.6.1 reports *"On my iPhone the permission does not persist when disabling and enabling the camera or reloading the page."* Youenn fablet's reply treats sustained Home-Screen-app camera persistence as a **feature request that would need a new bug filed**, i.e., not something WebKit considers already fixed.
  - 2025-01-15 to 2025-01-20: users still asking for a resolution; no fix confirmed.
  - [VERIFIED source, primary, full comment thread — https://bugs.webkit.org/show_bug.cgi?id=215884]
- A second, narrower, **actually-fixed** bug exists: **252465** ("In PWA, HTML Video Element may be unable to play stream from getUserMedia()," reported 2023-02-17 against iOS 16.3/15.7) — this is about the `<video>` element hanging in `pending` play-state rather than about permission re-prompting, and it is marked `RESOLVED FIXED`. Vendor documentation (STRICH, a barcode-scanning SDK) still references this bug as relevant to "camera access issues in iOS PWAs" as of their current knowledge-base article, alongside recommending: run latest iOS, avoid installing as a PWA if camera reliability is paramount (use in-Safari-tab instead), or strip `apple-mobile-web-app-capable` so the site stays reachable from the Home Screen but renders in a real Safari tab. [VERIFIED source, primary — https://bugs.webkit.org/show_bug.cgi?id=252465; REPORTED vendor guidance — https://kb.strich.io/article/29-camera-access-issues-in-ios-pwa]
- **Net assessment for iOS 17.4/18/26**: the *worst* symptom (prompt on every single route change) was mitigated in iOS 14.5, but **permission does not durably persist across full PWA relaunches**, and this is treated by Apple's own engineer as an open feature gap rather than a bug with a committed fix, as recently as Jan 2025 comment activity. No evidence was found that iOS 26 changes this. **[VERIFIED via primary bug thread through Jan 2025; iOS 26 status specifically is INFERENCE by extrapolation, not directly tested]**

**getUserMedia in WKWebView / in-app browsers (Instagram/Facebook)**
- STATUS WKWebView itself: getUserMedia access in a *first-party* WKWebView-based app was fixed for the Home-Screen-launch case around **iOS 13.4 beta** (per WebKit bug 185448, referenced inside bug 208667), but a **broader** bug — "getUserMedia does not work in WKWebView-based browsers like Chrome, Firefox [running on iOS]" — stayed open for years afterward with dozens of confirmations across iOS 14 betas through iOS 14.1, and accumulated 57 CC'd users including an active WebKit team member (`youennf`) before being marked `RESOLVED CONFIGURATION CHANGED`. One workaround reported by an affected team: routing camera capture through the `cordova-plugin-iosrtc` plugin and rendering to a `<canvas>` captured via ffmpeg, at a real performance cost. [VERIFIED source, primary — https://bugs.webkit.org/show_bug.cgi?id=208667]
- STATUS Instagram/Facebook in-app browsers specifically: reported behavior is that the **Facebook in-app WebView on iOS returns `NotAllowedError`** for `getUserMedia`, and — asymmetrically — *"the Android Facebook and Instagram apps do not grant camera access permissions to their respective Webview components, though the iOS apps do grant this permission"* per one Facebook developer-community thread (i.e., reports conflict on the iOS side specifically; treat iOS in-app-browser camera access as unreliable/version-and-app-dependent rather than confidently working or confidently broken). [REPORTED, non-primary — https://developers.facebook.com/community/threads/432379558191221]
- **Practical guidance**: a scan-core PWA reached via an in-app browser (social-media link click) cannot assume camera access at all; detecting the in-app-browser UA and prompting the user to open in Safari/Chrome proper is the standard mitigation used across the industry. [INFERENCE, standard practice]

**Memory limits / page reloads**
- STATUS: iOS Safari enforces **hard memory ceilings with no swap and no graceful degradation** — exceeding the budget gets the WebContent process killed outright, with **no catchable JavaScript exception and no `window.onerror`**. A detailed 2026-01-07 measurement (tested on iOS 26.2) found: **iPhone SE (3rd gen) crashes consistently around 100 MB** of page weight, and **iPad (8th gen) around 200 MB**; the author notes *"A couple of times, my memory test entirely froze my iPad, such that not even the home button worked, and eventually the device appeared to reboot."* [VERIFIED source, primary, dated — https://lapcatsoftware.com/articles/2026/1/7.html]
- This is directly relevant to a continuous-scan-core architecture: large WASM heaps (ZXing/ONNX-style decoders), accumulated `VideoFrame`/`ImageBitmap` objects that aren't explicitly `close()`d, and canvas backing stores all count against this ceiling, and a silent process kill (rather than an exception) means the app must proactively self-monitor (e.g., periodic explicit `frame.close()`, bounded queues, memory-pressure heuristics) rather than relying on error handling. [INFERENCE, reasoned from the verified ceiling]
- A related, separately documented WASM-specific trap: one production iOS Safari bug report (unrelated third-party barcode-scanning project) found that failing to free a WASM heap buffer allocated per scan tick caused a crash after **~70 seconds / ~475 scans** via use-after-free-style memory growth — illustrating how quickly a naive "allocate every frame" WASM loop exhausts the above ceilings on iOS specifically. [REPORTED — https://dev.to/ilhannegis/barcode-scanning-on-ios-the-missing-web-api-and-a-webassembly-solution-2in2]

**`devicemotion` permission (iOS 13+)**
- STATUS: since iOS 13, `DeviceMotionEvent.requestPermission()` (and the equivalent for `DeviceOrientationEvent`) exists and **must be called from inside a user-gesture handler**, resolving to `'granted'`/`'denied'`; Safari caches the answer so it persists across reloads (unlike the getUserMedia-in-PWA case above). Feature-detect via `typeof DeviceMotionEvent.requestPermission === 'function'` before calling, since non-iOS/older engines don't have this gate. [VERIFIED/REPORTED — https://dev.to/li/how-to-requestpermission-for-devicemotion-and-deviceorientation-events-in-ios-13-46g2, corroborated by WebKit's own LayoutTest for the user-gesture requirement, https://github.com/WebKit/webkit/blob/main/LayoutTests/fast/device-orientation/device-motion-request-permission-user-gesture.html]

**Haptics on web — `navigator.vibrate` absent; the `<input type="checkbox" switch>` trick**
- STATUS Safari: `navigator.vibrate` has never been implemented — *"iOS Safari does not expose any public API for haptics or vibration, and Safari has no equivalent API to Android's vibration functionality."* [REPORTED, consistent with the probe's "navigator.vibrate ABSENT"]
- STATUS Chrome Android: `navigator.vibrate` works normally (standard Vibration API support).
- **The workaround**: WebKit introduced the HTML `<input type="checkbox" switch>` control in **Safari 17.4**, and toggling it triggers the OS-level haptic engine as a side effect — several small libraries (`ios-haptics`, and others referenced by mobile-web engineer Maximiliano Firtman) exploit this by overlaying an invisible switch input + associated `<label>`, and calling `.click()` on the *label* (not the input directly, which WebKit does not treat the same way) to fire a haptic pulse from JavaScript with no native vibration API at all. [VERIFIED source (README) — https://github.com/tijnjh/ios-haptics]
- **Important currency caveat**: a well-known mobile-web engineer (Firtman) reported via social media that this technique worked from iOS 17.4 through iOS 26.4, but that **Apple patched the underlying behavior in iOS 26.5**, breaking programmatic triggering. [REPORTED, single social-media source, not corroborated by a WebKit release note or bug in this research pass — treat as **plausible but unconfirmed** for a Sept 2026 target; if the scan-core plans to rely on this trick, verify directly against a current iOS 26.5 device rather than trusting either the "works through 26.4" or "broken in 26.5" claim blindly.] Given the task's own probe device *is* Safari 26.5, this is worth a direct functional test rather than further documentation search.

**Web Audio autoplay rules for beeps**
- STATUS both engines: an `AudioContext` starts `suspended` and must be `resume()`d from inside a user-gesture handler; Safari's rule is described as stricter in practice ("without explicit user interaction, no audio autoplay is permitted on iOS"). Because a scan-core's "success beep" is normally *triggered by* a scan event (not a direct click), the standard pattern is to create/resume the `AudioContext` once, early, inside the *first* user gesture that starts the scanning session (e.g., the "Start Scanning" button tap), then reuse that already-running context for all subsequent beeps — beeps fired later from a `requestVideoFrameCallback`/decode-loop callback do not themselves count as gestures. [REPORTED — general Web Audio autoplay-policy literature; MDN "Web Audio API best practices"]

**Screen Wake Lock support**
- STATUS Safari: partial from **16.4**, with standalone-Home-Screen-PWA support specifically added in **18.4** — WebKit's own release notes: *"The Screen Wake Lock API now also works in Home Screen Web Apps on iOS and iPadOS 18.4. This allows you to prevent a device from dimming and locking the screen."* [VERIFIED source, primary — https://webkit.org/blog/16574/webkit-features-in-safari-18-4/, corroborated by BCD]. Consistent with the probe (WakeLock present on Safari 26.5). **This means a scan-core PWA targeting iOS 17.x specifically cannot rely on Wake Lock working once installed to the Home Screen** — only 18.4+ home-screen contexts get it; 17.x and earlier Home Screen apps, and any pre-18.4 in-Safari-tab session, either lack it or have inconsistent behavior per BCD's "partial" note for the 16.4–18.4 window.
- STATUS Chrome Android: since Chrome **84** (desktop; Android mirrors). [VERIFIED source — BCD `api/WakeLock.json`]

---

## 5. Android Chrome traps

**Camera selection on Samsung devices (multiple logical cameras, fixed-focus ultrawide chosen as "environment")**
- STATUS: real, recurring, actively-reported problem, concentrated on Samsung Galaxy S20-and-later devices. Multiple independent GitHub issue threads against a popular QR-scanning library document: barcode scanning failing specifically on Galaxy S20/S22/S23-class devices while working fine on other Android models (e.g. Galaxy A71); `facingMode: "environment"` resolving to a wide-angle/low-quality sensor "most of the time," with one report going further and claiming `environment` opened the **front** camera on some Android devices; and Chrome's Camera2 API integration itself being called out by a Samsung developer-forum poster as being "in a bad state." [REPORTED — https://github.com/mebjas/html5-qrcode/issues/881, https://github.com/mebjas/html5-qrcode/issues/308, https://github.com/mozmorris/react-webcam/issues/365, https://forum.developer.samsung.com/t/why-is-camera2-api-is-such-a-bad-state/13739]
- **Documented mitigation** (used by working scanning libraries): don't trust `facingMode: "environment"` alone — enumerate devices, sort by label, and select by index/label pattern (e.g., `"camera2 0, facing back"`) to reach the manufacturer's primary autofocus sensor rather than whichever sensor the UA's `environment` heuristic happens to prefer. [REPORTED — https://github.com/mebjas/html5-qrcode/discussions/655]

**`BarcodeDetector` dependence on Google Play Services**
- STATUS: **confirmed directly by Google's own developer documentation**: *"Barcode detection is available on macOS, ChromeOS, and Android. Google Play Services are required on Android."* [VERIFIED source, primary — https://developer.chrome.com/docs/capabilities/shape-detection]. This means `BarcodeDetector` will be **absent or non-functional on Android devices/builds without GMS** — most notably devices sold in mainland China running AOSP-based Android without Google Mobile Services, and de-Googled ROMs. A production scan core cannot assume `BarcodeDetector` works on "Chrome Android" as a monolith; it must feature-detect (`'BarcodeDetector' in window` **and** a successful `getSupportedFormats()`/`detect()` call, since presence of the constructor does not guarantee the underlying GMS barcode library is actually installed and functional) and fall back to a WASM decoder when either is missing.
- Chrome (desktop, macOS/ChromeOS) and Chrome Android version support per BCD: `BarcodeDetector` shipped Chrome **83 (Android)**, **88 (macOS/ChromeOS desktop)**, with earlier partial support 83-87 on macOS. [VERIFIED source — https://raw.githubusercontent.com/mdn/browser-compat-data/main/api/BarcodeDetector.json]. Notably **not supported on Windows/Linux Chrome desktop** at all (no underlying OS shape-detection service to call into) — another platform-fragmentation trap beyond the mobile-vs-desktop question this report is centered on.

**Power/thermal throttling in long sessions**
- STATUS: **no vendor-published measurements or dedicated technical guidance were found** in this research pass specifically quantifying continuous-web-barcode-scanning power draw or thermal throttling curves on Android or iOS. General device-thermal-management guidance exists at a consumer-hardware level (avoid direct sunlight, allow cooldown breaks, keep battery healthy) but nothing web-specific or vendor-benchmarked was located. **[explicitly unverified — flagged per instructions rather than invented]**. The `dev.to` WASM-heap-leak report (§4) is the closest concrete data point found, and it is about a memory leak causing an iOS crash at ~70 seconds, not a thermal-throttling measurement per se.

**`frameRate` defaults**
- STATUS: no Android-Chrome-specific default frame rate figure was found with a citable primary source in this pass; general getUserMedia literature cites ~30fps as a common assumption absent explicit constraints, and notes Chrome's constraint-satisfaction algorithm differs from Firefox's in how it exposes native camera presets (Chrome exposes width/height presets discoverably; frame-rate preset discovery is less consistent). [REPORTED, weak — https://webrtchacks.com/how-to-figure-out-webrtc-camera-resolutions/, general community discussion] Treat any specific frameRate default as **needing empirical, per-device verification** rather than a documented constant.

**`zoom` capability ranges**
- STATUS: zoom range (`min`/`max`/`step`) is exposed per-device via `MediaTrackCapabilities.zoom` once a track is live; there is no single documented cross-device range — this is inherently hardware-dependent (e.g., a phone with a dedicated telephoto lens will report a very different max than one without). No further primary-source detail on typical ranges was found or is claimed here.

---

## 6. Battery/thermal

- **No primary vendor-published benchmark data** (Scandit, Dynamsoft, or otherwise) quantifying continuous-camera-scanning battery drain or thermal effects was located in this research pass, despite targeted searching. This section is therefore mostly **[INFERENCE]** from general mobile-web engineering practice rather than **[VERIFIED]** or even solidly **[REPORTED]**:
  - Downscaling the frame before decode (e.g., decoding at 640×480 rather than native sensor resolution) reduces per-frame CPU/GPU cost roughly proportionally to pixel count — standard image-processing scaling, not scan-specific research.
  - Processing every Nth frame (frame skipping) trades latency for battery/thermal headroom; this is the standard technique used by essentially every JS barcode-scanning library (ZXing-based libraries included) to stay usable on mid-range hardware, but no vendor published a specific N-value benchmark that was found here.
  - ROI cropping (only decoding a central viewfinder region rather than the full frame) is a standard technique in native barcode SDKs (Scandit, Dynamsoft market this as a differentiator in their native/enhancer products) and reduces both decode cost and false-positive rate; I did not find a *web-specific* Scandit/Dynamsoft benchmark article quantifying the web-SDK version's savings in this pass — their web-facing docs found here (§1) discuss auto-zoom and focus, not ROI/thermal numbers specifically.
  - Pausing decode when no motion is detected (frame-differencing gate before running the expensive decoder) is a common pattern in the space but was not found documented with numbers for any specific vendor's web SDK here.
- **iOS thermal state effects on camera frame rate in web**: no documentation was found describing whether/how iOS's public `NavigatorThermalState`-style signal (there is in fact **no standardized Thermal API exposed to web content** on either engine as of this research) can be used to detect throttling from a web page, nor whether Safari itself silently reduces delivered `getUserMedia` frame rate under thermal pressure. **[explicitly unverified]**. Treat any thermal-adaptive scanning logic as needing to be built on proxy signals (e.g., observed frame-timestamp deltas via `requestVideoFrameCallback`, dropped-frame counts) rather than a real OS thermal signal, since none is available to web content on either platform per the sources reviewed.

---

## 7. PWA-specific

**Service-worker caching of large WASM/ONNX assets — size limits, Safari 7-day eviction / ITP**
- STATUS: Safari's Intelligent Tracking Prevention deletes **all script-writable storage — explicitly including IndexedDB, LocalStorage, SessionStorage, and Service Worker registrations/caches — after 7 days of Safari use without user interaction on that site.** [VERIFIED/REPORTED, multiple corroborating sources — https://support.didomi.io/apple-adds-a-7-day-cap-on-all-script-writable-storage, https://usehardal.com/safari-itp-guide, discussed at length by web-standards commentator Jeremy Keith at https://dev.to/adactio/apple-s-attack-on-service-workers-5fj5]
- **Critical exception, directly relevant to a Home-Screen PWA scan core**: *"web applications added to the home screen are not part of Safari and thus have their own counter of days of use... which resets the timer."* I.e., **an installed Home-Screen PWA is not subject to the same 7-day countdown as a regular Safari tab** — its own usage resets its own clock. This materially changes the calculus for caching a large WASM/ONNX decoder: if the target user installs the PWA to the Home Screen and opens it at least once every 7 days of *their own PWA usage*, the cached assets should survive; if they only ever use it as a bookmarked Safari tab, a 7-day gap in Safari usage (of *any* site, not just yours — the timer is about Safari-wide usage, so this needs re-reading carefully: it is "7 days of Safari use" without visiting your site, not 7 days total) risks eviction and a re-download of the WASM/ONNX payload. [VERIFIED/REPORTED — same didomi source]
- No explicit **byte-size limit** for Cache Storage on iOS Safari was found in this research pass beyond the general, frequently-cited (but not freshly re-verified here) fact that iOS enforces overall per-origin storage quotas tied to available device disk space rather than a fixed small number; treat this as **[not independently re-verified in this pass]** and test empirically with the actual WASM/ONNX payload size planned for the scan core.

**Cross-origin isolation for threads** — covered fully in §3 (COOP/COEP requirement, Vercel header-scoping approach, third-party-script breakage risk).

**Does iOS Safari allow `getUserMedia` inside a Home-Screen PWA in 2026?**
- STATUS: **yes, camera access itself works** inside a Home-Screen PWA — the well-documented problem (§4) is that **permission does not persist reliably across app relaunches**, not that access is blocked outright. This is an important distinction: the scan core is not locked out of the camera in standalone mode, but must be designed to gracefully re-request permission on every cold launch without treating that re-prompt as an error state. [VERIFIED — synthesized from the full WebKit bug 215884 thread, §4]

---

## 8. BarcodeDetector API status in Safari (iOS 18.x, 26)

- STATUS: **behind a default-off "Shape Detection API" experimental feature flag**, and — critically — **functionally broken on iOS even when a user manually enables that flag**, as of the most recent evidence found (June 2025, iOS 26 developer beta). Full sourced timeline, WebKit bug **281848** ("Shape Detection API doesn't work on iOS," filed 2024-10-21, still open/`NEW` as of the most recent comment found):
  - Original report: *"The Shape Detection API was working until Safari 17.6.x when enabled in feature flags but is no longer working... The Shape Detection API does work on macOS Sequoia."* [i.e., the reporter's own baseline claim is that it once worked on iOS with the flag on, regressed, and separately does work on the Mac desktop build with the flag on]
  - 2025-02-12: a developer reports the reference test page still fails on **Safari 18.3**, and resorts to the `barcode-detector-polyfill` (WASM-based) as a workaround instead of the native API.
  - 2025-04-04 → 2025-05-16: repeated confirmation on **iOS 18.4** and **18.5** (iPhone 15) that barcode detection simply does not fire, while the identical test page and identical physical barcode succeeds immediately on a Pixel Android device in the same lighting.
  - 2025-06-12: tested against the **first iOS 26 developer beta** (iPhone 12 Pro) — still not successful; the tester notes the Shape Detection flag was still present but had to be **manually re-enabled after the OS upgrade** (i.e., it remains an opt-in developer flag, not a default-on shipping feature, all the way into iOS 26 betas).
  - 2026-07-21 (most recent comment found): still no resolution; a developer notes their `qr-scanner` library-based product "scans ok on chrome, edge and other browsers, but not on safari."
  - [VERIFIED source, primary, full thread — https://bugs.webkit.org/show_bug.cgi?id=281848]
- **This fully explains and is fully consistent with the task's probe result** (`BarcodeDetector` ABSENT on Safari 26.5, including in Workers): a standard probe that does not manually enable Safari's "Shape Detection API" developer/experimental flag will always see it absent, and even manual enablement is reported non-functional specifically on the iOS side of WebKit as recently as mid-2025.
- MDN's browser-compat-data technically lists `version_added: 17` for Safari/Safari iOS **"requires flag,"** which is consistent with the above (present-but-gated) rather than contradictory — the practical, user-facing reality for a non-technical end user on default Safari settings is **no native BarcodeDetector, full stop**, on any iOS Safari version through 26. [VERIFIED source — https://raw.githubusercontent.com/mdn/browser-compat-data/main/api/BarcodeDetector.json, reconciled against the bug thread]
- **WebKit's official standards position**: a `WebKit/standards-positions` GitHub issue (#174, "Accelerated Shape Detection in Images") exists tracking WebKit's formal stance, opened by a Google/Chromium engineer in April 2023 laying out that `BarcodeDetector` had shipped in Chromium while `FaceDetector`/`TextDetector` remained flagged there too. The fetch of this issue in this research pass could not reliably extract a substantive, dated WebKit engineer position statement from the thread content (the tool returned only a label reading "support" without a clearly quotable rationale) — **treat WebKit's official design-level position as unconfirmed by this research pass**, distinct from the *implementation* reality documented above via bug 281848, which is solid. [REPORTED, low confidence — https://github.com/WebKit/standards-positions/issues/174]

**TextDetector / FaceDetector**
- STATUS Chrome: both remain **"Available behind a flag... In Progress"** per Chrome's own developer documentation — i.e., not shipped by default even on Chrome/Chrome Android, unlike `BarcodeDetector` which is Chrome's one shipped-by-default Shape Detection sub-feature. [VERIFIED source — https://developer.chrome.com/docs/capabilities/shape-detection]
- STATUS Safari: no evidence of any implementation, flagged or otherwise, was found in any WebKit release note or bug search performed in this pass. **[INFERENCE from absence of evidence — not a positive confirmation of non-existence, but no contrary evidence exists either]**

---

## 9. Sec-ant `barcode-detector` polyfill and zxing-wasm on iOS Safari

- **What it is**: `@sec-ant/barcode-detector` is a `BarcodeDetector` polyfill/ponyfill built on `zxing-wasm` (a WebAssembly build of ZXing-C++). [VERIFIED source, primary repo — https://github.com/Sec-ant/barcode-detector, https://github.com/Sec-ant/zxing-wasm]
- **Performance**: the maintainer's own documentation is candid that this is a **JS/WASM-orchestrated** detector, not a native one: *"The image recognition logic is handled entirely in JavaScript code, so you can't expect performance as good as the native API, and if you want to use the detector continuously on streaming video, you can potentially expect performance issues."* [REPORTED, from package documentation surfaced via search — treat as vendor-self-reported, credible but not independently benchmarked in this pass]
- **`.wasm` loading / MIME quirk**: by default the package fetches its `.wasm` binary from a **jsDelivr CDN URL** rather than bundling it, specifically so it doesn't have to trust the host server's MIME configuration; it exposes `prepareZXingModule`/a `locateFile`-style override to point at a self-hosted copy for offline or CSP-restricted deployments. [VERIFIED source, primary — package documentation at https://sec-ant.github.io/zxing-wasm/docs/]. The underlying reason this matters: `WebAssembly.instantiateStreaming()` **requires** the response to be served with `Content-Type: application/wasm`; if a host (a misconfigured static file server, or historically some CDNs/dev servers) serves `.wasm` with the wrong MIME type, `instantiateStreaming` throws/rejects and the loader must fall back to the slower `WebAssembly.instantiate(ArrayBuffer)` path — a well-documented, general WASM-serving gotcha (not iOS-specific, but it compounds with iOS's tighter memory/CPU budget if you silently fall onto the slow path without noticing). [VERIFIED source, general WASM spec behavior — corroborated by multiple independent reports, e.g. https://github.com/http-party/http-server/issues/690, https://github.com/vercel/serve/issues/668]. **Action item for a Vercel deployment**: explicitly verify Vercel's static-asset serving sends `application/wasm` for `.wasm` files (or self-host via jsDelivr/a route with an explicit header override) rather than assuming it — a misconfiguration here silently degrades every user, with the degradation likely most visible on iOS Safari given its tighter compute/memory headroom.
- **iOS-specific bug reports for this specific polyfill**: I located the project's open-issues listing (https://github.com/Sec-ant/barcode-detector/issues) and one specific issue titled "Barcode detection service unavailable" (#18), but could not extract confirmed iOS-specific root-cause detail from it in this pass — flag this as an area to check directly before relying on the library, rather than asserting a specific iOS failure mode that wasn't actually confirmed here. **[explicitly unverified — named but not substantiated]**
- **Independent corroboration of the general "WASM decoder on iOS is memory-fragile" pattern** (different project, ZBar-via-Emscripten rather than ZXing, but the same architectural pattern as Sec-ant's approach): a developer building a from-scratch WASM barcode decoder for iOS Safari found that **failing to free a heap buffer allocated on every scan tick caused a crash after approximately 70 seconds (~475 successful scans)** due to use-after-free-style memory growth, fixed by allocating a fresh buffer per tick and lettng the WASM module's own free callback (`zbar_image_free_data`) run cleanup. The same author reports that once fixed, detection on modern iPhones happens "within a couple of frames" with "negligible processing overhead" — i.e., **the WASM-decode-itself is fast enough; the actual risk is JS/WASM memory-lifecycle bugs compounding against iOS's hard, exception-less memory ceiling** (§4). [REPORTED, single detailed first-hand account — https://dev.to/ilhannegis/barcode-scanning-on-ios-the-missing-web-api-and-a-webassembly-solution-2in2]. This generalizes directly to any zxing-wasm/Sec-ant integration: every `VideoFrame`/`ImageBitmap`/WASM buffer used per scan tick must be explicitly released (`.close()`, explicit free) rather than left to garbage collection, specifically because of iOS's ceiling from §4.

---

## SUPPORT MATRIX

| Feature | Safari iOS (17 / 18 / 26) | Chrome Android | Confidence |
|---|---|---|---|
| `facingMode` constraint | Yes | Yes, but may resolve to wrong lens (Samsung) | VERIFIED (name) / REPORTED (Samsung trap) |
| `width`/`height`/`frameRate` control | Yes; old (2019) report of a 720p ceiling, **not reconfirmed for 2024–2026** | Yes; no documented Android-wide ceiling | INFERENCE/UNVERIFIED for current iOS max |
| `deviceId` multi-back-camera selection | Unclear/unconfirmed for lens-level selection | Yes, but needs label-sort heuristic to avoid ultrawide | REPORTED (weak on iOS side) |
| `zoom` constraint | **Yes, since 17.0** (name); functional quality unverified | Yes, Android since Chrome 87 | VERIFIED |
| `torch` constraint | **Yes, by 17.5** (bug-fix evidence), confirmed present 18.4/26.5 | Yes (version unconfirmed) | VERIFIED (Safari) / INFERENCE (Chrome version) |
| `focusMode`/`focusDistance` | **No** | Yes (Android); also listed on desktop Chrome name-only | VERIFIED |
| `exposureMode`/`pointsOfInterest` | **No** | Yes (name); functional support unconfirmed | VERIFIED (name-level) |
| `<video>`+canvas `getImageData` | Yes (baseline, costly on main thread) | Yes (baseline, costly on main thread) | INFERENCE (uncontested baseline) |
| `requestVideoFrameCallback` | **15.4+** | **83+** | VERIFIED |
| `ImageCapture` constructor/takePhoto/capabilities | **18.4+** | 59–61+ | VERIFIED |
| `ImageCapture.grabFrame()` | **26+ only** (stub/absent 18.x–25.x) | 59+ | VERIFIED |
| `MediaStreamTrackProcessor`+`VideoFrame` pipeline | **Not reliably available** (BCD says 18; disputed by GitHub issue #24569 and by the live probe on 26.5) | **94+** (but Chrome exposes on Window, not just Worker) | VERIFIED (both directions) |
| `new VideoFrame(videoEl)` / `copyTo` | **16.4+** | **94+** | VERIFIED |
| `createImageBitmap(video)` | Yes (baseline) | Yes (baseline) | INFERENCE |
| `OffscreenCanvas` 2D in Worker | **16.4+** | **69+** | VERIFIED |
| `OffscreenCanvas` WebGL/WebGL2 in Worker | **17+** | **69+** | VERIFIED |
| WebGPU (incl. Worker) | **26.0+**, macOS/iOS/iPadOS/visionOS | **121+ (Android)**; 144 desktop | VERIFIED |
| WebNN | **Not shipped** | Origin Trial only, Chrome 147–149; not production-ready | REPORTED |
| WASM SIMD (128-bit) | **16.4+** | Since 2021 | VERIFIED |
| WASM relaxed-SIMD | **No** | Yes | INFERENCE |
| WASM threads / `SharedArrayBuffer` | **15.2+, requires COOP+COEP cross-origin isolation** | 68+ desktop / 89+ Android, same COOP+COEP requirement | VERIFIED |
| Native `BarcodeDetector` | **No** (flag exists, default-off, functionally broken on iOS even when enabled, through iOS 26 betas) | **Yes, 83+, but requires Google Play Services** — absent without GMS | VERIFIED |
| `TextDetector`/`FaceDetector` | No evidence of any support | Behind flag / "In Progress" even on Chrome | VERIFIED (Chrome) / INFERENCE (Safari absence) |
| Screen Wake Lock (in-tab) | **16.4+ (partial)** | 84+ | VERIFIED |
| Screen Wake Lock (standalone Home-Screen PWA) | **18.4+ only** | N/A (no standalone-PWA distinction on Android Chrome) | VERIFIED |
| `navigator.vibrate` | **No, never implemented**; checkbox-switch haptic hack works 17.4–26.4 (26.5 status disputed) | Yes | REPORTED |
| `DeviceMotionEvent.requestPermission()` gate | **Yes, since iOS 13**, gesture-gated, persists across reloads | No equivalent gate (permission model differs) | VERIFIED |
| Web Audio autoplay unlock needed | Yes, strict | Yes, standard | REPORTED |
| Camera survives SPA route/hash change in standalone PWA | **No — historically resets on navigation/hash change**; partially mitigated iOS 14.5+, still not fully solved through Jan 2025 | N/A (Android has no equivalent standalone-PWA getUserMedia permission model) | VERIFIED |
| Camera permission persists across full PWA relaunch | **No, as of most recent (Jan 2025) evidence** | N/A | VERIFIED |
| `getUserMedia` inside in-app browsers (Instagram/FB) | Unreliable/inconsistent reports | Reported blocked on Android in-app WebViews | REPORTED |
| iOS hard memory ceiling (no exception on kill) | **~100MB (iPhone SE 3), ~200MB (iPad 8th gen), tested iOS 26.2** | N/A (Android governs differently; no equivalent citation found) | VERIFIED (iOS only) |
| Native OS thermal signal exposed to web content | **No** | **No** | INFERENCE |

---

## Sources

Primary documents fetched and read directly (WebFetch or direct HTTP fetch) during this research:

- https://developer.mozilla.org/en-US/docs/Web/API/MediaTrackConstraints
- https://developer.mozilla.org/en-US/docs/Web/API/MediaTrackSupportedConstraints
- https://developer.mozilla.org/en-US/docs/Web/API/BarcodeDetector
- https://developer.mozilla.org/en-US/docs/Web/API/ImageCapture
- https://developer.mozilla.org/en-US/docs/Web/API/MediaStreamTrackProcessor
- https://raw.githubusercontent.com/mdn/browser-compat-data/main/api/BarcodeDetector.json
- https://raw.githubusercontent.com/mdn/browser-compat-data/main/api/ImageCapture.json
- https://raw.githubusercontent.com/mdn/browser-compat-data/main/api/MediaStreamTrackProcessor.json
- https://raw.githubusercontent.com/mdn/browser-compat-data/main/api/VideoFrame.json
- https://raw.githubusercontent.com/mdn/browser-compat-data/main/api/OffscreenCanvas.json
- https://raw.githubusercontent.com/mdn/browser-compat-data/main/api/HTMLVideoElement.json
- https://raw.githubusercontent.com/mdn/browser-compat-data/main/api/WakeLock.json
- https://raw.githubusercontent.com/mdn/browser-compat-data/main/javascript/builtins/SharedArrayBuffer.json
- https://raw.githubusercontent.com/mdn/browser-compat-data/main/api/GPU.json
- https://api.github.com/repos/mdn/browser-compat-data/contents/api?ref=main (used to verify no dedicated `MediaTrackConstraints.json`/`MediaTrackCapabilities.json` files exist in BCD)
- https://webkit.org/status/ (retired, no data)
- https://webkit.org/blog/14445/webkit-features-in-safari-17-0/
- https://webkit.org/blog/14205/news-from-wwdc23-webkit-features-in-safari-17-beta/
- https://webkit.org/blog/14787/webkit-features-in-safari-17-2/ (no matches found)
- https://webkit.org/blog/16574/webkit-features-in-safari-18-4/
- https://webkit.org/blog/17333/webkit-features-in-safari-26-0/
- https://bugs.webkit.org/show_bug.cgi?id=281848 (Shape Detection API doesn't work on iOS)
- https://bugs.webkit.org/show_bug.cgi?id=215884 (getUserMedia recurring permission prompts in standalone)
- https://bugs.webkit.org/show_bug.cgi?id=208667 (getUserMedia does not work in WKWebView-based browsers)
- https://bugs.webkit.org/show_bug.cgi?id=252465 (PWA video element unable to play getUserMedia stream)
- https://bugs.webkit.org/show_bug.cgi?id=241124 (Support MediaStreamTrackProcessor on Safari)
- https://github.com/WebKit/standards-positions/issues/174 (low-confidence extraction)
- https://github.com/mdn/browser-compat-data/issues/24569 (MediaStreamTrackProcessor Safari 18 dispute)
- https://developer.chrome.com/docs/capabilities/shape-detection
- https://web.dev/articles/camera-pan-tilt-zoom
- https://web.dev/articles/coop-coep / https://web.dev/articles/why-coop-coep (via search synthesis)
- https://www.dynamsoft.com/codepool/camera-focus-control-on-web.html
- https://www.dynamsoft.com/codepool/auto-zoom-web-qr-code-scanner.html
- https://dev.to/ilhannegis/barcode-scanning-on-ios-the-missing-web-api-and-a-webassembly-solution-2in2
- https://kb.strich.io/article/29-camera-access-issues-in-ios-pwa
- https://github.com/mebjas/html5-qrcode/discussions/655
- https://lapcatsoftware.com/articles/2026/1/7.html
- https://github.com/tijnjh/ios-haptics
- https://oberhofer.co/mediastreamtrack-and-its-capabilities/ (fetch failed, not used as a source)
- https://support.scandit.com/hc/en-us/articles/360008443011-Why-does-iOS-keep-asking-for-camera-permissions (fetch blocked, HTTP 403, not used as a source)

Additional credible sources surfaced and used via search synthesis (not independently re-fetched line-by-line, cited inline where used):
- https://github.com/mebjas/html5-qrcode/issues/881, /308, /807, /664, /984
- https://github.com/mozmorris/react-webcam/issues/365
- https://forum.developer.samsung.com/t/why-is-camera2-api-is-such-a-bad-state/13739
- https://github.com/Sec-ant/barcode-detector, https://github.com/Sec-ant/zxing-wasm, https://sec-ant.github.io/zxing-wasm/docs/, https://github.com/Sec-ant/barcode-detector/issues
- https://developer.apple.com/forums/thread/750254, /813044, /813044, /113532
- https://developers.facebook.com/community/threads/432379558191221
- https://dev.to/li/how-to-requestpermission-for-devicemotion-and-deviceorientation-events-in-ios-13-46g2
- https://github.com/WebKit/webkit/blob/main/LayoutTests/fast/device-orientation/device-motion-request-permission-user-gesture.html
- https://support.didomi.io/apple-adds-a-7-day-cap-on-all-script-writable-storage
- https://dev.to/adactio/apple-s-attack-on-service-workers-5fj5
- https://usehardal.com/safari-itp-guide
- https://webkit.org/blog/13966/webkit-features-in-safari-16-4/, https://platform.uno/blog/safari-16-4-support-for-webassembly-fixed-width-simd-how-to-use-it-with-c/, https://devclass.com/2023/02/24/no-longer-the-new-ie-apples-safari-16-4-to-bring-135-features/
- https://www.utsubo.com/blog/frontier-web-apis-2026-production-ready, https://www.ddevtools.com/updates/2026-01-webgpu-webnn-browser-ai, https://cr-status.appspot.com/feature/5176273954144256
- https://x.com/firt/status/2028807962295230776 (single social-media source for the iOS 26.5 haptics-trick-patched claim — unconfirmed elsewhere)
- https://github.com/mebjas/html5-qrcode/pull/570, https://scanapp.org/blog/2022/10/30/using-flash-or-torch-with-html5-qrcode.html
