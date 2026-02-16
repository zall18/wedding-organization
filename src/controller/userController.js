const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

// =======================
// HELPER FUNCTIONS
// =======================

/**
 * Format phone number untuk konsistensi
 */
const formatPhone = (phone) => {
    if (!phone) return null;
    
    // Remove all non-digit characters
    let formatted = phone.replace(/\D/g, '');
    
    // Convert 08 to 628
    if (formatted.startsWith('08')) {
        formatted = '628' + formatted.slice(1);
    }
    // Convert 8 to 628
    else if (formatted.startsWith('8')) {
        formatted = '628' + formatted.slice(1);
    }
    // Convert +62 to 62
    else if (formatted.startsWith('62')) {
        formatted = formatted;
    }
    
    // Limit to 20 characters sesuai schema
    return formatted.slice(0, 20);
};

/**
 * Hash password
 */
const hashPassword = async (password) => {
    const salt = await bcrypt.genSalt(10);
    return await bcrypt.hash(password, salt);
};

// =======================
// USER CRUD
// =======================

/**
 * CREATE USER
 * Membuat user baru (SUPER_ADMIN, ADMIN, STAFF)
 */
const createUser = async(req, res) => {
    const {
        email,
        phone,
        password,
        name,
        avatarUrl,
        role,
        eventId,
        isActive = true
    } = req.body;

    try {
        // Validasi role yang boleh dibuat
        // SUPER_ADMIN hanya bisa dibuat oleh SUPER_ADMIN lain
        if (role === 'SUPER_ADMIN' && req.user.role !== 'SUPER_ADMIN') {
            return res.status(403).json({
                msg: "Only SUPER_ADMIN can create another SUPER_ADMIN"
            });
        }

        // Check if user already exists
        const existingUser = await prisma.user.findUnique({
            where: { email }
        });

        if (existingUser) {
            return res.status(400).json({
                msg: "User with this email already exists"
            });
        }

        // Format phone
        const formattedPhone = formatPhone(phone);

        // Hash password
        const hashedPassword = await hashPassword(password);

        // Create user
        const user = await prisma.user.create({
            data: {
                email,
                phone: formattedPhone,
                password: hashedPassword,
                name,
                avatarUrl,
                role,
                eventId: eventId ? parseInt(eventId) : null,
                isActive,
                createdAt: new Date(),
                updatedAt: new Date()
            },
            select: {
                id: true,
                email: true,
                phone: true,
                name: true,
                avatarUrl: true,
                role: true,
                eventId: true,
                isActive: true,
                lastLoginAt: true,
                createdAt: true,
                updatedAt: true,
                event: {
                    select: {
                        id: true,
                        weddingTitle: true,
                        shortCode: true
                    }
                }
            }
        });

        res.status(201).json({
            msg: "Success to create user",
            data: user
        });

    } catch(e) {
        console.error('Create user error:', e);
        res.status(500).json({
            msg: "Server error",
            error: process.env.NODE_ENV === 'development' ? e.message : undefined
        });
    }
};

/**
 * GET ALL USERS
 * Mendapatkan semua user dengan filter berdasarkan role
 */
