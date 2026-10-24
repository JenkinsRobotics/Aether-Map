# Android receiver dependencies

- `io.github.webrtc-sdk:android:150.7871.01`, maintained precompiled native WebRTC.
  [Release](https://github.com/webrtc-sdk/android/releases/tag/v150.7871.01),
  [Maven artifact](https://repo.maven.apache.org/maven2/io/github/webrtc-sdk/android/150.7871.01/),
  [upstream build repository](https://github.com/webrtc-sdk/android/tree/v150.7871.01).
  The artifact's POM declares BSD 3-Clause; upstream WebRTC and bundled dependencies
  have their respective notices in the release's
  [Licenses/WEBRTC.md](https://github.com/webrtc-sdk/android/blob/v150.7871.01/Licenses/WEBRTC.md).
  The SDK packaging repository uses MIT (copyright 2023 WebRTC SDKs). Both the full
  upstream aggregate and SDK MIT text are retained verbatim in
  `app/src/main/assets/licenses/`. The AAR itself includes no license asset, so the
  app explicitly packages those notices. No native library or license is modified.
- `com.google.zxing:core:3.5.3`: local QR encoding, Apache-2.0.
  [Source and license](https://github.com/zxing/zxing/tree/zxing-3.5.3).
  Full license is retained in `app/src/main/assets/licenses/ZXING-APACHE.txt`.
- JUnit 4.13.2 and org.json 20240303 are JVM test-only dependencies, not APK runtime
  dependencies. Gradle/Android build tooling is not packaged into the APK.
- Aether branding comes from the Map checkout's versioned `@aether/assets`
  dependency and is copied by `prepareBranding`; archived originals are untouched.

Dependency locks and `gradle/verification-metadata.xml` pin the downloaded artifacts.
The verification report also records their SHA256 and the final APK digest.
