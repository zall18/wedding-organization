var express = require('express');
var router = express.Router();
const eventController = require('../src/controller/eventController');
const authMiddleware = require('../src/middleware/authMiddleware');
const roleMiddleware = require('../src/middleware/roleMiddleware');

// routes/event.js
router.post('/', authMiddleware, eventController.createEvent);
router.put('/:id', authMiddleware, eventController.updateEvent);
router.delete('/:id', authMiddleware, eventController.deleteEvent);
router.get('/', authMiddleware, eventController.showEvent);
router.get('/:identifier', authMiddleware, eventController.findEvent); // bisa slug atau ID
router.get('/public/:shortCode', eventController.getEventByShortCode); // public route
router.patch('/:id/toggle', authMiddleware, eventController.toggleEventActivation);

module.exports = router;