const getAllUsers = async(req, res) => {
    const {
        role,
        eventId,
        isActive,
        search,
        page = 1,
        limit = 20,
        sortBy = 'createdAt',
        sortOrder = 'desc'
    } = req.query;

    try {
        // Build where clause
        const whereClause = {};

        // Filter by role
        if (role) {
            // SUPER_ADMIN bisa lihat semua
            // ADMIN hanya bisa lihat STAFF
            // STAFF tidak bisa lihat user lain (handle di middleware)
            if (req.user.role === 'ADMIN' && role === 'SUPER_ADMIN') {
                return res.status(403).json({
                    msg: "Admin cannot view SUPER_ADMIN users"
                });
            }
            whereClause.role = role;
        }

        // Filter by event
        if (eventId) {
            whereClause.eventId = parseInt(eventId);
        }

        // Filter by active status
        if (isActive !== undefined) {
            whereClause.isActive = isActive === 'true';
        }

        // Search by name or email
        if (search) {
            whereClause.OR = [
                {
                    name: {
                        contains: search,
                        mode: 'insensitive'
                    }
                },
                {
                    email: {
                        contains: search,
                        mode: 'insensitive'
                    }
                },
                {
                    phone: {
                        contains: search
                    }
                }
            ];
        }

        // Pagination
        const skip = (parseInt(page) - 1) * parseInt(limit);
        const take = parseInt(limit);

        // Get total count
        const totalCount = await prisma.user.count({
            where: whereClause
        });

        // Get users
        const users = await prisma.user.findMany({
            where: whereClause,
            select: {
                id: true,
                email: true,
                phone: true,
                name: true,
                avatarUrl: true,
                role: true,
                eventId: true,
                isActive: true,
                lastLoginAt: true,
                createdAt: true,
                updatedAt: true,
                event: {
                    select: {
                        id: true,
                        weddingTitle: true,
                        groomName: true,
                        brideName: true,
                        shortCode: true
                    }
                },
                _count: {
                    select: {
                        checkIns: true,
                        eventPhotos: true
                    }
                }
            },
            orderBy: {
                [sortBy]: sortOrder
            },
            skip,
            take
        });

        res.status(200).json({
            msg: "Success to get users",
            data: users,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                totalCount,
                totalPages: Math.ceil(totalCount / parseInt(limit)),
                hasNextPage: skip + take < totalCount,
                hasPrevPage: page > 1
            }
        });

    } catch(e) {
        console.error('Get all users error:', e);
        res.status(500).json({
            msg: "Server error"
        });
    }
};

/**
 * GET SUPER ADMIN ONLY
 * Mendapatkan semua user dengan role SUPER_ADMIN
 */
const getSuperAdmins = async(req, res) => {
    const {
        page = 1,
        limit = 20,
        search
    } = req.query;

    try {
        // Only SUPER_ADMIN can view SUPER_ADMIN list
        if (req.user.role !== 'SUPER_ADMIN') {
            return res.status(403).json({
                msg: "Only SUPER_ADMIN can view SUPER_ADMIN users"
            });
        }

        const whereClause = {
            role: 'SUPER_ADMIN'
        };

        if (search) {
            whereClause.OR = [
                {
                    name: {
                        contains: search,
                        mode: 'insensitive'
                    }
                },
                {
                    email: {
                        contains: search,
                        mode: 'insensitive'
                    }
                }
            ];
        }

        const skip = (parseInt(page) - 1) * parseInt(limit);
        const take = parseInt(limit);

        const totalCount = await prisma.user.count({
            where: whereClause
        });

        const superAdmins = await prisma.user.findMany({
            where: whereClause,
            select: {
                id: true,
                email: true,
                phone: true,
                name: true,
                avatarUrl: true,
                role: true,
                isActive: true,
                lastLoginAt: true,
                createdAt: true,
                updatedAt: true
            },
            orderBy: {
                createdAt: 'desc'
            },
            skip,
            take
        });

        res.status(200).json({
            msg: "Success to get SUPER_ADMIN users",
            data: superAdmins,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                totalCount,
                totalPages: Math.ceil(totalCount / parseInt(limit))
            }
        });

    } catch(e) {
        console.error('Get super admins error:', e);
        res.status(500).json({
            msg: "Server error"
        });
    }
};

/**
 * GET ADMIN ONLY
 * Mendapatkan semua user dengan role ADMIN
 */
