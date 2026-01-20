var express = require('express');
var router = express.Router();
const { createEvent, updateEvent, showEvent, deleteEvent, findEvent } = require('../src/controller/eventController');

router.post("/create", createEvent);
router.put("/update", updateEvent);
router.get("/", showEvent);
router.delete("/delete/:slug", deleteEvent);
router.get("/find/:slug", findEvent);

module.exports = router;
