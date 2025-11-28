/**
 * Class to handle device orientation.
 * IMPORTANT - this code is a modified version the former official three.js
 * DeviceOrientationControls class, which was formerly provided with the
 * three.js repo
 *
 * Changes:
 *
 * - use "deviceorientationabsolute" rather than "deviceorientation"
 *   where available
 * - many others (see comments and GitHub commit history)
 *
 * Original authors (prior to AR.js and locar.js modifications):
 *
 * @author richt / http://richt.me
 * @author WestLangley / http://github.com/WestLangley
 *
 * W3C Device Orientation control (http://w3c.github.io/deviceorientation/spec-source-orientation.html)
 */

import { Euler, EventDispatcher, MathUtils, Quaternion, Vector3 } from "three";
import EventEmitter from "./event-emitter.js";
import {
  LOCAR_DEVICE_ORIENTATION_PERMISSION_MODAL,
  LOCAR_DEVICE_ORIENTATION_PERMISSION_BUTTON,
  LOCAR_DEVICE_ORIENTATION_PERMISSION_MESSAGE,
  LOCAR_DEVICE_ORIENTATION_PERMISSION_INNER,
  LOCAR_DEVICE_ORIENTATION_PERMISSION_BUTTON_INNER,
} from "../constants/classes.js";

const LOCAR_DEVICE_ORIENTATION_MESSAGE =
  "This immersive website requires access to your device motion sensors.";

const isIOS =
  navigator.userAgent.match(/iPhone|iPad|iPod/i) ||
  (/Macintosh/i.test(navigator.userAgent) &&
    navigator.maxTouchPoints != null &&
    navigator.maxTouchPoints > 1); // for iPad Safari - see #660 in main repo

const _zee = new Vector3(0, 0, 1);
const _euler = new Euler();
const _q0 = new Quaternion();
const _q1 = new Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5)); // - PI/2 around the x-axis

