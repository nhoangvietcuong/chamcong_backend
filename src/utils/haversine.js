const { BadRequestError } = require('../errors/app-error');
const ERROR_CODE = require('../constants/error-code.constants');

/**
 * Calculates the distance between two GPS coordinates using the Haversine formula.
 * Inputs must be valid real numbers:
 * - latitude: [-90, 90]
 * - longitude: [-180, 180]
 * Returns the unrounded distance in meters.
 */
const calculateDistanceMeters = (latitude1, longitude1, latitude2, longitude2) => {
  const lat1 = parseFloat(latitude1);
  const lon1 = parseFloat(longitude1);
  const lat2 = parseFloat(latitude2);
  const lon2 = parseFloat(longitude2);

  if (isNaN(lat1) || lat1 < -90 || lat1 > 90) {
    throw new BadRequestError('Vĩ độ 1 không hợp lệ', ERROR_CODE.INVALID_LATITUDE);
  }
  if (isNaN(lon1) || lon1 < -180 || lon1 > 180) {
    throw new BadRequestError('Kinh độ 1 không hợp lệ', ERROR_CODE.INVALID_LONGITUDE);
  }
  if (isNaN(lat2) || lat2 < -90 || lat2 > 90) {
    throw new BadRequestError('Vĩ độ 2 không hợp lệ', ERROR_CODE.INVALID_LATITUDE);
  }
  if (isNaN(lon2) || lon2 < -180 || lon2 > 180) {
    throw new BadRequestError('Kinh độ 2 không hợp lệ', ERROR_CODE.INVALID_LONGITUDE);
  }

  const R = 6371000; // Earth's radius in meters
  const toRad = (angle) => (angle * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const lat1Rad = toRad(lat1);
  const lat2Rad = toRad(lat2);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1Rad) * Math.cos(lat2Rad) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;

  return distance;
};

module.exports = {
  calculateDistanceMeters,
};
