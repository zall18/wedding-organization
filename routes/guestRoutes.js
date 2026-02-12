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
router.get('/event/:slug', authMiddleware, guestController.getGuestByEventIdSlug);

// Check-in
router.post('/:eventId/checkin', authMiddleware, guestController.checkinHandler);
router.post('/checkin/:id/photo', authMiddleware, guestController.addCheckInPhoto);
router.post('/checkin/:id/undo', authMiddleware, guestController.undoCheckin);
router.get('/:eventId/checkins', authMiddleware, guestController.checkinHistory);
router.get('/:eventId/checkins/stats', authMiddleware, guestController.getCheckinStats);
router.put('/photo/:photoId/status', authMiddleware, guestController.updatePhotoStatus);

// WhatsApp
router.post('/whatsapp/log', authMiddleware, guestController.createWhatsAppLog);
router.put('/whatsapp/status', authMiddleware, guestController.updateWhatsAppStatus);

// Guest Wishes (Public)
router.post('/wishes', guestController.createGuestWish);
router.get('/:eventId/wishes', guestController.getGuestWishes);

// Event Stats
router.get('/:eventId/stats', authMiddleware, guestController.getEventStats);

module.exports = router;