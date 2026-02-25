var express = require('express');
const { route } = require('./eventRoutes');
const authMiddleware = require('../src/middleware/authMiddleware');
const roleMiddleware = require('../src/middleware/roleMiddleware');
var router = express.Router();
const multer = require('multer');
const guestController = require('../src/controller/guestController');

// Configure multer for CSV upload
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/temp/');
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'guests-' + uniqueSuffix + '.csv');
    }
});

const fileFilter = (req, file, cb) => {
    if (file.mimetype === 'text/csv' || 
        file.originalname.endsWith('.csv')) {
        cb(null, true);
    } else {
        cb(new Error('Only CSV files are allowed'), false);
    }
};

const upload = multer({ 
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB limit
    }
});

router.post('/import', 
    authMiddleware, 
    upload.single('file'), 
    guestController.importGuestsFromCSV
);

router.get('/template', 
    authMiddleware, 
    guestController.downloadCSVTemplate
);

// Guest CRUD
router.post('/', authMiddleware, guestController.createGuest);
router.post('/bulk', authMiddleware, guestController.bulkCreateGuests);
router.get('/search', authMiddleware, guestController.searchGuests);
router.get('/:shortId/confirm', authMiddleware, guestController.guestConfirmed);
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