class DeviceOrientationControls extends EventDispatcher {
  /**
   * Create an instance of DeviceOrientationControls.
   * @param {Object} object - the object to attach the controls to
   * (usually your Three.js camera)
   * @param {Object} options - options for DeviceOrientationControls: currently accepts smoothingFactor, enablePermissionDialog
   */
  constructor(object, options = {}) {
    super();
    this.eventEmitter = new EventEmitter();

    const scope = this;

    this.object = object;
    this.object.rotation.reorder("YXZ");

    this.enabled = true;

    this.deviceOrientation = null;
    this.screenOrientation = 0;

    this.alphaOffset = 0; // radians
    this.orientationOffset = 0; // iOS orientation offset
    this.initialOffset = null; // used in fix provided in issue #466 on main AR.js repo, iOS related

    this.lastCompassY = undefined;
    this.lastOrientation = null;

    this.TWO_PI = 2 * Math.PI;
    this.HALF_PI = 0.5 * Math.PI;
    this.orientationChangeEventName =
      "ondeviceorientationabsolute" in window
        ? "deviceorientationabsolute"
        : "deviceorientation";

    this.smoothingFactor = options.smoothingFactor || 1;
    this.enablePermissionDialog = options.enablePermissionDialog ?? true;
    this.enableInlineStyling = options.enableStyling ?? true;
    this.preferConfirmDialog = options.preferConfirmDialog ?? false;

    const onDeviceOrientationChangeEvent = function ({
      alpha,
      beta,
      gamma,
      webkitCompassHeading,
    }) {
      if (isIOS) {
        const ccwNorthHeading = 360 - webkitCompassHeading;
        scope.alphaOffset = MathUtils.degToRad(ccwNorthHeading - alpha);
        scope.deviceOrientation = { alpha, beta, gamma, webkitCompassHeading };
      } else {
        if (alpha < 0) alpha += 360;
        scope.deviceOrientation = { alpha, beta, gamma };
      }
      window.dispatchEvent(
        new CustomEvent("camera-rotation-change", {
          detail: { cameraRotation: object.rotation },
        })
      );
    };

    const onScreenOrientationChangeEvent = function () {
      scope.screenOrientation = window.orientation || 0;
      if (isIOS) {
        if (scope.screenOrientation === 90) {
          scope.orientationOffset = -scope.HALF_PI;
        } else if (scope.screenOrientation === -90) {
          scope.orientationOffset = scope.HALF_PI;
        } else {
          scope.orientationOffset = 0;
        }
      }
    };

    const setObjectQuaternion = function (
      quaternion,
      alpha,
      beta,
      gamma,
      orient
    ) {
      _euler.set(beta, alpha, -gamma, "YXZ"); // 'ZXY' for the device, but 'YXZ' for us

      quaternion.setFromEuler(_euler); // orient the device

      quaternion.multiply(_q1); // camera looks out the back of the device, not the top

      quaternion.multiply(_q0.setFromAxisAngle(_zee, -orient)); // adjust for screen orientation
    };

    /**
     * Update the device orientation controls.
     * Should be called from your three.js rendering/animation function.
     * Permission handling now factored out into requestOrientationPermissions()
     * Therefore, connect() should now only be called once permission has been
     * granted, ie after the "deviceorientationgranted" event has been emitted.
     * This is a breaking change and now means that you need to call connect()
     * yourself - previously it was done automatically.
     */
    this.connect = function () {
      onScreenOrientationChangeEvent(); // run once on load

      window.addEventListener(
        "orientationchange",
        onScreenOrientationChangeEvent
      );
      window.addEventListener(
        scope.orientationChangeEventName,
        onDeviceOrientationChangeEvent
      );

      scope.enabled = true;
    };

    this.disconnect = function () {
      window.removeEventListener(
        "orientationchange",
        onScreenOrientationChangeEvent
      );
      window.removeEventListener(
        scope.orientationChangeEventName,
        onDeviceOrientationChangeEvent
      );

      scope.enabled = false;
      scope.initialOffset = false;
      scope.deviceOrientation = null;
    };

    // On iOS 13+ devices, request orientation permissions
    // MUST come after a user gesture (e.g. pressing button):
    // see obtainPermissionGesture() below.
    // This is therefore tightly coupled to obtainPermissionGesture(), thus is
    // called directly from it.
    this.requestOrientationPermissions = function () {
      if (
        window.DeviceOrientationEvent !== undefined &&
        typeof window.DeviceOrientationEvent.requestPermission === "function"
      ) {
        window.DeviceOrientationEvent.requestPermission()
          .then((response) => {
            if (response === "granted") {
              // Emit the "deviceorientationgranted" event: calls to connect()
              // would typically be done from this event's handler
              /**
               * Device orientation granted event.
               * @event DeviceOrientationControls#deviceorientationgranted
               * @param {Object} event object with 'target' field, referencing the DeviceOrientationControls object.
               */
              this.eventEmitter.emit("deviceorientationgranted", {
                target: this,
              });
            } else {
              /**
               * Device orientation error event.
               * @event DeviceOrientationControls#deviceorientationerror
               * @param {Object} error object with 'code' and 'message' fields.
               */
              this.eventEmitter.emit("deviceorientationerror", {
                code: "LOCAR_DEVICE_ORIENTATION_PERMISSION_DENIED",
                message:
                  "Permission for device orientation denied - AR will not work correctly",
              });
            }
          })
          .catch(function (error) {
            this.eventEmitter.emit("deviceorientationerror", {
              code: "LOCAR_DEVICE_ORIENTATION_PERMISSION_FAILED",
              message:
                "Permission request for device orientation failed - AR will not work correctly",
              error: JSON.stringify(error, null, 2),
            });
          });
      } else {
        // Should never go here, emit an error if we do
        this.eventEmitter.emit("deviceorientationerror", {
          code: "LOCAR_DEVICE_ORIENTATION_INTERNAL_ERROR",
          message:
            "Internal error: no requestPermission() found although requestOrientationPermissions() was called - please raise an issue on GitHub",
        });
      }
    };

    // eslint-disable-next-line no-unused-vars
    this.update = function ({ theta: s = 0 } = { theta: 0 }) {
      if (scope.enabled === false) return;
      const device = scope.deviceOrientation;

      if (device) {
        let alpha = device.alpha
          ? MathUtils.degToRad(device.alpha) + scope.alphaOffset
          : 0; // Z

        let beta = device.beta ? MathUtils.degToRad(device.beta) : 0; // X'

        let gamma = device.gamma ? MathUtils.degToRad(device.gamma) : 0; // Y''

        const orient = scope.screenOrientation
          ? MathUtils.degToRad(scope.screenOrientation)
          : 0; // O

        if (scope.smoothingFactor < 1) {
          if (scope.lastOrientation) {
            const k = scope.smoothingFactor;
            alpha = scope._getSmoothedAngle(
              alpha,
              scope.lastOrientation.alpha,
              k
            );
            beta = scope._getSmoothedAngle(
              beta + Math.PI,
              scope.lastOrientation.beta,
              k
            );
            gamma = scope._getSmoothedAngle(
              gamma + scope.HALF_PI,
              scope.lastOrientation.gamma,
              k,
              Math.PI
            );
          } else {
            beta += Math.PI;
            gamma += scope.HALF_PI;
          }

          scope.lastOrientation = {
            alpha,
            beta,
            gamma,
          };
        }

        if (isIOS) {
          const currentQuaternion = new Quaternion();
          setObjectQuaternion(
            currentQuaternion,
            alpha,
            scope.smoothingFactor < 1 ? beta - Math.PI : beta,
            scope.smoothingFactor < 1 ? gamma - Math.PI / 2 : gamma,
            orient
          );

          const currentEuler = new Euler().setFromQuaternion(
            currentQuaternion,
            "YXZ"
          );

          let compassY = MathUtils.degToRad(360 - device.webkitCompassHeading);

          if (scope.smoothingFactor < 1 && scope.lastCompassY !== void 0) {
            compassY = scope._getSmoothedAngle(
              compassY,
              scope.lastCompassY,
              scope.smoothingFactor
            );
          }

          scope.lastCompassY = compassY;

          currentEuler.y = compassY + (scope.orientationOffset || 0);

          currentQuaternion.setFromEuler(currentEuler);

          scope.object.quaternion.copy(currentQuaternion);
        } else {
          setObjectQuaternion(
            scope.object.quaternion,
            isIOS ? alpha + scope.alphaOffset : alpha,
            scope.smoothingFactor < 1 ? beta - Math.PI : beta,
            scope.smoothingFactor < 1 ? gamma - Math.PI / 2 : gamma,
            orient
          );
        }
      }
    };

    this.getCorrectedHeading = function () {
      const { deviceOrientation: device } = scope;
      if (!device) return 0;

      let heading = 0;

      if (isIOS) {
        // iOS always uses webkitCompassHeading
        heading = 360 - device.webkitCompassHeading;
        if (scope.orientationOffset) {
          heading += scope.orientationOffset * (180 / Math.PI);
          heading = (heading + 360) % 360;
        }
      } else {
        // Android: Check if we have absolute values
        const isAbsolute =
          device.absolute === true ||
          scope.orientationChangeEventName === "deviceorientationabsolute";
        heading = device.alpha ? device.alpha : 0;
        if (isAbsolute) {
          // With absolute values, we can use the alpha value directly as compass heading
          // but possibly with a system-specific offset
          // Reverse like iOS if alpha increases clockwise
          //heading = 360 - heading;
        }
        // Reverse direction for Android
        heading = (360 - heading) % 360;
        if (heading < 0) heading += 360;
      }
      return heading;
    };

    // NW Added
    this._orderAngle = function (a, b, range = scope.TWO_PI) {
      if (
        (b > a && Math.abs(b - a) < range / 2) ||
        (a > b && Math.abs(b - a) > range / 2)
      ) {
        return { left: a, right: b };
      } else {
        return { left: b, right: a };
      }
    };

    // NW Added
    this._getSmoothedAngle = function (a, b, k, range = scope.TWO_PI) {
      const angles = scope._orderAngle(a, b, range);
      const angleshift = angles.left;
      const origAnglesRight = angles.right;
      angles.left = 0;
      angles.right -= angleshift;
      if (angles.right < 0) angles.right += range;
      let newangle =
        origAnglesRight == b
          ? (1 - k) * angles.right + k * angles.left
          : k * angles.right + (1 - k) * angles.left;
      newangle += angleshift;
      if (newangle >= range) newangle -= range;
      return newangle;
    };

    // Provided in fix on issue #466 (main AR.js) - iOS related
    this.updateAlphaOffset = function () {
      scope.initialOffset = false;
    };

    this.dispose = function () {
      scope.disconnect();
    };

    // provided with fix on issue #466 (main AR.js)
    this.getAlpha = function () {
      const { deviceOrientation: device } = scope;
      return device && device.alpha
        ? MathUtils.degToRad(device.alpha) + scope.alphaOffset
        : 0;
    };

    // provided with fix on issue #466 (main AR.js)
    this.getBeta = function () {
      const { deviceOrientation: device } = scope;
      return device && device.beta ? MathUtils.degToRad(device.beta) : 0;
    };

    this.getGamma = function () {
      const { deviceOrientation: device } = scope;
      return device && device.gamma ? MathUtils.degToRad(device.gamma) : 0;
    };

    // Provide gesture before initialising device orientation controls
    // From PR #659 on the main AR.js repo
    // Thanks to @ma2yama
    this.createObtainPermissionGestureDialog = function () {
      // Add all the elements and a common class names to all elements
      // to allow external styling
      const startModal = document.createElement("div");
      startModal.classList.add(LOCAR_DEVICE_ORIENTATION_PERMISSION_MODAL);

      const innerDiv = document.createElement("div");
      innerDiv.classList.add(LOCAR_DEVICE_ORIENTATION_PERMISSION_INNER);

      const msgDiv = document.createElement("div");
      msgDiv.classList.add(LOCAR_DEVICE_ORIENTATION_PERMISSION_MESSAGE);

      const btnDiv = document.createElement("div");
      btnDiv.classList.add(LOCAR_DEVICE_ORIENTATION_PERMISSION_BUTTON_INNER);

      const btn = document.createElement("button");
      btn.classList.add(LOCAR_DEVICE_ORIENTATION_PERMISSION_BUTTON);

      document.body.appendChild(startModal);

      // Apply inline styling if required, the styling tries to resemble
      // a native ios dialog as closely as possible
      if (this.enableInlineStyling === true) {
        const startModalStyles = {
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol'",
          display: "flex",
          position: "fixed",
          zIndex: 100000,
          justifyContent: "center",
          alignItems: "center",
          backgroundColor: "rgba(0,0,0,0.2)",
          inset: 0,
          padding: "20px",
        };

        const innerDivStyles = {
          backgroundColor: "rgba(220, 220, 220, 0.85)",
          padding: "6px 0",
          borderRadius: "10px",
          width: "100%",
          maxWidth: "400px",
        };

        const msgDivStyles = {
          padding: "10px 12px",
          textAlign: "center",
          fontWeight: 400,
          fontSize: "13px",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
        };

        const btnDivStyles = {
          display: "block",
          textAlign: "center",
          textDecoration: "none",
          borderTop: "rgb(180,180,180) solid 1px",
        };

        const btnStyles = {
          display: "block",
          width: "100%",
          textAlign: "center",
          appearance: "none",
          background: "none",
          border: "none",
          outline: "none",
          padding: "10px",
          fontWeight: 400,
          fontSize: "16px",
          color: "#2e7cf1",
          cursor: "pointer",
        };

        for (let key in startModalStyles) {
          startModal.style[key] = startModalStyles[key];
        }
        for (let key in innerDivStyles) {
          innerDiv.style[key] = innerDivStyles[key];
        }
        for (let key in msgDivStyles) {
          msgDiv.style[key] = msgDivStyles[key];
        }
        for (let key in btnDivStyles) {
          btnDiv.style[key] = btnDivStyles[key];
        }
        for (let key in btnStyles) {
          btn.style[key] = btnStyles[key];
        }
      }

      startModal.appendChild(innerDiv);
      innerDiv.appendChild(msgDiv);
      innerDiv.appendChild(btnDiv);
      msgDiv.appendChild(
        document.createTextNode(LOCAR_DEVICE_ORIENTATION_MESSAGE)
      );

      const onStartClick = () => {
        this.requestOrientationPermissions();
        startModal.style.display = "none";
      };

      btn.addEventListener("click", onStartClick);
      btn.appendChild(document.createTextNode("OK"));

      btnDiv.appendChild(btn);
      document.body.appendChild(startModal);
    };

    this.obtainPermissionGesture = function () {
      // Create a simple ok/cancel confirm() dialog instead of creating an html one
      // if defined in the options, otherwise create the html dialog as above
      if (this.preferConfirmDialog === true) {
        if (window.confirm(LOCAR_DEVICE_ORIENTATION_MESSAGE)) {
          this.requestOrientationPermissions();
        }
      } else {
        this.createObtainPermissionGestureDialog();
      }
    };
  }