const getAdmins = async(req, res) => {
    const {
        eventId,
        page = 1,
        limit = 20,
        search
    } = req.query;

    try {
        // SUPER_ADMIN bisa lihat semua ADMIN
        // ADMIN hanya bisa lihat dirinya sendiri (handle di middleware)
        if (req.user.role === 'STAFF') {
            return res.status(403).json({
                msg: "STAFF cannot view ADMIN users"
            });
        }

        const whereClause = {
            role: 'ADMIN'
        };

        if (eventId) {
            whereClause.eventId = parseInt(eventId);
        }

        if (search) {
            whereClause.OR = [
                {
                    name: {
                        contains: search,
                        mode: 'insensitive'
                    }
                },
                {
                    email: {
                        contains: search,
                        mode: 'insensitive'
                    }
                }
            ];
        }

        const skip = (parseInt(page) - 1) * parseInt(limit);
        const take = parseInt(limit);

        const totalCount = await prisma.user.count({
            where: whereClause
        });

        const admins = await prisma.user.findMany({
            where: whereClause,
            select: {
                id: true,
                email: true,
                phone: true,
                name: true,
                avatarUrl: true,
                role: true,
                eventId: true,
                isActive: true,
                lastLoginAt: true,
                createdAt: true,
                updatedAt: true,
                event: {
                    select: {
                        id: true,
                        weddingTitle: true,
                        groomName: true,
                        brideName: true,
                        shortCode: true
                    }
                },
                _count: {
                    select: {
                        checkIns: true,
                        eventPhotos: true
                    }
                }
            },
            orderBy: {
                createdAt: 'desc'
            },
            skip,
            take
        });

        res.status(200).json({
            msg: "Success to get ADMIN users",
            data: admins,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                totalCount,
                totalPages: Math.ceil(totalCount / parseInt(limit))
            }
        });

    } catch(e) {
        console.error('Get admins error:', e);
        res.status(500).json({
            msg: "Server error"
        });
    }
};

/**
 * GET STAFF ONLY
 * Mendapatkan semua user dengan role STAFF
 */
const getStaff = async(req, res) => {
    const {
        eventId,
        page = 1,
        limit = 20,
        search
    } = req.query;

    try {
        // SUPER_ADMIN bisa lihat semua STAFF
        // ADMIN bisa lihat STAFF di eventnya
        // STAFF hanya bisa lihat dirinya sendiri (handle di middleware)
        if (req.user.role === 'STAFF') {
            return res.status(403).json({
                msg: "STAFF cannot view other STAFF users"
            });
        }

        const whereClause = {
            role: 'STAFF'
        };

        // If ADMIN, only show staff from their event
        if (req.user.role === 'ADMIN' && req.user.eventId) {
            whereClause.eventId = req.user.eventId;
        } else if (eventId) {
            whereClause.eventId = parseInt(eventId);
        }

        if (search) {
            whereClause.OR = [
                {
                    name: {
                        contains: search,
                        mode: 'insensitive'
                    }
                },
                {
                    email: {
                        contains: search,
                        mode: 'insensitive'
                    }
                }
            ];
        }

        const skip = (parseInt(page) - 1) * parseInt(limit);
        const take = parseInt(limit);

        const totalCount = await prisma.user.count({
            where: whereClause
        });

        const staff = await prisma.user.findMany({
            where: whereClause,
            select: {
                id: true,
                email: true,
                phone: true,
                name: true,
                avatarUrl: true,
                role: true,
                eventId: true,
                isActive: true,
                lastLoginAt: true,
                createdAt: true,
                updatedAt: true,
                event: {
                    select: {
                        id: true,
                        weddingTitle: true,
                        groomName: true,
                        brideName: true,
                        shortCode: true
                    }
                },
                _count: {
                    select: {
                        checkIns: true,
                        eventPhotos: true
                    }
                }
            },
            orderBy: {
                createdAt: 'desc'
            },
            skip,
            take
        });

        res.status(200).json({
            msg: "Success to get STAFF users",
            data: staff,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                totalCount,
                totalPages: Math.ceil(totalCount / parseInt(limit))
            }
        });

    } catch(e) {
        console.error('Get staff error:', e);
        res.status(500).json({
            msg: "Server error"
        });
    }
};

