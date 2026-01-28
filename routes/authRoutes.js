var express = require('express');
var router = express.Router();

const { register, login } = require("../src/controller/authController");
const authMiddleware = require('../src/middleware/authMiddleware');
const roleMiddleware = require('../src/middleware/roleMiddleware');


router.post("/register", authMiddleware, roleMiddleware('ADMIN', 'ORGANIZER'), register);
router.post("/login", login);


module.exports = router;