  on(eventName, eventHandler) {
    this.eventEmitter.on(eventName, eventHandler);
  }

  /**
   * Initialise device orientation controls.
   * Should be called after you have created the DeviceOrientationControls
   * object and set up the deviceorientationgranted and deviceorientationerror
   * event handlers.
   */

  init() {
    if (window.DeviceOrientationEvent === undefined) {
      this.eventEmitter.emit("deviceorientationerror", {
        code: "LOCAR_DEVICE_ORIENTATION_NOT_SUPPORTED",
        message: "Device orientation API not supported",
      });
    } else if (window.isSecureContext === false) {
      this.eventEmitter.emit("deviceorientationerror", {
        code: "LOCAR_DEVICE_ORIENTATION_NO_HTTPS",
        message:
          "DeviceOrientationEvent is only available in secure contexts (https)",
      });
    } else {
      // Option to handle iOS permissions and connecting elsewhere
      const isiOSWithReq =
        typeof window.DeviceOrientationEvent.requestPermission === "function";

      if (isiOSWithReq && this.enablePermissionDialog) {
        this.obtainPermissionGesture();
      } else {
        // if not iOS we don't have to request permission so emit the
        // "deviceorientationgranted" event straight away
        this.eventEmitter.emit("deviceorientationgranted", { target: this });
      }
    }
  }
}
export default DeviceOrientationControls;