/**
 * GET USER BY ID
 * Mendapatkan detail user berdasarkan ID
 */
const getUserById = async(req, res) => {
    const id = parseInt(req.params.id);

    try {
        // Authorization check
        // SUPER_ADMIN bisa lihat semua
        // ADMIN bisa lihat ADMIN lain? TIDAK, hanya dirinya sendiri dan STAFF di eventnya
        // STAFF hanya bisa lihat dirinya sendiri
        if (req.user.role === 'STAFF' && req.user.id !== id) {
            return res.status(403).json({
                msg: "STAFF can only view their own data"
            });
        }

        if (req.user.role === 'ADMIN') {
            const targetUser = await prisma.user.findUnique({
                where: { id }
            });
            
            if (targetUser && targetUser.role === 'SUPER_ADMIN') {
                return res.status(403).json({
                    msg: "ADMIN cannot view SUPER_ADMIN data"
                });
            }
            
            if (targetUser && targetUser.role === 'ADMIN' && targetUser.id !== req.user.id) {
                return res.status(403).json({
                    msg: "ADMIN can only view their own data or STAFF in their event"
                });
            }
            
            if (targetUser && targetUser.role === 'STAFF' && targetUser.eventId !== req.user.eventId) {
                return res.status(403).json({
                    msg: "ADMIN can only view STAFF from their own event"
                });
            }
        }

        const user = await prisma.user.findUnique({
            where: { id },
            select: {
                id: true,
                email: true,
                phone: true,
                name: true,
                avatarUrl: true,
                role: true,
                eventId: true,
                isActive: true,
                lastLoginAt: true,
                createdAt: true,
                updatedAt: true,
                event: {
                    select: {
                        id: true,
                        weddingTitle: true,
                        groomName: true,
                        brideName: true,
                        date: true,
                        venueName: true,
                        shortCode: true
                    }
                },
                checkIns: {
                    orderBy: {
                        checkedInAt: 'desc'
                    },
                    take: 10,
                    select: {
                        id: true,
                        arrivedCount: true,
                        method: true,
                        checkedInAt: true,
                        guest: {
                            select: {
                                id: true,
                                name: true
                            }
                        }
                    }
                },
                eventPhotos: {
                    orderBy: {
                        takenAt: 'desc'
                    },
                    take: 10,
                    select: {
                        id: true,
                        filename: true,
                        filePath: true,
                        thumbnailPath: true,
                        takenAt: true,
                        guest: {
                            select: {
                                id: true,
                                name: true
                            }
                        }
                    }
                },
                _count: {
                    select: {
                        checkIns: true,
                        eventPhotos: true
                    }
                }
            }
        });

        if (!user) {
            return res.status(404).json({
                msg: "User not found"
            });
        }

        res.status(200).json({
            msg: "Success to get user",
            data: user
        });

    } catch(e) {
        console.error('Get user by id error:', e);
        res.status(500).json({
            msg: "Server error"
        });
    }
};

/**
 * GET CURRENT USER (PROFILE)
 * Mendapatkan data user yang sedang login
 */
const getCurrentUser = async(req, res) => {
    try {
        const user = await prisma.user.findUnique({
            where: { id: req.user.id },
            select: {
                id: true,
                email: true,
                phone: true,
                name: true,
                avatarUrl: true,
                role: true,
                eventId: true,
                isActive: true,
                lastLoginAt: true,
                createdAt: true,
                updatedAt: true,
                event: {
                    select: {
                        id: true,
                        weddingTitle: true,
                        groomName: true,
                        brideName: true,
                        date: true,
                        venueName: true,
                        shortCode: true,
                        isActive: true,
                        isPublished: true
                    }
                },
                _count: {
                    select: {
                        checkIns: true,
                        eventPhotos: true
                    }
                }
            }
        });

        res.status(200).json({
            msg: "Success to get current user",
            data: user
        });

    } catch(e) {
        console.error('Get current user error:', e);
        res.status(500).json({
            msg: "Server error"
        });
    }
};

