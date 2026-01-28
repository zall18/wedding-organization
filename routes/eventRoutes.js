var express = require('express');
var router = express.Router();
const { createEvent, updateEvent, showEvent, deleteEvent, findEvent } = require('../src/controller/eventController');
const authMiddleware = require('../src/middleware/authMiddleware');
const roleMiddleware = require('../src/middleware/roleMiddleware');

router.post("/create", authMiddleware, roleMiddleware('ADMIN'), createEvent);
router.put("/update", authMiddleware, roleMiddleware('ADMIN', 'ORGANIZER'), updateEvent);
router.get("/", authMiddleware, roleMiddleware('ADMIN'), showEvent);
router.delete("/delete/:slug", authMiddleware, roleMiddleware('ADMIN'), deleteEvent);
router.get("/find/:slug", authMiddleware, roleMiddleware("ADMIN"), findEvent);

module.exports = router;
