const { EventEmitter } = require('events');
const eventBus = new EventEmitter();

const LEAVE_EVENTS = {
  REQUEST_CREATED: 'leave.request.created',
  REQUEST_APPROVED: 'leave.request.approved',
  REQUEST_REJECTED: 'leave.request.rejected',
  REQUEST_CANCELLED: 'leave.request.cancelled',
};

const OT_EVENTS = {
  REQUEST_CREATED: 'ot.request.created',
  REQUEST_APPROVED: 'ot.request.approved',
  REQUEST_REJECTED: 'ot.request.rejected',
  REQUEST_CANCELLED: 'ot.request.cancelled',
};

module.exports = { eventBus, LEAVE_EVENTS, OT_EVENTS };
