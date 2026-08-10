const { body, param } = require('express-validator');
const employeeRepository = require('../../../repositories/employee-repository');
const { ValidationError, BadRequestError } = require('../../../errors/app-error');
const ERROR_CODE = require('../../../constants/error-code.constants');

const checkEmployeeExistsAndActive = async (req, res, next) => {
  try {
    let employeeId = req.auth.employeeId;
    // Allow admin to specify a target employeeId via request query, body, or params
    const targetEmployeeId = req.query.employeeId || req.body.employeeId || req.params.employeeId;
    const ROLE = require('../../../constants/role.constants');
    if (ROLE.ROLE_LEVEL[req.auth.role] >= ROLE.ROLE_LEVEL[ROLE.ADMIN] && targetEmployeeId) {
      employeeId = parseInt(targetEmployeeId, 10);
    }
    const employee = await employeeRepository.findById(employeeId);
    if (!employee) {
      return next(new BadRequestError('Nhân viên không tồn tại', ERROR_CODE.EMPLOYEE_NOT_FOUND));
    }
    if (employee.status !== 1) {
      return next(new BadRequestError('Nhân viên đã ngừng hoạt động', ERROR_CODE.EMPLOYEE_INACTIVE));
    }
    next();
  } catch (err) {
    next(err);
  }
};

const beginRegistrationValidator = [
  checkEmployeeExistsAndActive,
];

const finishRegistrationValidator = [
  checkEmployeeExistsAndActive,
  body('registrationResponse')
    .notEmpty()
    .withMessage('Registration response is required'),
  body('registrationResponse.id')
    .notEmpty()
    .withMessage('Credential ID is required')
    .isString()
    .withMessage('Credential ID must be a string'),
  body('registrationResponse.response.clientDataJSON')
    .notEmpty()
    .withMessage('clientDataJSON is required'),
  body('registrationResponse.response.attestationObject')
    .notEmpty()
    .withMessage('attestationObject is required'),
  body('deviceName')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('Device name cannot be empty'),
];

const beginAuthenticationValidator = [
  checkEmployeeExistsAndActive,
];

const finishAuthenticationValidator = [
  checkEmployeeExistsAndActive,
  body('authenticationResponse')
    .notEmpty()
    .withMessage('Authentication response is required'),
  body('authenticationResponse.id')
    .notEmpty()
    .withMessage('Credential ID is required')
    .isString()
    .withMessage('Credential ID must be a string'),
  body('authenticationResponse.response.clientDataJSON')
    .notEmpty()
    .withMessage('clientDataJSON is required'),
  body('authenticationResponse.response.authenticatorData')
    .notEmpty()
    .withMessage('authenticatorData is required'),
  body('authenticationResponse.response.signature')
    .notEmpty()
    .withMessage('Signature is required'),
];

const deleteCredentialValidator = [
  checkEmployeeExistsAndActive,
  param('id')
    .notEmpty()
    .withMessage('Credential ID is required')
    .isString()
    .withMessage('Credential ID must be a string'),
];

module.exports = {
  beginRegistrationValidator,
  finishRegistrationValidator,
  beginAuthenticationValidator,
  finishAuthenticationValidator,
  deleteCredentialValidator,
};