/**
 * UPDATE USER
 * Mengupdate data user
 */
const updateUser = async(req, res) => {
    const id = parseInt(req.params.id);
    const {
        email,
        phone,
        name,
        avatarUrl,
        role,
        eventId,
        isActive
    } = req.body;

    try {
        // Check if user exists
        const user = await prisma.user.findUnique({
            where: { id }
        });

        if (!user) {
            return res.status(404).json({
                msg: "User not found"
            });
        }

        // Authorization checks
        // SUPER_ADMIN bisa update semua
        // ADMIN bisa update dirinya sendiri dan STAFF di eventnya
        // STAFF hanya bisa update dirinya sendiri (field terbatas)
        if (req.user.role === 'STAFF' && req.user.id !== id) {
            return res.status(403).json({
                msg: "STAFF can only update their own data"
            });
        }

        if (req.user.role === 'ADMIN') {
            if (user.role === 'SUPER_ADMIN') {
                return res.status(403).json({
                    msg: "ADMIN cannot update SUPER_ADMIN"
                });
            }
            
            if (user.role === 'ADMIN' && user.id !== req.user.id) {
                return res.status(403).json({
                    msg: "ADMIN can only update their own data"
                });
            }
            
            if (user.role === 'STAFF' && user.eventId !== req.user.eventId) {
                return res.status(403).json({
                    msg: "ADMIN can only update STAFF from their own event"
                });
            }
        }

        // Check email uniqueness if changing
        if (email && email !== user.email) {
            const existingUser = await prisma.user.findUnique({
                where: { email }
            });
            if (existingUser) {
                return res.status(400).json({
                    msg: "Email already in use"
                });
            }
        }

        // Format phone if provided
        const formattedPhone = phone ? formatPhone(phone) : user.phone;

        // Prepare update data
        const updateData = {};

        // STAFF can only update limited fields
        if (req.user.role === 'STAFF') {
            updateData.name = name || user.name;
            updateData.phone = formattedPhone;
            updateData.avatarUrl = avatarUrl !== undefined ? avatarUrl : user.avatarUrl;
        } else {
            // ADMIN and SUPER_ADMIN can update all fields
            if (email) updateData.email = email;
            if (phone !== undefined) updateData.phone = formattedPhone;
            if (name) updateData.name = name;
            if (avatarUrl !== undefined) updateData.avatarUrl = avatarUrl;
            if (role) updateData.role = role;
            if (eventId !== undefined) updateData.eventId = eventId ? parseInt(eventId) : null;
            if (isActive !== undefined) updateData.isActive = isActive;
        }

        updateData.updatedAt = new Date();

        // Update user
        const updatedUser = await prisma.user.update({
            where: { id },
            data: updateData,
            select: {
                id: true,
                email: true,
                phone: true,
                name: true,
                avatarUrl: true,
                role: true,
                eventId: true,
                isActive: true,
                lastLoginAt: true,
                createdAt: true,
                updatedAt: true,
                event: {
                    select: {
                        id: true,
                        weddingTitle: true,
                        shortCode: true
                    }
                }
            }
        });

        res.status(200).json({
            msg: "Success to update user",
            data: updatedUser
        });

    } catch(e) {
        console.error('Update user error:', e);
        res.status(500).json({
            msg: "Server error"
        });
    }
};

/**
 * UPDATE USER PASSWORD
 * Mengubah password user
 */
