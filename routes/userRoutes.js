// routes/user.js
const express = require('express');
const router = express.Router();
const authMiddleware = require('../src/middleware/authMiddleware');
const userController = require('../src/controller/userController');

// All routes require authentication
router.use(authMiddleware);

// User CRUD
router.post('/', userController.createUser);
router.get('/', userController.getAllUsers);
router.get('/me', userController.getCurrentUser);
router.get('/statistics', userController.getUserStatistics);
router.get('/:id', userController.getUserById);
router.put('/:id', userController.updateUser);
router.put('/:id/password', userController.updatePassword);
router.delete('/:id', userController.deleteUser);

// Role-based filters
router.get('/role/super-admin', userController.getSuperAdmins);
router.get('/role/admin', userController.getAdmins);
router.get('/role/staff', userController.getStaff);

// Event assignment
router.put('/:id/assign', userController.assignToEvent);
router.get('/event/:eventId', userController.getUsersByEvent);

// Status management
router.put('/:id/deactivate', userController.deactivateUser);
router.put('/:id/activate', userController.activateUser);

module.exports = router;