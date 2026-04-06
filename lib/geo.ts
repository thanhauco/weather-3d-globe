import { Vector3 } from "three";

const DEG2RAD = Math.PI / 180;

/**
 * Convert geographic lat/lon to a point on a sphere of the given radius.
 * Calibrated to match three.js SphereGeometry UVs with an equirectangular
 * earth texture (lon 0 = Greenwich at +X, north pole at +Y).
 */
export function latLonToVec3(lat: number, lon: number, radius: number): Vector3 {
  const phi = (90 - lat) * DEG2RAD;
  const lonRad = lon * DEG2RAD;
  const sinPhi = Math.sin(phi);
  return new Vector3(
    radius * sinPhi * Math.cos(lonRad),
    radius * Math.cos(phi),
    -radius * sinPhi * Math.sin(lonRad)
  );
}

/**
 * Direction from the globe center to the sun (subsolar point) for a given UTC
 * instant. Drives the day/night terminator and city-lights blend.
 */
export function sunDirection(date: Date): Vector3 {
  const utcHours = date.getUTCHours() + date.getUTCMinutes() / 60;
  const subsolarLon = -(utcHours - 12) * 15; // 12:00 UTC -> lon 0

  const start = Date.UTC(date.getUTCFullYear(), 0, 0);
  const doy = (date.getTime() - start) / 86_400_000;
  const declination = 23.44 * Math.sin(((doy - 81) / 365) * 2 * Math.PI);

  return latLonToVec3(declination, subsolarLon, 1).normalize();
}

/**
 * Sun elevation angle (degrees) above the horizon at a lat/lon for a UTC
 * instant. Positive = daytime, negative = night. Used to label sunlight.
 */
export function sunElevation(lat: number, lon: number, date: Date): number {
  const n = latLonToVec3(lat, lon, 1).normalize();
  const s = sunDirection(date);
  const d = n.x * s.x + n.y * s.y + n.z * s.z;
  return Math.asin(Math.max(-1, Math.min(1, d))) * (180 / Math.PI);
}
