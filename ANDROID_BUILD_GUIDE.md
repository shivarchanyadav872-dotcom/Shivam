# BATTLE ROYALE MAX — Setup & Android APK Build Instructions

## 1. Local Web & Multiplayer Server Setup

```bash
# Install dependencies
npm install

# Run full-stack development server (Express + WebSocket + Vite on port 3000)
npm run dev

# Type-check and build production bundle
npm run lint
npm run build
```

## 2. Controls

### Mobile Touchscreen (Landscape)
- **Left Thumb**: Virtual joystick (push to outer rim to Sprint).
- **Right Touch Zone**: Drag anywhere on the right side to rotate camera & aim.
- **Right Action Cluster**: `FIRE` (hold for automatic weapons), `AIM` (ADS zoom), `JUMP`, `CROUCH`, `RELOAD`, `MEDKIT`.
- **Parachute Drop**: Steer with joystick during freefall; tap `DEPLOY CHUTE` (auto-deploys at 32m altitude).

### Desktop Testing Controls
- **Move**: `W A S D` or Arrow Keys (`Shift` to Sprint)
- **Look / Shoot / Aim**: Click canvas to lock mouse · Left Click Shoot · Right Click ADS
- **Actions**: `Space` Jump / Deploy Chute · `C` Crouch · `R` Reload · `F` / `E` Pickup Loot · `H` Medkit · `1 / 2 / 3` Switch Weapon Slots

---

## 3. Exporting to Android APK (Capacitor + Gradle)

1. **Build the optimized production bundle (`dist/`)**:
   ```bash
   npm run build
   ```

2. **Install Capacitor CLI & Android platform**:
   ```bash
   npm install @capacitor/core @capacitor/cli @capacitor/android
   npx cap add android
   npx cap sync android
   ```

3. **Enforce Landscape Orientation & Hardware Acceleration**:
   In `android/app/src/main/AndroidManifest.xml`, add to `<activity android:name=".MainActivity" ...>`:
   ```xml
   android:screenOrientation="sensorLandscape"
   android:hardwareAccelerated="true"
   ```

4. **Point Online Multiplayer to Your Deployed Server URL**:
   For standalone APKs connecting to a live multiplayer server, configure `VITE_WS_URL` or `server.url` in `capacitor.config.ts` to point to your hosted Express/WebSocket backend.

5. **Compile the APK**:
   ```bash
   # Open in Android Studio to sign & build APK/AAB:
   npx cap open android

   # Or build via Gradle CLI:
   cd android
   ./gradlew assembleDebug    # Debug APK -> android/app/build/outputs/apk/debug/
   ./gradlew assembleRelease  # Release APK (requires signing keystore)
   ```
