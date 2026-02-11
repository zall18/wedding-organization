var express = require('express');
const { route } = require('./eventRoutes');
const authMiddleware = require('../src/middleware/authMiddleware');
const roleMiddleware = require('../src/middleware/roleMiddleware');
var router = express.Router();
const guestController = require('../src/controller/guestController');

// Guest CRUD
router.post('/', authMiddleware, guestController.createGuest);
router.post('/bulk', authMiddleware, guestController.bulkCreateGuests);
router.get('/search', authMiddleware, guestController.searchGuests);
router.get('/:id', authMiddleware, guestController.getGuestById);
router.put('/:id', authMiddleware, guestController.updateGuest);
router.delete('/:id', authMiddleware, guestController.deleteGuest);

// Check-in
router.post('/:eventId/checkin', authMiddleware, guestController.checkinHandler);
router.post('/checkin/:id/undo', authMiddleware, guestController.undoCheckin);
router.get('/:eventId/checkins', authMiddleware, guestController.checkinHistory);
router.get('/:eventId/checkins/stats', authMiddleware, guestController.getCheckinStats);

// WhatsApp
router.post('/send-photo', authMiddleware, guestController.sendPhotoToWhatsApp);

// RSVP (Public)
router.post('/rsvp', guestController.submitRSVP);
router.get('/rsvp/:guestId', guestController.getGuestRSVP);

module.exports = router;