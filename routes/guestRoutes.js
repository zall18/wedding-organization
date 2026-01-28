var express = require('express');
const { createQuest, searchQuest, confirmGuest, checkinHandler, undoCheckin, checkinHistory } = require('../src/controller/guestController');
const { route } = require('./eventRoutes');
const authMiddleware = require('../src/middleware/authMiddleware');
const roleMiddleware = require('../src/middleware/roleMiddleware');
var router = express.Router();

router.post('/create', authMiddleware, roleMiddleware('ADMIN', 'ORGANIZER', 'STAFF'), createQuest);
router.get('/search', authMiddleware, roleMiddleware('ADMIN', 'ORGANIZER', 'STAFF'), searchQuest);
router.get('/confirm/:id', authMiddleware, roleMiddleware('ADMIN', 'ORGANIZER', 'STAFF'), confirmGuest);
router.post('/events/:eventId/checkin', authMiddleware, roleMiddleware('ADMIN', 'ORGANIZER', 'STAFF'), checkinHandler);
router.delete('/events/checkin/:id/undo', authMiddleware, roleMiddleware('ADMIN', 'ORGANIZER', 'STAFF'), undoCheckin);
router.get('/events/:eventId/checkins', authMiddleware, roleMiddleware('ADMIN', 'ORGANIZER', 'STAFF'), checkinHistory);


module.exports = router;