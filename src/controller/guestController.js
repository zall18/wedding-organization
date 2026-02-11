const { PrismaClient } = require('@prisma/client');
const { generateSlug, generateRandomCode } = require('./utils/helpers');
const prisma = new PrismaClient();

// =======================
// HELPER FUNCTIONS
// =======================

/**
 * Generate unique short ID untuk guest
 */
const generateUniqueShortId = async (eventId) => {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let shortId;
    let isUnique = false;
    
    while (!isUnique) {
        shortId = '';
        for (let i = 0; i < 6; i++) {
            shortId += characters.charAt(Math.floor(Math.random() * characters.length));
        }
        
        const existing = await prisma.guest.findFirst({
            where: { 
                eventId,
                shortId 
            }
        });
        
        if (!existing) {
            isUnique = true;
        }
    }
    
    return shortId;
};

/**
 * Format phone number untuk WhatsApp
 */
const formatPhoneForWA = (phone) => {
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
    
    return formatted;
};

// =======================
// GUEST MANAGEMENT
// =======================

/**
 * CREATE GUEST
 * Menambahkan tamu baru ke event
 */
const createGuest = async(req, res) => {
    const { 
        name, 
        phone, 
        email,
        invitedPax = 1,
        maxPlusOnes = 0,
        eventId,
        category = "REGULAR",
        groupName,
        tableId,
        seatNumber,
        specialRequest,
        notes
    } = req.body;

    try {
        // Validate event exists
        const event = await prisma.event.findFirst({
            where: { id: parseInt(eventId) }
        });

        if (!event) {
            return res.status(404).json({
                msg: "Event not found"
            });
        }

        // Validate event capacity
        if (event.maxGuests) {
            const currentGuests = await prisma.guest.count({
                where: { eventId: parseInt(eventId), isDeleted: false }
            });
            
            if (currentGuests >= event.maxGuests) {
                return res.status(400).json({
                    msg: "Event has reached maximum guest capacity"
                });
            }
        }

        // Format phone number
        const formattedPhone = formatPhoneForWA(phone);

        // Check duplicate phone in same event
        if (formattedPhone) {
            const existingGuest = await prisma.guest.findFirst({
                where: {
                    eventId: parseInt(eventId),
                    phone: formattedPhone,
                    isDeleted: false
                }
            });

            if (existingGuest) {
                return res.status(400).json({
                    msg: "Guest with this phone number already exists in this event"
                });
            }
        }

        // Generate unique identifiers
        const qrCode = `WED-${event.shortCode}-${Date.now()}-${Math.random().toString(36).substring(7)}`;
        const shortId = await generateUniqueShortId(parseInt(eventId));

        // Create guest
        const guest = await prisma.guest.create({
            data: {
                name,
                phone: formattedPhone,
                email,
                invitedCount: invitedPax,
                maxPlusOnes,
                category: category.toUpperCase(),
                groupName,
                eventId: parseInt(eventId),
                qrCode,
                shortId,
                specialRequest,
                notes,
                status: 'INVITED',
                createdAt: new Date(),
                updatedAt: new Date()
            },
            include: {
                event: {
                    select: {
                        id: true,
                        weddingTitle: true,
                        groomName: true,
                        brideName: true,
                        shortCode: true
                    }
                },
                group: true,
                table: true
            }
        });

        // Update event total guests count
        await prisma.event.update({
            where: { id: parseInt(eventId) },
            data: {
                totalGuests: {
                    increment: 1
                }
            }
        });

        // Create notification for new guest
        await prisma.notification.create({
            data: {
                type: 'GUEST_ADDED',
                title: 'Tamu Baru Ditambahkan',
                message: `${name} telah ditambahkan ke daftar tamu`,
                channel: 'IN_APP',
                status: 'PENDING',
                eventId: parseInt(eventId),
                data: {
                    guestId: guest.id,
                    guestName: name,
                    invitedPax
                }
            }
        });

        res.status(201).json({
            msg: "Success to add guest",
            data: guest,
            qrCodeUrl: `${process.env.BASE_URL}/api/guest/qr/${guest.id}`,
            shortUrl: `${process.env.BASE_URL}/invite/${event.shortCode}/${shortId}`
        });

    } catch(e) {
        console.error('Create guest error:', e);
        res.status(500).json({
            msg: "Server error",
            error: process.env.NODE_ENV === 'development' ? e.message : undefined
        });
    }
};