const updatePassword = async(req, res) => {
    const id = parseInt(req.params.id);
    const { currentPassword, newPassword } = req.body;

    try {
        // Only user themselves or SUPER_ADMIN can change password
        if (req.user.role !== 'SUPER_ADMIN' && req.user.id !== id) {
            return res.status(403).json({
                msg: "You can only change your own password"
            });
        }

        const user = await prisma.user.findUnique({
            where: { id }
        });

        if (!user) {
            return res.status(404).json({
                msg: "User not found"
            });
        }

        // If not SUPER_ADMIN changing others' password, verify current password
        if (req.user.id === id) {
            const isValidPassword = await bcrypt.compare(currentPassword, user.password);
            if (!isValidPassword) {
                return res.status(400).json({
                    msg: "Current password is incorrect"
                });
            }
        }

        // Hash new password
        const hashedPassword = await hashPassword(newPassword);

        // Update password
        await prisma.user.update({
            where: { id },
            data: {
                password: hashedPassword,
                updatedAt: new Date()
            }
        });

        res.status(200).json({
            msg: "Success to update password"
        });

    } catch(e) {
        console.error('Update password error:', e);
        res.status(500).json({
            msg: "Server error"
        });
    }
};

/**
 * DELETE USER
 * Menghapus user (hard delete karena tidak ada soft delete di schema)
 */
const deleteUser = async(req, res) => {
    const id = parseInt(req.params.id);

    try {
        // Check if user exists
        const user = await prisma.user.findUnique({
            where: { id },
            include: {
                checkIns: true,
                eventPhotos: true
            }
        });

        if (!user) {
            return res.status(404).json({
                msg: "User not found"
            });
        }

        // Authorization checks
        // SUPER_ADMIN bisa delete semua
        // ADMIN hanya bisa delete STAFF di eventnya
        // STAFF tidak bisa delete siapapun
        if (req.user.role === 'STAFF') {
            return res.status(403).json({
                msg: "STAFF cannot delete users"
            });
        }

        if (req.user.role === 'ADMIN') {
            if (user.role === 'SUPER_ADMIN') {
                return res.status(403).json({
                    msg: "ADMIN cannot delete SUPER_ADMIN"
                });
            }
            
            if (user.role === 'ADMIN') {
                return res.status(403).json({
                    msg: "ADMIN cannot delete other ADMIN"
                });
            }
            
            if (user.role === 'STAFF' && user.eventId !== req.user.eventId) {
                return res.status(403).json({
                    msg: "ADMIN can only delete STAFF from their own event"
                });
            }
        }

        // SUPER_ADMIN cannot delete themselves
        if (req.user.role === 'SUPER_ADMIN' && req.user.id === id) {
            return res.status(400).json({
                msg: "SUPER_ADMIN cannot delete themselves"
            });
        }

        // Check if user has any related data
        if (user.checkIns.length > 0 || user.eventPhotos.length > 0) {
            return res.status(400).json({
                msg: "Cannot delete user with existing check-ins or photos. Consider deactivating instead.",
                data: {
                    checkIns: user.checkIns.length,
                    photos: user.eventPhotos.length
                }
            });
        }

        // Delete user
        await prisma.user.delete({
            where: { id }
        });

        res.status(200).json({
            msg: "User successfully deleted"
        });

    } catch(e) {
        console.error('Delete user error:', e);
        res.status(500).json({
            msg: "Server error"
        });
    }
};

/**
 * DEACTIVATE USER (Soft delete alternative)
 * Set isActive = false instead of deleting
 */
