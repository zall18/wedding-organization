const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const multer = require('multer');
const csv = require('csv-parser');
const fs = require('fs');
const upload = multer({ dest: 'uploads/' });

// =======================
// HELPER FUNCTIONS
// =======================

/**
 * Generate unique short ID untuk guest (8 karakter)
 */
const generateUniqueShortId = async (eventId) => {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let shortId;
    let isUnique = false;
    
    while (!isUnique) {
        shortId = '';
        for (let i = 0; i < 8; i++) { // ✅ 8 karakter sesuai schema
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

// =======================
// IMPORT GUEST FROM CSV
// =======================

/**
 * IMPORT GUEST FROM CSV
 * @route POST /api/guests/import
 * @access Private (Admin/Staff)
 */
const importGuestsFromCSV = async(req, res) => {
    const { eventId } = req.body;
    const results = [];

    // Validasi file
    if (!req.file) {
        return res.status(400).json({
            msg: "File CSV wajib diupload!"
        });
    }

    // Validasi eventId
    if (!eventId) {
        fs.unlinkSync(req.file.path);
        return res.status(400).json({
            msg: "Event ID wajib diisi!"
        });
    }

    try {
        // Cek apakah event exists
        const event = await prisma.event.findUnique({
            where: { id: parseInt(eventId) }
        });

        if (!event) {
            fs.unlinkSync(req.file.path);
            return res.status(404).json({
                msg: "Event tidak ditemukan!"
            });
        }

        // Cek kapasitas event
        const currentGuests = await prisma.guest.count({
            where: { eventId: parseInt(eventId) }
        });

        // Parse CSV
        const parseCSV = () => {
            return new Promise((resolve, reject) => {
                fs.createReadStream(req.file.path)
                    .pipe(csv())
                    .on('data', (data) => {
                        // Validate required fields
                        if (!data.name || !data.phone) {
                            console.warn('Skipping row: missing name or phone', data);
                            return;
                        }

                        results.push({
                            name: data.name.trim(),
                            phone: data.phone.trim(),
                            email: data.email ? data.email.trim() : null,
                            category: data.category ? data.category.toUpperCase().trim() : "REGULAR",
                            groupName: data.groupName ? data.groupName.trim() : null,
                            invitedCount: parseInt(data.invitedCount) || 1,
                            plusOneAllowed: parseInt(data.plusOneAllowed) || 0,
                            status: "INVITED",
                            rsvpStatus: "PENDING",
                            eventId: parseInt(eventId),
                            createdAt: new Date(),
                            updatedAt: new Date()
                        });
                    })
                    .on('end', () => {
                        resolve(results);
                    })
                    .on('error', (error) => {
                        reject(error);
                    });
            });
        };

        const parsedData = await parseCSV();

        // Hapus file setelah parsing
        fs.unlinkSync(req.file.path);

        // Validasi data kosong
        if (parsedData.length === 0) {
            return res.status(400).json({
                msg: "Tidak ada data valid dalam file CSV"
            });
        }

        // Cek kapasitas setelah parsing
        if (event.maxGuests && (currentGuests + parsedData.length) > event.maxGuests) {
            return res.status(400).json({
                msg: `Melebihi kapasitas maksimum tamu (${event.maxGuests}). Saat ini: ${currentGuests} tamu, mencoba import: ${parsedData.length} tamu`
            });
        }

        // Format phone numbers dan cek duplikat
        const formattedData = [];
        const errors = [];
        const phoneSet = new Set();

        for (const [index, item] of parsedData.entries()) {
            try {
                // Format phone
                const formattedPhone = formatPhoneForWA(item.phone);
                
                if (!formattedPhone) {
                    errors.push(`Baris ${index + 2}: Nomor telepon tidak valid - ${item.phone}`);
                    continue;
                }

                // Cek duplikat dalam file CSV
                const phoneKey = `${item.eventId}-${formattedPhone}`;
                if (phoneSet.has(phoneKey)) {
                    errors.push(`Baris ${index + 2}: Nomor telepon duplikat dalam file - ${item.phone}`);
                    continue;
                }
                phoneSet.add(phoneKey);

                // Generate unique shortId untuk setiap guest (bukan 1 untuk semua!)
                const shortId = await generateUniqueShortId(parseInt(eventId));

                formattedData.push({
                    ...item,
                    phone: formattedPhone,
                    shortId,
                    qrCode: `WED-${event.shortCode}-${Date.now()}-${Math.random().toString(36).substring(7)}`
                });

            } catch (error) {
                errors.push(`Baris ${index + 2}: Error processing - ${error.message}`);
            }
        }

        // Jika ada errors, return dengan list errors
        if (errors.length > 0) {
            return res.status(400).json({
                msg: "Beberapa baris memiliki error",
                errors: errors,
                totalErrors: errors.length,
                totalSuccess: formattedData.length
            });
        }

        // Batch insert dengan transaction untuk menghindari partial insert
        const result = await prisma.$transaction(async (tx) => {
            // Create many guests
            const guests = await tx.guest.createMany({
                data: formattedData,
                skipDuplicates: true
            });

            // Update event total guests
            await tx.event.update({
                where: { id: parseInt(eventId) },
                data: {
                    totalGuests: {
                        increment: guests.count
                    }
                }
            });

            return guests;
        });

        res.status(200).json({
            msg: `Berhasil mengimport ${result.count} dari ${parsedData.length} tamu!`,
            data: {
                imported: result.count,
                total: parsedData.length,
                skipped: parsedData.length - result.count
            }
        });

    } catch (error) {
        console.error('Import guests error:', error);
        
        // Clean up file if exists
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }

        res.status(500).json({
            msg: "Server error",
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

/**
 * DOWNLOAD CSV TEMPLATE
 * @route GET /api/guests/template
 * @access Private
 */
const downloadCSVTemplate = async(req, res) => {
    try {
        const headers = [
            'name',
            'phone',
            'email',
            'category',
            'groupName',
            'invitedCount',
            'plusOneAllowed'
        ].join(',');

        const exampleRow = [
            'John Doe',
            '081234567890',
            'john@example.com',
            'VIP',
            'Keluarga Mempelai Pria',
            '2',
            '1'
        ].join(',');

        const csvContent = `${headers}\n${exampleRow}`;

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=guest-template.csv');
        res.status(200).send(csvContent);

    } catch (error) {
        console.error('Download template error:', error);
        res.status(500).json({
            msg: "Server error"
        });
    }
};


/**
 * Format phone number untuk WhatsApp (20 karakter)
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
    
    // Limit to 20 characters sesuai schema
    return formatted.slice(0, 20);
};

// =======================
// GUEST MANAGEMENT
// =======================

/**
 * CREATE GUEST
 * Menambahkan tamu baru ke event
 * ✅ SESUAI SCHEMA Guest model
 */
const createGuest = async(req, res) => {
    const { 
        name, 
        phone, 
        email,
        invitedCount = 1,
        plusOneAllowed = 0,
        eventId,
        category = "REGULAR",
        groupName,
        rsvpStatus = "PENDING"
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

        // Format phone number (wajib)
        if (!phone) {
            return res.status(400).json({
                msg: "Phone number is required"
            });
        }
        const formattedPhone = formatPhoneForWA(phone);

        // Check duplicate phone in same event (unique constraint)
        const existingGuest = await prisma.guest.findFirst({
            where: {
                eventId: parseInt(eventId),
                phone: formattedPhone
            }
        });

        if (existingGuest) {
            return res.status(400).json({
                msg: "Guest with this phone number already exists in this event"
            });
        }

        // Generate unique identifiers
        const shortId = await generateUniqueShortId(parseInt(eventId));

        // Create guest - ✅ SESUAI DENGAN SCHEMA Guest
        const guest = await prisma.guest.create({
            data: {
                name,
                phone: formattedPhone,
                email,
                invitedCount,
                plusOneAllowed,
                category: category.toUpperCase(),
                groupName,
                eventId: parseInt(eventId),
                shortId, // ✅ shortId di-generate, qrCode auto UUID
                status: 'INVITED',
                rsvpStatus: rsvpStatus.toUpperCase(),
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
                }
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

        res.status(201).json({
            msg: "Success to add guest",
            data: guest,
            qrCode: guest.qrCode, // ✅ Auto-generated UUID
            invitationUrl: `${process.env.BASE_URL}/invite/${event.shortCode}/${guest.shortId}`
        });

    } catch(e) {
        console.error('Create guest error:', e);
        res.status(500).json({
            msg: "Server error",
            error: process.env.NODE_ENV === 'development' ? e.message : undefined
        });
    }
};


const getGuestByEventIdSlug = async(req, res) => {
    const SlugId  = req.params.slug;

    try {
        const guests = await prisma.event.findFirst({
            where : {
                slug : SlugId
            },
            include : {
                guests : {
                    select : {
                        id : true,
                        name : true,
                        email : true,
                        phone : true, 
                        invitedCount : true,
                        plusOneAllowed: true,
                        category : true, 
                        status : true, 
                        groupName : true,
                        qrCode : true, 
                        shortId : true,
                        rsvpDate : true
                    }
                }
            }
        });

        const eventData = await prisma.event.findFirst({
            where: { id : 1 },
            include: { _count: { select: { guests: true } } } // Ini buat ngitung jumlah tamu aslinya
        });

        console.log("Event Ketemu:", eventData?.id);
        console.log("Jumlah tamu di DB:", eventData?._count?.guests);

        if(!guests) {
            return res.status(400).json({
                msg: "Event not found"
            });
        }

        return res.status(200).json({
            msg: "Success to get data",
            data : guests
        });
    } catch(e) {
        console.log(e);
        res.status(500).json({
            msg: "Server Error"
        });
    }
}

/**
 * CONFIRM GUEST (Ubah status ke CONFIRMED)
 * @route PATCH /api/guests/:id/confirm
 * @access Private (Staff/Admin)
 */

const guestConfirmed = async(req, res) => {
    const shortId = req.params.shortId;
    try {
        const guest = await prisma.guest.findFirst({
            where : {
                shortId : shortId
            }
        });

        if (!guest) {
            return res.status(404).json({
                msg: "Guest not found"
            });
        }

        if (guest.status === 'ATTENDED') {
            return res.status(400).json({
                msg: "Guest already attended, cannot change confirmation"
            });
        }

        if (guest.status === 'CANCELLED') {
            return res.status(400).json({
                msg: "Guest is cancelled, cannot confirm"
            });
        }

        const result = await prisma.guest.update({
            where : {
                shortId : shortId
            },
             data : {
                status : "CONFIRMED"
             }
        });

        return res.status(200).json({
            msg : "Success to update status",
            data : result
        });
    } catch(e) {
        console.error(e);
        return res.status(500).json({
            msg : "Server error"
        })
    }
}


/**
 * BULK CREATE GUESTS
 * Import tamu dalam jumlah besar
 * ✅ SESUAI SCHEMA Guest model
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

                const guest = await prisma.guest.create({
                    data: {
                        name: guestData.name,
                        phone: formattedPhone,
                        email: guestData.email,
                        invitedCount: guestData.invitedCount || 1,
                        plusOneAllowed: guestData.plusOneAllowed || 0,
                        category: guestData.category?.toUpperCase() || 'REGULAR',
                        groupName: guestData.groupName,
                        eventId: parseInt(eventId),
                        shortId,
                        status: 'INVITED',
                        rsvpStatus: 'PENDING'
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
 * ✅ SESUAI SCHEMA Guest model
 */
const searchGuests = async(req, res) => {
    const { 
        q, 
        eventId, 
        category, 
        status, 
        groupName,
        rsvpStatus,
        page = 1,
        limit = 20,
        sortBy = 'name',
        sortOrder = 'asc'
    } = req.query;

    try {
        // Build where clause - ✅ SESUAI FIELD Guest
        const whereClause = {
            eventId: parseInt(eventId)
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

        if (rsvpStatus) {
            whereClause.rsvpStatus = rsvpStatus.toUpperCase();
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

        // Get guests - ✅ SESUAI RELASI yang ada di schema
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
                checkIns: {
                    take: 1,
                    orderBy: {
                        checkedInAt: 'desc'
                    }
                },
                photos: {
                    take: 1,
                    where: {
                        isCheckInPhoto: true
                    }
                },
                _count: {
                    select: {
                        checkIns: true,
                        photos: true,
                        guestWishes: true,
                        whatsAppLogs: true
                    }
                }
            },
            orderBy: {
                [sortBy]: sortOrder
            },
            skip,
            take
        });

        // Format response
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
 * ✅ SESUAI SCHEMA Guest model
 */
const getGuestById = async(req, res) => {
    const id = parseInt(req.params.id);

    try {
        const guest = await prisma.guest.findUnique({
            where: {
                id
            },
            include: {
                event: {
                    select: {
                        id: true,
                        weddingTitle: true,
                        groomName: true,
                        brideName: true,
                        date: true,
                        startTime: true,
                        endTime: true,
                        venueName: true,
                        shortCode: true,
                        primaryColor: true,
                        allowPhotoOnCheckIn: true,
                        autoSendPhotoToWA: true
                    }
                },
                checkIns: {
                    orderBy: {
                        checkedInAt: 'desc'
                    },
                    include: {
                        checkedInBy: {
                            select: {
                                id: true,
                                name: true
                            }
                        },
                        photo: true
                    }
                },
                photos: {
                    orderBy: {
                        takenAt: 'desc'
                    }
                },
                whatsAppLogs: {
                    orderBy: {
                        sentAt: 'desc'
                    },
                    take: 5
                },
                guestWishes: {
                    orderBy: {
                        createdAt: 'desc'
                    },
                    take: 5
                }
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
            qrCode: guest.qrCode,
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
 * ✅ SESUAI SCHEMA Guest model
 */
const updateGuest = async(req, res) => {
    const id = parseInt(req.params.id);
    const {
        name,
        phone,
        email,
        invitedCount,
        plusOneAllowed,
        category,
        groupName,
        status,
        rsvpStatus,
        rsvpNote,
        rsvpDate,
        checkedInBy
    } = req.body;

    try {
        const guest = await prisma.guest.findUnique({
            where: { id }
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
                    id: { not: id }
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
                plusOneAllowed: plusOneAllowed !== undefined ? plusOneAllowed : guest.plusOneAllowed,
                category: category?.toUpperCase() || guest.category,
                groupName: groupName !== undefined ? groupName : guest.groupName,
                status: status || guest.status,
                rsvpStatus: rsvpStatus?.toUpperCase() || guest.rsvpStatus,
                rsvpNote: rsvpNote !== undefined ? rsvpNote : guest.rsvpNote,
                rsvpDate: rsvpDate ? new Date(rsvpDate) : guest.rsvpDate,
                checkedInBy: checkedInBy !== undefined ? checkedInBy : guest.checkedInBy,
                updatedAt: new Date()
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
 * DELETE GUEST (Hard Delete karena tidak ada soft delete di schema)
 * ⚠️ SCHEMA TIDAK ADA FIELD isDeleted, jadi hard delete
 */
const deleteGuest = async(req, res) => {
    const id = parseInt(req.params.id);

    try {
        const guest = await prisma.guest.findUnique({
            where: { id },
            include: {
                checkIns: true,
                photos: true,
                whatsAppLogs: true,
                guestWishes: true
            }
        });

        if (!guest) {
            return res.status(404).json({
                msg: "Guest not found"
            });
        }

        // Hapus semua relasi terlebih dahulu
        await prisma.$transaction([
            // Delete guest wishes
            prisma.guestWish.deleteMany({
                where: { guestId: id }
            }),
            // Delete WhatsApp logs
            prisma.whatsAppLog.deleteMany({
                where: { guestId: id }
            }),
            // Delete photos (check-in photos)
            prisma.eventPhoto.deleteMany({
                where: { guestId: id }
            }),
            // Delete check-in logs
            prisma.checkInLog.deleteMany({
                where: { guestId: id }
            }),
            // Finally delete guest
            prisma.guest.delete({
                where: { id }
            })
        ]);

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
 * Proses check-in tamu dengan foto
 * ✅ SESUAI SCHEMA CheckInLog, Guest, EventPhoto
 */
const checkinHandler = async(req, res) => {
    const { 
        qrCode, 
        guestId, 
        arrivedCount = 1, 
        method,
        deviceType,
        deviceBrowser
    } = req.body;
    
    const eventId = parseInt(req.params.eventId);
    const staffId = req.user?.id;

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

        // Find guest
        let guest;
        if (method === "QR_SCAN") {
            guest = await prisma.guest.findFirst({
                where: {
                    eventId,
                    qrCode
                }
            });
        } else {
            guest = await prisma.guest.findFirst({
                where: {
                    eventId,
                    id: parseInt(guestId)
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

        // Validate arrived count
        if (!arrivedCount || arrivedCount < 1) {
            return res.status(400).json({
                msg: "Arrived count must be at least 1"
            });
        }

        if (arrivedCount > guest.invitedCount + guest.plusOneAllowed) {
            return res.status(400).json({
                msg: `Arrived count exceeds maximum (${guest.invitedCount + guest.plusOneAllowed})`
            });
        }

        // Start transaction
        const result = await prisma.$transaction(async (tx) => {
            // 1. Update guest status - ✅ SESUAI Guest model
            const updatedGuest = await tx.guest.update({
                where: { id: guest.id },
                data: {
                    status: "ATTENDED",
                    arrivedPax: arrivedCount,
                    checkedInAt: new Date(),
                    checkedInBy: req.user?.name || null,
                    updatedAt: new Date()
                }
            });

            // 2. Create check-in log - ✅ SESUAI CheckInLog model
            const checkIn = await tx.checkInLog.create({
                data: {
                    arrivedCount,
                    method,
                    guestId: guest.id,
                    eventId: event.id,
                    checkedInById: staffId,
                    deviceType,
                    deviceBrowser,
                    checkedInAt: new Date()
                }
            });

            // 3. Update event attended count
            await tx.event.update({
                where: { id: event.id },
                data: {
                    attendedCount: {
                        increment: 1
                    }
                }
            });

            return { 
                guest: updatedGuest, 
                checkIn,
                event 
            };
        });

        // Create event stats snapshot
        await prisma.eventStats.create({
            data: {
                eventId: event.id,
                totalGuests: await prisma.guest.count({ where: { eventId: event.id } }),
                guestsArrived: await prisma.guest.count({ where: { eventId: event.id, status: 'ATTENDED' } }),
                guestsPending: await prisma.guest.count({ where: { eventId: event.id, status: { not: 'ATTENDED' } } }),
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
                checkIn: {
                    id: result.checkIn.id,
                    method: result.checkIn.method,
                    checkedInAt: result.checkIn.checkedInAt
                },
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
 * ADD CHECK-IN PHOTO
 * Menambahkan foto ke check-in log
 * ✅ SESUAI SCHEMA EventPhoto & CheckInLog
 */
const addCheckInPhoto = async(req, res) => {
    const { 
        checkInId,
        filename,
        filePath,
        thumbnailPath,
        fileSize,
        mimeType,
        width,
        height,
        waStatus = 'PENDING'
    } = req.body;
    
    const staffId = req.user?.id;

    try {
        // Get check-in log
        const checkIn = await prisma.checkInLog.findUnique({
            where: { id: parseInt(checkInId) },
            include: {
                guest: true,
                event: true
            }
        });

        if (!checkIn) {
            return res.status(404).json({
                msg: "Check-in log not found"
            });
        }

        // Create photo - ✅ SESUAI EventPhoto model
        const photo = await prisma.eventPhoto.create({
            data: {
                filename,
                filePath,
                thumbnailPath,
                fileSize,
                mimeType,
                width,
                height,
                eventId: checkIn.eventId,
                guestId: checkIn.guestId,
                takenById: staffId,
                takenAt: new Date(),
                isCheckInPhoto: true,
                waStatus,
                checkInLog: {
                    connect: { id: checkIn.id }
                }
            }
        });

        // Update check-in log with photoId (unique constraint)
        await prisma.checkInLog.update({
            where: { id: checkIn.id },
            data: {
                photoId: photo.id
            }
        });

        // Auto-send to WhatsApp if enabled
        if (checkIn.event.autoSendPhotoToWA && checkIn.guest.phone) {
            await prisma.whatsAppLog.create({
                data: {
                    messageId: `WA-${Date.now()}`,
                    toPhone: checkIn.guest.phone,
                    toName: checkIn.guest.name,
                    messageType: 'PHOTO',
                    caption: `Halo ${checkIn.guest.name}, terima kasih telah hadir di pernikahan ${checkIn.event.groomName} & ${checkIn.event.brideName}! Berikut foto Anda saat check-in.`,
                    photoId: photo.id,
                    guestId: checkIn.guest.id,
                    eventId: checkIn.event.id,
                    status: 'PENDING',
                    sentAt: new Date()
                }
            });
        }

        res.status(201).json({
            msg: "Success to add check-in photo",
            data: photo
        });

    } catch(e) {
        console.error('Add check-in photo error:', e);
        res.status(500).json({
            msg: "Server error"
        });
    }
};

/**
 * UNDO CHECK-IN
 * ✅ SESUAI SCHEMA Guest & CheckInLog
 */
const undoCheckin = async(req, res) => {
    const id = parseInt(req.params.id);
    const staffId = req.user?.id;

    try {
        const guest = await prisma.guest.findUnique({
            where: { id },
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
            // Update guest status - ✅ SESUAI Guest model
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

            // Delete check-in log (cascade akan hapus photo? Tidak, photo tetap ada tapi relasi dihapus)
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
 * ✅ SESUAI SCHEMA CheckInLog
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
        const event = await prisma.event.findUnique({
            where: { id: eventId }
        });

        if (!event) {
            return res.status(404).json({
                msg: "Event not found"
            });
        }

        // Build where clause - ✅ SESUAI CheckInLog fields
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

        // Get history - ✅ SESUAI relasi CheckInLog
        const history = await prisma.checkInLog.findMany({
            where: whereClause,
            include: {
                guest: {
                    select: {
                        id: true,
                        name: true,
                        phone: true,
                        category: true,
                        groupName: true,
                        status: true
                    }
                },
                checkedInBy: {
                    select: {
                        id: true,
                        name: true,
                        email: true
                    }
                },
                photo: true
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
 * ✅ SESUAI SCHEMA yang ada
 */
const getCheckinStats = async(req, res) => {
    const eventId = parseInt(req.params.eventId);

    try {
        const event = await prisma.event.findUnique({
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
            prisma.guest.count({ where: { eventId } }),
            
            // Confirmed guests (rsvpStatus = 'YES')
            prisma.guest.count({
                where: {
                    eventId,
                    rsvpStatus: 'YES'
                }
            }),
            
            // Attended guests
            prisma.guest.count({
                where: {
                    eventId,
                    status: 'ATTENDED'
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
                    eventId
                }
            }),
            
            // Photos sent (waStatus = 'DELIVERED')
            prisma.eventPhoto.count({
                where: {
                    eventId,
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
                attendanceRate: stats[0] > 0 ? ((stats[2] / stats[0]) * 100).toFixed(2) : 0,
                checkInsLastHour: stats[3],
                checkInsToday: stats[4],
                peakHour: stats[5][0]?.hour || null,
                peakHourCount: stats[5][0]?.count || 0,
                byMethod: stats[6],
                photos: {
                    taken: stats[7],
                    sent: stats[8],
                    successRate: stats[7] > 0 ? ((stats[8] / stats[7]) * 100).toFixed(2) : 0
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
 * UPDATE PHOTO STATUS
 * Update status pengiriman WhatsApp
 * ✅ SESUAI SCHEMA EventPhoto
 */
const updatePhotoStatus = async(req, res) => {
    const { photoId, waStatus, waMessageId, waError } = req.body;

    try {
        const photo = await prisma.eventPhoto.update({
            where: { id: parseInt(photoId) },
            data: {
                waStatus,
                waMessageId,
                waError,
                waSentAt: waStatus === 'DELIVERED' ? new Date() : undefined
            }
        });

        res.status(200).json({
            msg: "Success to update photo status",
            data: photo
        });

    } catch(e) {
        console.error('Update photo status error:', e);
        res.status(500).json({
            msg: "Server error"
        });
    }
};

// =======================
// WHATSAPP LOG MANAGEMENT
// =======================

/**
 * CREATE WHATSAPP LOG
 * ✅ SESUAI SCHEMA WhatsAppLog
 */
const createWhatsAppLog = async(req, res) => {
    const {
        messageId,
        templateId,
        toPhone,
        toName,
        messageType,
        caption,
        photoId,
        guestId,
        eventId,
        status,
        error
    } = req.body;

    try {
        const waLog = await prisma.whatsAppLog.create({
            data: {
                messageId,
                templateId,
                toPhone,
                toName,
                messageType,
                caption,
                photoId: photoId ? parseInt(photoId) : null,
                guestId: guestId ? parseInt(guestId) : null,
                eventId: parseInt(eventId),
                status,
                error,
                sentAt: new Date()
            }
        });

        res.status(201).json({
            msg: "Success to create WhatsApp log",
            data: waLog
        });

    } catch(e) {
        console.error('Create WhatsApp log error:', e);
        res.status(500).json({
            msg: "Server error"
        });
    }
};

/**
 * UPDATE WHATSAPP LOG STATUS
 * ✅ SESUAI SCHEMA WhatsAppLog
 */
const updateWhatsAppStatus = async(req, res) => {
    const { messageId, status, deliveredAt, readAt, error } = req.body;

    try {
        const waLog = await prisma.whatsAppLog.update({
            where: { messageId },
            data: {
                status,
                deliveredAt: deliveredAt ? new Date(deliveredAt) : undefined,
                readAt: readAt ? new Date(readAt) : undefined,
                error
            }
        });

        // If photo is delivered, update photo status
        if (waLog.photoId && status === 'DELIVERED') {
            await prisma.eventPhoto.update({
                where: { id: waLog.photoId },
                data: {
                    waStatus: 'DELIVERED',
                    waSentAt: new Date()
                }
            });
        }

        res.status(200).json({
            msg: "Success to update WhatsApp status",
            data: waLog
        });

    } catch(e) {
        console.error('Update WhatsApp status error:', e);
        res.status(500).json({
            msg: "Server error"
        });
    }
};

// =======================
// GUEST WISHES
// =======================

/**
 * CREATE GUEST WISH
 * ✅ SESUAI SCHEMA GuestWish
 */
const createGuestWish = async(req, res) => {
    const {
        message,
        fromName,
        fromPhone,
        isPublic = true,
        eventId,
        guestId
    } = req.body;

    try {
        const wish = await prisma.guestWish.create({
            data: {
                message,
                fromName,
                fromPhone: fromPhone ? formatPhoneForWA(fromPhone) : null,
                isPublic,
                eventId: parseInt(eventId),
                guestId: guestId ? parseInt(guestId) : null
            }
        });

        res.status(201).json({
            msg: "Success to create guest wish",
            data: wish
        });

    } catch(e) {
        console.error('Create guest wish error:', e);
        res.status(500).json({
            msg: "Server error"
        });
    }
};

/**
 * GET GUEST WISHES
 * ✅ SESUAI SCHEMA GuestWish
 */
const getGuestWishes = async(req, res) => {
    const eventId = parseInt(req.params.eventId);
    const { page = 1, limit = 20 } = req.query;

    try {
        const skip = (parseInt(page) - 1) * parseInt(limit);
        const take = parseInt(limit);

        const wishes = await prisma.guestWish.findMany({
            where: {
                eventId,
                isPublic: true
            },
            orderBy: {
                createdAt: 'desc'
            },
            skip,
            take,
            include: {
                guest: {
                    select: {
                        id: true,
                        name: true
                    }
                }
            }
        });

        const totalCount = await prisma.guestWish.count({
            where: {
                eventId,
                isPublic: true
            }
        });

        res.status(200).json({
            msg: "Success to get guest wishes",
            data: wishes,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                totalCount,
                totalPages: Math.ceil(totalCount / parseInt(limit))
            }
        });

    } catch(e) {
        console.error('Get guest wishes error:', e);
        res.status(500).json({
            msg: "Server error"
        });
    }
};

// =======================
// EVENT STATS
// =======================

/**
 * GET EVENT STATS
 * ✅ SESUAI SCHEMA EventStats
 */
const getEventStats = async(req, res) => {
    const eventId = parseInt(req.params.eventId);

    try {
        const latestStats = await prisma.eventStats.findFirst({
            where: { eventId },
            orderBy: {
                snapshotTime: 'desc'
            }
        });

        if (!latestStats) {
            return res.status(404).json({
                msg: "Event stats not found"
            });
        }

        res.status(200).json({
            msg: "Success to get event stats",
            data: latestStats
        });

    } catch(e) {
        console.error('Get event stats error:', e);
        res.status(500).json({
            msg: "Server error"
        });
    }
};

module.exports = {
    // Guest Management
    createGuest,
    importGuestsFromCSV,
    downloadCSVTemplate,
    bulkCreateGuests,
    searchGuests,
    getGuestById,
    updateGuest,
    deleteGuest,
    getGuestByEventIdSlug,
    guestConfirmed,
    
    // Check-in Management
    checkinHandler,
    addCheckInPhoto,
    undoCheckin,
    checkinHistory,
    getCheckinStats,
    updatePhotoStatus,
    
    // WhatsApp Log
    createWhatsAppLog,
    updateWhatsAppStatus,
    
    // Guest Wishes
    createGuestWish,
    getGuestWishes,
    
    // Event Stats
    getEventStats
};