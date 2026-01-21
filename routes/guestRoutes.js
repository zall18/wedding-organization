var express = require('express');
const { createQuest, searchQuest, confirmGuest } = require('../src/controller/guestController');
const { route } = require('./eventRoutes');
var router = express.Router();

router.post('/create', createQuest);
router.get('/search', searchQuest);
router.get('/confirm/:id', confirmGuest);

module.exports = router;