const deactivateUser = async(req, res) => {
    const id = parseInt(req.params.id);

    try {
        const user = await prisma.user.findUnique({
            where: { id }
        });

        if (!user) {
            return res.status(404).json({
                msg: "User not found"
            });
        }

        // Authorization checks
        if (req.user.role === 'STAFF') {
            return res.status(403).json({
                msg: "STAFF cannot deactivate users"
            });
        }

        if (req.user.role === 'ADMIN') {
            if (user.role === 'SUPER_ADMIN') {
                return res.status(403).json({
                    msg: "ADMIN cannot deactivate SUPER_ADMIN"
                });
            }
            
            if (user.role === 'ADMIN' && user.id !== req.user.id) {
                return res.status(403).json({
                    msg: "ADMIN can only deactivate themselves or STAFF"
                });
            }
            
            if (user.role === 'STAFF' && user.eventId !== req.user.eventId) {
                return res.status(403).json({
                    msg: "ADMIN can only deactivate STAFF from their own event"
                });
            }
        }

        // SUPER_ADMIN cannot deactivate themselves
        if (req.user.role === 'SUPER_ADMIN' && req.user.id === id) {
            return res.status(400).json({
                msg: "SUPER_ADMIN cannot deactivate themselves"
            });
        }

        const deactivatedUser = await prisma.user.update({
            where: { id },
            data: {
                isActive: false,
                updatedAt: new Date()
            },
            select: {
                id: true,
                email: true,
                name: true,
                role: true,
                isActive: true
            }
        });

        res.status(200).json({
            msg: "User successfully deactivated",
            data: deactivatedUser
        });

    } catch(e) {
        console.error('Deactivate user error:', e);
        res.status(500).json({
            msg: "Server error"
        });
    }
};

/**
 * ACTIVATE USER
 * Set isActive = true
 */
const activateUser = async(req, res) => {
    const id = parseInt(req.params.id);

    try {
        const user = await prisma.user.findUnique({
            where: { id }
        });

        if (!user) {
            return res.status(404).json({
                msg: "User not found"
            });
        }

        // Only SUPER_ADMIN and ADMIN can activate users
        if (req.user.role === 'STAFF') {
            return res.status(403).json({
                msg: "STAFF cannot activate users"
            });
        }

        if (req.user.role === 'ADMIN' && user.role === 'SUPER_ADMIN') {
            return res.status(403).json({
                msg: "ADMIN cannot activate SUPER_ADMIN"
            });
        }

        const activatedUser = await prisma.user.update({
            where: { id },
            data: {
                isActive: true,
                updatedAt: new Date()
            },
            select: {
                id: true,
                email: true,
                name: true,
                role: true,
                isActive: true
            }
        });

        res.status(200).json({
            msg: "User successfully activated",
            data: activatedUser
        });

    } catch(e) {
        console.error('Activate user error:', e);
        res.status(500).json({
            msg: "Server error"
        });
    }
};

/**
 * ASSIGN USER TO EVENT
 * Assign staff/admin ke event tertentu
 */
const assignToEvent = async(req, res) => {
    const id = parseInt(req.params.id);
    const { eventId } = req.body;

    try {
        const user = await prisma.user.findUnique({
            where: { id }
        });

        if (!user) {
            return res.status(404).json({
                msg: "User not found"
            });
        }

        // Authorization checks
        if (req.user.role === 'STAFF') {
            return res.status(403).json({
                msg: "STAFF cannot assign users to events"
            });
        }

        if (req.user.role === 'ADMIN') {
            if (user.role === 'SUPER_ADMIN') {
                return res.status(403).json({
                    msg: "ADMIN cannot assign SUPER_ADMIN"
                });
            }
            
            if (user.role === 'ADMIN' && user.id !== req.user.id) {
                return res.status(403).json({
                    msg: "ADMIN can only assign themselves or STAFF"
                });
            }
        }

        // Check if event exists
        if (eventId) {
            const event = await prisma.event.findUnique({
                where: { id: parseInt(eventId) }
            });
            
            if (!event) {
                return res.status(404).json({
                    msg: "Event not found"
                });
            }
        }

        const updatedUser = await prisma.user.update({
            where: { id },
            data: {
                eventId: eventId ? parseInt(eventId) : null,
                updatedAt: new Date()
            },
            select: {
                id: true,
                name: true,
                role: true,
                event: {
                    select: {
                        id: true,
                        weddingTitle: true,
                        shortCode: true
                    }
                }
            }
        });

        res.status(200).json({
            msg: eventId ? "User assigned to event successfully" : "User removed from event successfully",
            data: updatedUser
        });

    } catch(e) {
        console.error('Assign to event error:', e);
        res.status(500).json({
            msg: "Server error"
        });
    }
};