/**
 * BULK CREATE GUESTS
 * Import tamu dalam jumlah besar
 */
const bulkCreateGuests = async(req, res) => {
    const { eventId, guests } = req.body;

    try {
        const event = await prisma.event.findFirst({
            where: { id: parseInt(eventId) }
        });

        if (!event) {
            return res.status(404).json({
                msg: "Event not found"
            });
        }

        const results = {
            success: [],
            failed: []
        };

        for (const guestData of guests) {
            try {
                const formattedPhone = formatPhoneForWA(guestData.phone);
                const shortId = await generateUniqueShortId(parseInt(eventId));
                const qrCode = `WED-${event.shortCode}-${Date.now()}-${Math.random().toString(36).substring(7)}`;

                const guest = await prisma.guest.create({
                    data: {
                        name: guestData.name,
                        phone: formattedPhone,
                        email: guestData.email,
                        invitedCount: guestData.invitedPax || 1,
                        category: guestData.category?.toUpperCase() || 'REGULAR',
                        groupName: guestData.groupName,
                        eventId: parseInt(eventId),
                        qrCode,
                        shortId,
                        status: 'INVITED'
                    }
                });

                results.success.push(guest);
            } catch (error) {
                results.failed.push({
                    data: guestData,
                    error: error.message
                });
            }
        }

        // Update event total guests
        await prisma.event.update({
            where: { id: parseInt(eventId) },
            data: {
                totalGuests: {
                    increment: results.success.length
                }
            }
        });

        res.status(201).json({
            msg: `Successfully imported ${results.success.length} guests, ${results.failed.length} failed`,
            results
        });

    } catch(e) {
        console.error('Bulk create guests error:', e);
        res.status(500).json({
            msg: "Server error"
        });
    }
};

/**
 * SEARCH GUESTS
 * Pencarian tamu dengan berbagai filter
 */