/**
 * GET USERS BY EVENT
 * Mendapatkan semua user dalam suatu event
 */
const getUsersByEvent = async(req, res) => {
    const eventId = parseInt(req.params.eventId);
    const { role, page = 1, limit = 20 } = req.query;

    try {
        // Check if event exists
        const event = await prisma.event.findUnique({
            where: { id: eventId }
        });

        if (!event) {
            return res.status(404).json({
                msg: "Event not found"
            });
        }

        // Authorization
        if (req.user.role === 'STAFF' && req.user.eventId !== eventId) {
            return res.status(403).json({
                msg: "STAFF can only view users from their assigned event"
            });
        }

        const whereClause = {
            eventId
        };

        if (role) {
            whereClause.role = role;
        }

        const skip = (parseInt(page) - 1) * parseInt(limit);
        const take = parseInt(limit);

        const totalCount = await prisma.user.count({
            where: whereClause
        });

        const users = await prisma.user.findMany({
            where: whereClause,
            select: {
                id: true,
                email: true,
                phone: true,
                name: true,
                avatarUrl: true,
                role: true,
                isActive: true,
                lastLoginAt: true,
                createdAt: true,
                _count: {
                    select: {
                        checkIns: true,
                        eventPhotos: true
                    }
                }
            },
            orderBy: {
                createdAt: 'desc'
            },
            skip,
            take
        });

        res.status(200).json({
            msg: "Success to get users by event",
            data: users,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                totalCount,
                totalPages: Math.ceil(totalCount / parseInt(limit))
            }
        });

    } catch(e) {
        console.error('Get users by event error:', e);
        res.status(500).json({
            msg: "Server error"
        });
    }
};

/**
 * GET USER STATISTICS
 * Statistik untuk dashboard admin
 */
const getUserStatistics = async(req, res) => {
    try {
        // Only SUPER_ADMIN can view system-wide stats
        if (req.user.role !== 'SUPER_ADMIN') {
            return res.status(403).json({
                msg: "Only SUPER_ADMIN can view system statistics"
            });
        }

        const stats = await prisma.$transaction([
            // Total users by role
            prisma.user.groupBy({
                by: ['role'],
                _count: true
            }),
            // Active users
            prisma.user.count({
                where: { isActive: true }
            }),
            // Inactive users
            prisma.user.count({
                where: { isActive: false }
            }),
            // Users with events assigned
            prisma.user.count({
                where: { 
                    eventId: { not: null }
                }
            }),
            // Users without events
            prisma.user.count({
                where: { 
                    eventId: null
                }
            }),
            // New users today
            prisma.user.count({
                where: {
                    createdAt: {
                        gte: new Date(new Date().setHours(0,0,0,0))
                    }
                }
            })
        ]);

        // Format response
        const roleCounts = {};
        stats[0].forEach(item => {
            roleCounts[item.role] = item._count;
        });

        res.status(200).json({
            msg: "Success to get user statistics",
            data: {
                totalUsers: stats[0].reduce((acc, curr) => acc + curr._count, 0),
                byRole: roleCounts,
                activeUsers: stats[1],
                inactiveUsers: stats[2],
                assignedToEvent: stats[3],
                unassigned: stats[4],
                newToday: stats[5]
            }
        });

    } catch(e) {
        console.error('Get user statistics error:', e);
        res.status(500).json({
            msg: "Server error"
        });
    }
};

module.exports = {
    // CRUD
    createUser,
    getAllUsers,
    getUserById,
    getCurrentUser,
    updateUser,
    updatePassword,
    deleteUser,
    
    // Role-based filters
    getSuperAdmins,
    getAdmins,
    getStaff,
    
    // Event assignment
    assignToEvent,
    getUsersByEvent,
    
    // Status management
    deactivateUser,
    activateUser,
    
    // Statistics
    getUserStatistics
};