const searchGuests = async(req, res) => {
    const { 
        q, 
        eventId, 
        category, 
        status, 
        groupName,
        page = 1,
        limit = 20,
        sortBy = 'name',
        sortOrder = 'asc'
    } = req.query;

    try {
        // Build where clause
        const whereClause = {
            eventId: parseInt(eventId),
            isDeleted: false
        };

        // Text search
        if (q) {
            const isNumber = /^\d+$/.test(q);
            const formattedPhone = isNumber ? formatPhoneForWA(q) : null;
            
            whereClause.OR = [
                {
                    name: {
                        contains: q,
                        mode: 'insensitive'
                    }
                },
                ...(formattedPhone ? [{
                    phone: {
                        contains: formattedPhone
                    }
                }] : []),
                ...(isNumber ? [{
                    shortId: {
                        contains: q,
                        mode: 'insensitive'
                    }
                }] : []),
                {
                    email: {
                        contains: q,
                        mode: 'insensitive'
                    }
                }
            ];
        }

        // Filters
        if (category) {
            whereClause.category = category.toUpperCase();
        }

        if (status) {
            whereClause.status = status;
        }

        if (groupName) {
            whereClause.groupName = {
                contains: groupName,
                mode: 'insensitive'
            };
        }

        // Pagination
        const skip = (parseInt(page) - 1) * parseInt(limit);
        const take = parseInt(limit);

        // Get total count
        const totalCount = await prisma.guest.count({
            where: whereClause
        });

        // Get guests
        const guests = await prisma.guest.findMany({
            where: whereClause,
            include: {
                event: {
                    select: {
                        id: true,
                        weddingTitle: true,
                        shortCode: true
                    }
                },
                rsvp: true,
                table: {
                    select: {
                        id: true,
                        tableNumber: true,
                        tableName: true
                    }
                },
                group: {
                    select: {
                        id: true,
                        name: true,
                        color: true
                    }
                },
                _count: {
                    select: {
                        checkIns: true,
                        photos: true,
                        wishMessages: true
                    }
                }
            },
            orderBy: {
                [sortBy]: sortOrder
            },
            skip,
            take
        });

        // Get check-in status for each guest
        const guestsWithStatus = guests.map(guest => ({
            ...guest,
            isCheckedIn: guest.status === 'ATTENDED',
            checkInTime: guest.checkedInAt,
            totalArrived: guest.arrivedPax || 0
        }));

        res.status(200).json({
            msg: "Success to search guests",
            data: guestsWithStatus,
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
        console.error('Search guests error:', e);
        res.status(500).json({
            msg: "Server error",
            error: process.env.NODE_ENV === 'development' ? e.message : undefined
        });
    }
};

/**
 * GET GUEST BY ID
 */
const getGuestById = async(req, res) => {
    const id = parseInt(req.params.id);

    try {
        const guest = await prisma.guest.findFirst({
            where: {
                id,
                isDeleted: false
            },
            include: {
                event: {
                    select: {
                        id: true,
                        weddingTitle: true,
                        groomName: true,
                        brideName: true,
                        date: true,
                        venueName: true,
                        shortCode: true,
                        primaryColor: true
                    }
                },
                rsvp: true,
                table: true,
                group: true,
                checkIns: {
                    orderBy: {
                        checkedInAt: 'desc'
                    },
                    include: {
                        staff: {
                            select: {
                                id: true,
                                name: true
                            }
                        },
                        photo: true
                    }
                },
                photos: {
                    where: {
                        isCheckInPhoto: true
                    },
                    orderBy: {
                        takenAt: 'desc'
                    }
                },
                wishMessages: {
                    orderBy: {
                        createdAt: 'desc'
                    },
                    take: 5
                },
                payments: true
            }
        });

        if (!guest) {
            return res.status(404).json({
                msg: "Guest not found"
            });
        }

        res.status(200).json({
            msg: "Success to get guest",
            data: guest,
            qrCodeUrl: `${process.env.BASE_URL}/api/guest/qr/${guest.id}`,
            invitationUrl: `${process.env.BASE_URL}/invite/${guest.event.shortCode}/${guest.shortId}`
        });

    } catch(e) {
        console.error('Get guest error:', e);
        res.status(500).json({
            msg: "Server error"
        });
    }
};

/**
 * UPDATE GUEST
 */
const updateGuest = async(req, res) => {
    const id = parseInt(req.params.id);
    const {
        name,
        phone,
        email,
        invitedCount,
        maxPlusOnes,
        category,
        groupName,
        tableId,
        seatNumber,
        status,
        specialRequest,
        notes
    } = req.body;

    try {
        const guest = await prisma.guest.findFirst({
            where: {
                id,
                isDeleted: false
            }
        });

        if (!guest) {
            return res.status(404).json({
                msg: "Guest not found"
            });
        }

        // Format phone if updated
        let formattedPhone = guest.phone;
        if (phone && phone !== guest.phone) {
            formattedPhone = formatPhoneForWA(phone);
            
            // Check duplicate phone
            const existingGuest = await prisma.guest.findFirst({
                where: {
                    eventId: guest.eventId,
                    phone: formattedPhone,
                    id: { not: id },
                    isDeleted: false
                }
            });

            if (existingGuest) {
                return res.status(400).json({
                    msg: "Guest with this phone number already exists"
                });
            }
        }

        const updatedGuest = await prisma.guest.update({
            where: { id },
            data: {
                name: name || guest.name,
                phone: formattedPhone,
                email: email !== undefined ? email : guest.email,
                invitedCount: invitedCount || guest.invitedCount,
                maxPlusOnes: maxPlusOnes !== undefined ? maxPlusOnes : guest.maxPlusOnes,
                category: category?.toUpperCase() || guest.category,
                groupName: groupName !== undefined ? groupName : guest.groupName,
                tableId: tableId ? parseInt(tableId) : guest.tableId,
                seatNumber: seatNumber || guest.seatNumber,
                status: status || guest.status,
                specialRequest: specialRequest !== undefined ? specialRequest : guest.specialRequest,
                notes: notes !== undefined ? notes : guest.notes,
                updatedAt: new Date()
            },
            include: {
                event: true,
                table: true,
                group: true
            }
        });

        res.status(200).json({
            msg: "Success to update guest",
            data: updatedGuest
        });

    } catch(e) {
        console.error('Update guest error:', e);
        res.status(500).json({
            msg: "Server error"
        });
    }
};

/**
 * DELETE GUEST (Soft Delete)
 */
const deleteGuest = async(req, res) => {
    const id = parseInt(req.params.id);

    try {
        const guest = await prisma.guest.findFirst({
            where: { id }
        });

        if (!guest) {
            return res.status(404).json({
                msg: "Guest not found"
            });
        }

        // Soft delete
        await prisma.guest.update({
            where: { id },
            data: {
                isDeleted: true,
                deletedAt: new Date()
            }
        });

        // Update event total guests
        await prisma.event.update({
            where: { id: guest.eventId },
            data: {
                totalGuests: {
                    decrement: 1
                }
            }
        });

        res.status(200).json({
            msg: "Guest successfully deleted"
        });

    } catch(e) {
        console.error('Delete guest error:', e);
        res.status(500).json({
            msg: "Server error"
        });
    }
};

// =======================
// CHECK-IN MANAGEMENT
// =======================

/**
 * CHECK-IN HANDLER
 * Proses check-in tamu dengan foto otomatis
 */
const checkinHandler = async(req, res) => {
    const { 
        qrCode, 
        guestId, 
        arrivedPax = 1, 
        method,
        photoBase64,
        deviceInfo
    } = req.body;
    
    const eventId = parseInt(req.params.eventId);
    const staffId = req.user?.id; // From auth middleware

    // Validations
    if (!method) {
        return res.status(400).json({
            msg: "Method is required"
        });
    }

    const validMethods = ['QR_SCAN', 'MANUAL_SEARCH', 'MANUAL_ENTRY'];
    if (!validMethods.includes(method)) {
        return res.status(400).json({
            msg: "Invalid check-in method"
        });
    }

    if (method === "QR_SCAN" && !qrCode) {
        return res.status(400).json({
            msg: "QR code is required"
        });
    }

    if (method !== "QR_SCAN" && !guestId) {
        return res.status(400).json({
            msg: "Guest ID is required"
        });
    }

    try {
        // Check event exists and active
        const event = await prisma.event.findFirst({
            where: {
                id: eventId,
                isActive: true
            }
        });

        if (!event) {
            return res.status(404).json({
                msg: "Event not found or not active"
            });
        }

        // Check event time
        const now = new Date();
        if (event.checkInStartTime && now < event.checkInStartTime) {
            return res.status(400).json({
                msg: "Check-in not started yet"
            });
        }
        if (event.checkInEndTime && now > event.checkInEndTime) {
            return res.status(400).json({
                msg: "Check-in time has ended"
            });
        }

        // Find guest
        let guest;
        if (method === "QR_SCAN") {
            guest = await prisma.guest.findFirst({
                where: {
                    eventId,
                    qrCode,
                    isDeleted: false
                }
            });
        } else {
            guest = await prisma.guest.findFirst({
                where: {
                    eventId,
                    id: parseInt(guestId),
                    isDeleted: false
                }
            });
        }

        if (!guest) {
            return res.status(404).json({
                msg: "Guest not found"
            });
        }

        // Check if already checked in
        if (guest.status === "ATTENDED") {
            // Allow re-check-in with additional pax?
            return res.status(400).json({
                msg: "This guest has already checked in",
                data: {
                    guestId: guest.id,
                    name: guest.name,
                    checkedInAt: guest.checkedInAt,
                    arrivedPax: guest.arrivedPax
                }
            });
        }

        // Validate arrived pax
        if (!arrivedPax || arrivedPax < 1) {
            return res.status(400).json({
                msg: "Arrived pax must be at least 1"
            });
        }

        if (arrivedPax > guest.invitedCount + guest.maxPlusOnes) {
            return res.status(400).json({
                msg: `Arrived pax exceeds maximum (${guest.invitedCount + guest.maxPlusOnes})`
            });
        }

        // Start transaction
        const result = await prisma.$transaction(async (tx) => {
            // 1. Upload photo if exists
            let photo = null;
            if (photoBase64 && event.allowPhotoOnCheckIn) {
                // Save photo logic here
                const filename = `checkin-${event.shortCode}-${guest.shortId}-${Date.now()}.jpg`;
                const filePath = `/uploads/events/${event.shortCode}/checkins/${filename}`;
                
                // Convert base64 to file and save
                // ... implementation depends on your file storage system

                photo = await tx.eventPhoto.create({
                    data: {
                        filename,
                        filePath,
                        mimeType: 'image/jpeg',
                        eventId: event.id,
                        guestId: guest.id,
                        takenById: staffId,
                        isCheckInPhoto: true,
                        waStatus: event.autoSendPhotoToWA ? 'PENDING' : 'UPLOADED',
                        takenAt: new Date()
                    }
                });
            }

            // 2. Update guest status
            const updatedGuest = await tx.guest.update({
                where: { id: guest.id },
                data: {
                    status: "ATTENDED",
                    arrivedPax,
                    checkedInAt: new Date(),
                    checkedInBy: staffId ? req.user?.name : null,
                    checkInPhotoId: photo?.id,
                    updatedAt: new Date()
                }
            });

            // 3. Create check-in log
            const checkIn = await tx.checkInLog.create({
                data: {
                    arrivedCount: arrivedPax,
                    method,
                    guestId: guest.id,
                    eventId: event.id,
                    checkedInById: staffId,
                    photoId: photo?.id,
                    deviceType: deviceInfo?.type,
                    deviceBrowser: deviceInfo?.browser,
                    checkedInAt: new Date()
                }
            });

            // 4. Update event attended count
            await tx.event.update({
                where: { id: event.id },
                data: {
                    attendedCount: {
                        increment: 1
                    }
                }
            });

            // 5. Create WhatsApp log if auto-send enabled
            if (photo && event.autoSendPhotoToWA && guest.phone) {
                await tx.whatsAppLog.create({
                    data: {
                        messageId: `WA-${Date.now()}`,
                        toPhone: guest.phone,
                        toName: guest.name,
                        messageType: 'PHOTO',
                        caption: `Halo ${guest.name}, terima kasih telah hadir di pernikahan ${event.groomName} & ${event.brideName}! Berikut foto Anda saat check-in.`,
                        photoId: photo.id,
                        guestId: guest.id,
                        eventId: event.id,
                        status: 'PENDING',
                        sentAt: new Date()
                    }
                });
            }

            // 6. Create notification for staff
            if (staffId) {
                await tx.notification.create({
                    data: {
                        type: 'CHECK_IN',
                        title: 'Check-in Berhasil',
                        message: `${guest.name} telah check-in dengan ${arrivedPax} orang`,
                        channel: 'IN_APP',
                        status: 'PENDING',
                        recipientId: staffId,
                        eventId: event.id,
                        data: {
                            guestId: guest.id,
                            guestName: guest.name,
                            arrivedPax,
                            method,
                            photoId: photo?.id
                        }
                    }
                });
            }

            return { 
                guest: updatedGuest, 
                checkIn, 
                photo,
                event 
            };
        });

        // Create event stats snapshot
        await prisma.eventStats.create({
            data: {
                eventId: event.id,
                totalGuests: await prisma.guest.count({ where: { eventId: event.id, isDeleted: false } }),
                guestsArrived: await prisma.guest.count({ where: { eventId: event.id, status: 'ATTENDED' } }),
                guestsPending: await prisma.guest.count({ where: { eventId: event.id, status: { not: 'ATTENDED' }, isDeleted: false } }),
                checkInsLastHour: await prisma.checkInLog.count({
                    where: {
                        eventId: event.id,
                        checkedInAt: {
                            gte: new Date(Date.now() - 60 * 60 * 1000)
                        }
                    }
                }),
                photosTaken: await prisma.eventPhoto.count({ where: { eventId: event.id } }),
                snapshotTime: new Date()
            }
        });

        return res.status(200).json({
            msg: "Success to check-in",
            data: {
                guest: {
                    id: result.guest.id,
                    name: result.guest.name,
                    status: result.guest.status,
                    arrivedPax: result.guest.arrivedPax,
                    checkedInAt: result.guest.checkedInAt
                },
                photo: result.photo ? {
                    id: result.photo.id,
                    url: result.photo.filePath,
                    thumbnail: result.photo.thumbnailPath
                } : null,
                qrCode: guest.qrCode,
                invitationUrl: `${process.env.BASE_URL}/invite/${event.shortCode}/${guest.shortId}`
            }
        });

    } catch(e) {
        console.error('Check-in error:', e);
        return res.status(500).json({
            msg: "Server error",
            error: process.env.NODE_ENV === 'development' ? e.message : undefined
        });
    }
};

/**
 * UNDO CHECK-IN
 */
const undoCheckin = async(req, res) => {
    const id = parseInt(req.params.id);
    const staffId = req.user?.id;

    try {
        const guest = await prisma.guest.findFirst({
            where: {
                id,
                isDeleted: false
            },
            include: {
                event: true,
                checkIns: {
                    orderBy: {
                        checkedInAt: 'desc'
                    },
                    take: 1
                }
            }
        });

        if (!guest) {
            return res.status(404).json({
                msg: "Guest not found"
            });
        }

        if (guest.status !== "ATTENDED") {
            return res.status(400).json({
                msg: "Guest is not checked in"
            });
        }

        const lastCheckIn = guest.checkIns[0];
        if (!lastCheckIn) {
            return res.status(400).json({
                msg: "No check-in log found"
            });
        }

        const result = await prisma.$transaction(async (tx) => {
            // Update guest status
            const updatedGuest = await tx.guest.update({
                where: { id: guest.id },
                data: {
                    status: "INVITED",
                    arrivedPax: null,
                    checkedInAt: null,
                    checkedInBy: null,
                    updatedAt: new Date()
                }
            });

            // Delete check-in log
            await tx.checkInLog.delete({
                where: { id: lastCheckIn.id }
            });

            // Update event attended count
            await tx.event.update({
                where: { id: guest.eventId },
                data: {
                    attendedCount: {
                        decrement: 1
                    }
                }
            });

            // Create notification for undo
            if (staffId) {
                await tx.notification.create({
                    data: {
                        type: 'CHECK_IN_UNDO',
                        title: 'Check-in Dibatalkan',
                        message: `${guest.name} check-in telah dibatalkan`,
                        channel: 'IN_APP',
                        status: 'PENDING',
                        recipientId: staffId,
                        eventId: guest.eventId,
                        data: {
                            guestId: guest.id,
                            guestName: guest.name
                        }
                    }
                });
            }

            return updatedGuest;
        });

        res.status(200).json({
            msg: "Success to undo check-in",
            data: result
        });

    } catch(e) {
        console.error('Undo check-in error:', e);
        res.status(500).json({
            msg: "Server error"
        });
    }
};

/**
 * CHECK-IN HISTORY
 */
const checkinHistory = async(req, res) => {
    const eventId = parseInt(req.params.eventId);
    const { 
        startDate, 
        endDate, 
        method,
        staffId,
        page = 1,
        limit = 20 
    } = req.query;

    try {
        const event = await prisma.event.findFirst({
            where: { id: eventId }
        });

        if (!event) {
            return res.status(404).json({
                msg: "Event not found"
            });
        }

        // Build where clause
        const whereClause = {
            eventId: event.id
        };

        if (method) {
            whereClause.method = method;
        }

        if (staffId) {
            whereClause.checkedInById = parseInt(staffId);
        }

        if (startDate || endDate) {
            whereClause.checkedInAt = {};
            if (startDate) {
                whereClause.checkedInAt.gte = new Date(startDate);
            }
            if (endDate) {
                whereClause.checkedInAt.lte = new Date(endDate);
            }
        }

        // Pagination
        const skip = (parseInt(page) - 1) * parseInt(limit);
        const take = parseInt(limit);

        // Get total count
        const totalCount = await prisma.checkInLog.count({
            where: whereClause
        });

        // Get history
        const history = await prisma.checkInLog.findMany({
            where: whereClause,
            include: {
                guest: {
                    select: {
                        id: true,
                        name: true,
                        phone: true,
                        category: true,
                        groupName: true
                    }
                },
                staff: {
                    select: {
                        id: true,
                        name: true,
                        email: true
                    }
                },
                photo: {
                    select: {
                        id: true,
                        filePath: true,
                        thumbnailPath: true
                    }
                }
            },
            orderBy: {
                checkedInAt: 'desc'
            },
            skip,
            take
        });

        // Get summary statistics
        const summary = await prisma.$transaction([
            prisma.checkInLog.count({ where: { eventId: event.id } }),
            prisma.checkInLog.count({ 
                where: { 
                    eventId: event.id,
                    checkedInAt: {
                        gte: new Date(new Date().setHours(0,0,0,0))
                    }
                }
            }),
            prisma.checkInLog.groupBy({
                by: ['method'],
                where: { eventId: event.id },
                _count: true
            })
        ]);

        res.status(200).json({
            msg: "Success to get check-in history",
            data: history,
            summary: {
                total: summary[0],
                today: summary[1],
                byMethod: summary[2]
            },
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                totalCount,
                totalPages: Math.ceil(totalCount / parseInt(limit))
            }
        });

    } catch(e) {
        console.error('Check-in history error:', e);
        res.status(500).json({
            msg: "Server error"
        });
    }
};

/**
 * GET CHECK-IN STATISTICS
 */
const getCheckinStats = async(req, res) => {
    const eventId = parseInt(req.params.eventId);

    try {
        const event = await prisma.event.findFirst({
            where: { id: eventId }
        });

        if (!event) {
            return res.status(404).json({
                msg: "Event not found"
            });
        }

        const now = new Date();
        const oneHourAgo = new Date(now - 60 * 60 * 1000);
        const todayStart = new Date(now.setHours(0, 0, 0, 0));

        const stats = await prisma.$transaction([
            // Total guests
            prisma.guest.count({
                where: {
                    eventId,
                    isDeleted: false
                }
            }),
            // Confirmed guests
            prisma.guest.count({
                where: {
                    eventId,
                    rsvpStatus: 'YES',
                    isDeleted: false
                }
            }),
            // Attended guests
            prisma.guest.count({
                where: {
                    eventId,
                    status: 'ATTENDED',
                    isDeleted: false
                }
            }),
            // Check-ins in last hour
            prisma.checkInLog.count({
                where: {
                    eventId,
                    checkedInAt: {
                        gte: oneHourAgo
                    }
                }
            }),
            // Check-ins today
            prisma.checkInLog.count({
                where: {
                    eventId,
                    checkedInAt: {
                        gte: todayStart
                    }
                }
            }),
            // Peak hour calculation
            prisma.$queryRaw`
                SELECT 
                    EXTRACT(HOUR FROM "checkedInAt") as hour,
                    COUNT(*) as count
                FROM "CheckInLog"
                WHERE "eventId" = ${eventId}
                GROUP BY hour
                ORDER BY count DESC
                LIMIT 1
            `,
            // Check-in by method
            prisma.checkInLog.groupBy({
                by: ['method'],
                where: { eventId },
                _count: true
            }),
            // Photos taken
            prisma.eventPhoto.count({
                where: {
                    eventId,
                    isCheckInPhoto: true
                }
            }),
            // Photos sent
            prisma.eventPhoto.count({
                where: {
                    eventId,
                    isCheckInPhoto: true,
                    waStatus: 'DELIVERED'
                }
            })
        ]);

        res.status(200).json({
            msg: "Success to get check-in statistics",
            data: {
                totalGuests: stats[0],
                confirmedGuests: stats[1],
                attendedGuests: stats[2],
                attendanceRate: stats[0] > 0 ? (stats[2] / stats[0] * 100).toFixed(2) : 0,
                checkInsLastHour: stats[3],
                checkInsToday: stats[4],
                peakHour: stats[5][0]?.hour || null,
                peakHourCount: stats[5][0]?.count || 0,
                byMethod: stats[6],
                photos: {
                    taken: stats[7],
                    sent: stats[8],
                    successRate: stats[7] > 0 ? (stats[8] / stats[7] * 100).toFixed(2) : 0
                }
            }
        });

    } catch(e) {
        console.error('Get check-in stats error:', e);
        res.status(500).json({
            msg: "Server error"
        });
    }
};

/**
 * SEND PHOTO TO WHATSAPP
 */
const sendPhotoToWhatsApp = async(req, res) => {
    const { guestId, photoId } = req.body;

    try {
        const guest = await prisma.guest.findFirst({
            where: {
                id: parseInt(guestId),
                isDeleted: false
            }
        });

        const photo = await prisma.eventPhoto.findFirst({
            where: {
                id: parseInt(photoId),
                guestId: parseInt(guestId)
            },
            include: {
                event: true
            }
        });

        if (!guest || !photo) {
            return res.status(404).json({
                msg: "Guest or photo not found"
            });
        }

        if (!guest.phone) {
            return res.status(400).json({
                msg: "Guest has no phone number"
            });
        }

        // Update photo status
        await prisma.eventPhoto.update({
            where: { id: photo.id },
            data: {
                waStatus: 'SENDING',
                retryCount: {
                    increment: 1
                },
                lastRetryAt: new Date()
            }
        });

        // Create WhatsApp log
        const waLog = await prisma.whatsAppLog.create({
            data: {
                messageId: `WA-${Date.now()}-${photo.id}`,
                toPhone: guest.phone,
                toName: guest.name,
                messageType: 'PHOTO',
                caption: `Halo ${guest.name}, terima kasih telah hadir di acara ${photo.event.weddingTitle}! Berikut foto Anda.`,
                photoId: photo.id,
                guestId: guest.id,
                eventId: photo.eventId,
                status: 'PENDING',
                sentAt: new Date()
            }
        });

        // TODO: Integrate with actual WhatsApp API
        // This is where you'd call your WhatsApp service

        res.status(200).json({
            msg: "Photo send to WhatsApp initiated",
            data: {
                waLogId: waLog.id,
                messageId: waLog.messageId,
                status: waLog.status
            }
        });

    } catch(e) {
        console.error('Send photo to WhatsApp error:', e);
        res.status(500).json({
            msg: "Server error"
        });
    }
};

// =======================
// RSVP MANAGEMENT
// =======================

/**
 * SUBMIT RSVP
 */
const submitRSVP = async(req, res) => {
    const { 
        guestId,
        status,
        totalPax,
        plusOnes,
        attendingCeremony,
        attendingReception,
        dietaryPreference,
        songRequest,
        transportationNeed,
        message
    } = req.body;

    try {
        const guest = await prisma.guest.findFirst({
            where: {
                id: parseInt(guestId),
                isDeleted: false
            }
        });

        if (!guest) {
            return res.status(404).json({
                msg: "Guest not found"
            });
        }

        // Check if RSVP already exists
        const existingRSVP = await prisma.rsvp.findUnique({
            where: { guestId: parseInt(guestId) }
        });

        let rsvp;
        if (existingRSVP) {
            // Update existing RSVP
            rsvp = await prisma.rsvp.update({
                where: { guestId: parseInt(guestId) },
                data: {
                    status,
                    totalPax: totalPax || guest.invitedCount,
                    plusOnes: plusOnes || [],
                    attendingCeremony: attendingCeremony ?? true,
                    attendingReception: attendingReception ?? true,
                    dietaryPreference,
                    songRequest,
                    transportationNeed: transportationNeed ?? false,
                    message,
                    respondedAt: new Date(),
                    updatedAt: new Date()
                }
            });
        } else {
            // Create new RSVP
            rsvp = await prisma.rsvp.create({
                data: {
                    guestId: parseInt(guestId),
                    eventId: guest.eventId,
                    status,
                    totalPax: totalPax || guest.invitedCount,
                    plusOnes: plusOnes || [],
                    attendingCeremony: attendingCeremony ?? true,
                    attendingReception: attendingReception ?? true,
                    dietaryPreference,
                    songRequest,
                    transportationNeed: transportationNeed ?? false,
                    message,
                    respondedAt: new Date()
                }
            });
        }

        // Update guest status
        await prisma.guest.update({
            where: { id: parseInt(guestId) },
            data: {
                status: status === 'ATTENDING' ? 'CONFIRMED' : 'INVITED',
                confirmedPax: status === 'ATTENDING' ? totalPax : null,
                updatedAt: new Date()
            }
        });

        // Update event confirmed count
        if (status === 'ATTENDING') {
            await prisma.event.update({
                where: { id: guest.eventId },
                data: {
                    confirmedCount: {
                        increment: 1
                    }
                }
            });
        }

        res.status(200).json({
            msg: "RSVP submitted successfully",
            data: rsvp
        });

    } catch(e) {
        console.error('Submit RSVP error:', e);
        res.status(500).json({
            msg: "Server error"
        });
    }
};

/**
 * GET GUEST RSVP
 */
const getGuestRSVP = async(req, res) => {
    const guestId = parseInt(req.params.guestId);

    try {
        const rsvp = await prisma.rsvp.findUnique({
            where: { guestId },
            include: {
                guest: {
                    select: {
                        id: true,
                        name: true,
                        phone: true,
                        email: true,
                        invitedCount: true,
                        maxPlusOnes: true
                    }
                },
                event: {
                    select: {
                        id: true,
                        weddingTitle: true,
                        date: true,
                        startTime: true,
                        endTime: true,
                        venueName: true,
                        address: true,
                        rsvpDeadline: true
                    }
                }
            }
        });

        if (!rsvp) {
            return res.status(404).json({
                msg: "RSVP not found"
            });
        }

        res.status(200).json({
            msg: "Success to get RSVP",
            data: rsvp
        });

    } catch(e) {
        console.error('Get RSVP error:', e);
        res.status(500).json({
            msg: "Server error"
        });
    }
};

module.exports = {
    // Guest Management
    createGuest,
    bulkCreateGuests,
    searchGuests,
    getGuestById,
    updateGuest,
    deleteGuest,
    
    // Check-in Management
    checkinHandler,
    undoCheckin,
    checkinHistory,
    getCheckinStats,
    sendPhotoToWhatsApp,
    
    // RSVP Management
    submitRSVP,
    getGuestRSVP
};