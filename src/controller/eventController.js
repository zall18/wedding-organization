const { PrismaClient } = require('@prisma/client');
const { generateShortCode } = require('../utils/helpers'); // Anda perlu buat helper ini

const prisma = new PrismaClient();

// Helper untuk generate short code unik
const generateUniqueShortCode = async () => {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code;
  let isUnique = false;
  
  while (!isUnique) {
    code = '';
    for (let i = 0; i < 6; i++) {
      code += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    
    const existing = await prisma.event.findFirst({
      where: { shortCode: code }
    });
    
    if (!existing) {
      isUnique = true;
    }
  }
  
  return code;
};

// CREATE EVENT
const createEvent = async(req, res) => {
    const { 
        groomName, 
        brideName, 
        weddingTitle,
        date, 
        startTime,
        endTime,
        venueName,
        venueType,
        address,
        googleMapsUrl,
        primaryColor,
        logoUrl,
        coverImageUrl,
        invitationType,
        allowPhotoOnCheckIn,
        autoSendPhotoToWA,
        enableRSVP,
        showLiveCount,
        userId 
    } = req.body;

    try {
        // Generate slug
        const baseSlug = weddingTitle
            .toLowerCase()
            .trim()
            .replace(/[^a-z0-9\s]+/g, "")
            .replace(/\s+/g, "-")
            .replace(/(^-|-$)/g, "");

        let slug = baseSlug;
        let counter = 1;

        while (await prisma.event.findUnique({ where: { slug } })) {
            slug = `${baseSlug}-${counter}`;
            counter++;
        }

        // Generate short code
        const shortCode = await generateUniqueShortCode();

        // Validate venue type
        const validVenueTypes = ['INDOOR', 'OUTDOOR', 'BALLROOM', 'GARDEN', 'BEACH', 'MASJID', 'CHURCH', 'TEMPLE', 'VENUE'];
        const venueTypeUpper = venueType?.toUpperCase();
        if (!validVenueTypes.includes(venueTypeUpper)) {
            return res.status(400).json({
                msg: "Invalid venue type"
            });
        }

        // Validate invitation type
        const validInvitationTypes = ['PUBLIC', 'PRIVATE'];
        const invitationTypeUpper = invitationType?.toUpperCase();
        if (!validInvitationTypes.includes(invitationTypeUpper)) {
            return res.status(400).json({
                msg: "Invalid invitation type"
            });
        }

        // Create event
        const event = await prisma.event.create({
            data: {
                slug: slug,
                shortCode: shortCode,
                groomName: groomName,
                brideName: brideName,
                weddingTitle: weddingTitle || `The Wedding of ${groomName} & ${brideName}`,
                date: new Date(date),
                startTime: new Date(startTime),
                endTime: new Date(endTime),
                venueName: venueName,
                venueType: venueTypeUpper,
                address: address,
                googleMapsUrl: googleMapsUrl,
                primaryColor: primaryColor || "#7C3AED",
                logoUrl: logoUrl,
                coverImageUrl: coverImageUrl,
                invitationType: invitationTypeUpper,
                isActive: false,
                isPublished: false,
                allowPhotoOnCheckIn: allowPhotoOnCheckIn ?? true,
                autoSendPhotoToWA: autoSendPhotoToWA ?? true,
                enableRSVP: enableRSVP ?? true,
                showLiveCount: showLiveCount ?? true,
                totalGuests: 0,
                confirmedCount: 0,
                attendedCount: 0
            }
        });

        // Jika ada userId, assign user ke event (update user)
        if (userId) {
            await prisma.user.update({
                where: { id: parseInt(userId) },
                data: { eventId: event.id }
            });
        }

        res.status(201).json({
            msg: "Success to create event",
            data: event
        });
    } catch(e) {
        console.log(e);
        res.status(500).json({
            msg: "Server error",
            error: process.env.NODE_ENV === 'development' ? e.message : undefined
        });
    }
}

// UPDATE EVENT
const updateEvent = async(req, res) => {
    const { 
        eventId,
        groomName, 
        brideName, 
        weddingTitle,
        date, 
        startTime,
        endTime,
        venueName,
        venueType,
        address,
        googleMapsUrl,
        primaryColor,
        logoUrl,
        coverImageUrl,
        invitationType,
        isActive,
        isPublished,
        allowPhotoOnCheckIn,
        autoSendPhotoToWA,
        enableRSVP,
        showLiveCount
    } = req.body;

    try {
        // Validasi event ID
        if (!eventId) {
            return res.status(400).json({
                msg: "Event ID is required"
            });
        }

        // Cek event exists
        const event = await prisma.event.findFirst({
            where: {
                id: parseInt(eventId)
            }
        });

        if (!event) {
            return res.status(404).json({
                msg: "Event not found"
            });
        }

        // Authorization check
        if (req.user.role === "STAFF" && req.user.eventId !== parseInt(eventId)) {
            return res.status(403).json({
                msg: "You can only update your assigned event"
            });
        }

        // Jika SUPER_ADMIN atau ADMIN, bisa update semua
        // Jika ORGANIZER (dalam schema baru tidak ada), handle sesuai kebutuhan
        if (req.user.role === "ORGANIZER" && req.user.eventId !== parseInt(eventId)) {
            return res.status(403).json({
                msg: "Organizer can only update their own event"
            });
        }

        // Update slug jika weddingTitle berubah
        let slug = event.slug;
        if (weddingTitle && weddingTitle !== event.weddingTitle) {
            const baseSlug = weddingTitle
                .toLowerCase()
                .trim()
                .replace(/[^a-z0-9\s]+/g, "")
                .replace(/\s+/g, "-")
                .replace(/(^-|-$)/g, "");

            slug = baseSlug;
            let counter = 1;
            
            while (await prisma.event.findFirst({ where: { slug, NOT: { id: parseInt(eventId) } } })) {
                slug = `${baseSlug}-${counter}`;
                counter++;
            }
        }

        // Validasi venue type jika diupdate
        let venueTypeUpper = event.venueType;
        if (venueType) {
            const validVenueTypes = ['INDOOR', 'OUTDOOR', 'BALLROOM', 'GARDEN', 'BEACH', 'MASJID', 'CHURCH', 'TEMPLE', 'VENUE'];
            venueTypeUpper = venueType.toUpperCase();
            if (!validVenueTypes.includes(venueTypeUpper)) {
                return res.status(400).json({
                    msg: "Invalid venue type"
                });
            }
        }

        // Validasi invitation type jika diupdate
        let invitationTypeUpper = event.invitationType;
        if (invitationType) {
            const validInvitationTypes = ['PUBLIC', 'PRIVATE'];
            invitationTypeUpper = invitationType.toUpperCase();
            if (!validInvitationTypes.includes(invitationTypeUpper)) {
                return res.status(400).json({
                    msg: "Invalid invitation type"
                });
            }
        }

        // Prepare update data
        const updateData = {
            slug: slug,
            groomName: groomName !== undefined ? groomName : event.groomName,
            brideName: brideName !== undefined ? brideName : event.brideName,
            weddingTitle: weddingTitle !== undefined ? weddingTitle : event.weddingTitle,
            date: date ? new Date(date) : event.date,
            startTime: startTime ? new Date(startTime) : event.startTime,
            endTime: endTime ? new Date(endTime) : event.endTime,
            venueName: venueName !== undefined ? venueName : event.venueName,
            venueType: venueTypeUpper,
            address: address !== undefined ? address : event.address,
            googleMapsUrl: googleMapsUrl !== undefined ? googleMapsUrl : event.googleMapsUrl,
            primaryColor: primaryColor !== undefined ? primaryColor : event.primaryColor,
            logoUrl: logoUrl !== undefined ? logoUrl : event.logoUrl,
            coverImageUrl: coverImageUrl !== undefined ? coverImageUrl : event.coverImageUrl,
            invitationType: invitationTypeUpper,
            isActive: isActive !== undefined ? Boolean(isActive) : event.isActive,
            isPublished: isPublished !== undefined ? Boolean(isPublished) : event.isPublished,
            allowPhotoOnCheckIn: allowPhotoOnCheckIn !== undefined ? Boolean(allowPhotoOnCheckIn) : event.allowPhotoOnCheckIn,
            autoSendPhotoToWA: autoSendPhotoToWA !== undefined ? Boolean(autoSendPhotoToWA) : event.autoSendPhotoToWA,
            enableRSVP: enableRSVP !== undefined ? Boolean(enableRSVP) : event.enableRSVP,
            showLiveCount: showLiveCount !== undefined ? Boolean(showLiveCount) : event.showLiveCount,
            updatedAt: new Date()
        };

        // Update event
        const eventUpdate = await prisma.event.update({
            where: {
                id: parseInt(eventId)
            },
            data: updateData
        });

        res.status(200).json({
            msg: "Success to update event",
            data: eventUpdate
        });
    } catch(e) {
        console.log(e);
        res.status(500).json({
            msg: "Server error",
            error: process.env.NODE_ENV === 'development' ? e.message : undefined
        });
    }
}

// DELETE EVENT
const deleteEvent = async(req, res) => {
    const eventId = req.params.id; // Ubah dari slug ke ID

    try {
        const event = await prisma.event.findFirst({
            where: {
                id: parseInt(eventId)
            },
            include: {
                guests: true,
                checkIns: true,
                photos: true
            }
        });

        if (!event) {
            return res.status(404).json({
                msg: "Event not found"
            });
        }

        // Authorization check
        if (req.user.role !== "SUPER_ADMIN" && req.user.role !== "ADMIN") {
            return res.status(403).json({
                msg: "Only admin can delete events"
            });
        }

        // Check if event has data
        const hasData = event.guests.length > 0 || 
                       event.checkIns.length > 0 || 
                       event.photos.length > 0;

        if (hasData) {
            return res.status(400).json({
                msg: "Cannot delete event with existing data. Consider deactivating instead.",
                dataCount: {
                    guests: event.guests.length,
                    checkIns: event.checkIns.length,
                    photos: event.photos.length
                }
            });
        }

        // Unassign users from this event
        await prisma.user.updateMany({
            where: { eventId: parseInt(eventId) },
            data: { eventId: null }
        });

        // Delete event
        await prisma.event.delete({
            where: {
                id: parseInt(eventId)
            }
        });

        res.status(200).json({
            msg: "Event successfully deleted"
        });
    } catch(e) {
        console.log(e);
        res.status(500).json({
            msg: "Server error",
            error: process.env.NODE_ENV === 'development' ? e.message : undefined
        });
    }
}

// GET ALL EVENTS
const showEvent = async(req, res) => {
    try {
        // Filter berdasarkan role user
        let whereCondition = {};
        
        if (req.user.role === "STAFF") {
            // Staff hanya bisa lihat event mereka sendiri
            whereCondition = {
                id: req.user.eventId
            };
        } else if (req.user.role === "ORGANIZER") {
            // Organizer hanya bisa lihat event mereka
            whereCondition = {
                id: req.user.eventId
            };
        }
        // SUPER_ADMIN dan ADMIN bisa lihat semua

        const events = await prisma.event.findMany({
            where: whereCondition,
            select: {
                id: true,
                slug: true,
                shortCode: true,
                groomName: true,
                brideName: true,
                weddingTitle: true,
                date: true,
                venueName: true,
                isActive: true,
                isPublished: true,
                totalGuests: true,
                confirmedCount: true,
                attendedCount: true,
                createdAt: true,
                _count: {
                    select: {
                        guests: true,
                        checkIns: true,
                        photos: true,
                        users: true
                    }
                }
            },
            orderBy: {
                createdAt: 'desc'
            }
        });

        res.status(200).json({
            msg: "Success to get all events",
            data: events,
            count: events.length
        });
    } catch(e) {
        console.log(e);
        res.status(500).json({
            msg: "Server error",
            error: process.env.NODE_ENV === 'development' ? e.message : undefined
        });
    }
}

// GET SINGLE EVENT
const findEvent = async(req, res) => {
    const identifier = req.params.identifier; // Bisa slug atau ID

    try {
        let event;
        
        // Coba cari dengan ID dulu
        if (!isNaN(identifier)) {
            event = await prisma.event.findFirst({
                where: {
                    id: parseInt(identifier)
                },
                include: {
                    users: {
                        select: {
                            id: true,
                            name: true,
                            email: true,
                            role: true
                        }
                    },
                    _count: {
                        select: {
                            guests: true,
                            checkIns: true,
                            photos: true
                        }
                    }
                }
            });
        }
        
        // Jika tidak ketemu dengan ID, cari dengan slug
        if (!event) {
            event = await prisma.event.findFirst({
                where: {
                    slug: identifier
                },
                include: {
                    users: {
                        select: {
                            id: true,
                            name: true,
                            email: true,
                            role: true
                        }
                    },
                    _count: {
                        select: {
                            guests: true,
                            checkIns: true,
                            photos: true
                        }
                    }
                }
            });
        }
        
        // Jika tidak ketemu sama sekali
        if (!event) {
            return res.status(404).json({
                msg: "Event not found"
            });
        }

        // Authorization check untuk staff/organizer
        if (req.user.role === "STAFF" && req.user.eventId !== event.id) {
            return res.status(403).json({
                msg: "You can only view your assigned event"
            });
        }

        res.status(200).json({
            msg: "Success to find event",
            data: event
        });

    } catch(e) {
        console.log(e);
        res.status(500).json({
            msg: "Server error",
            error: process.env.NODE_ENV === 'development' ? e.message : undefined
        });
    }
}

// GET EVENT BY SHORT CODE (Public API)
const getEventByShortCode = async(req, res) => {
    const shortCode = req.params.shortCode;

    try {
        const event = await prisma.event.findFirst({
            where: {
                shortCode: shortCode,
                isActive: true,
                isPublished: true
            },
            select: {
                id: true,
                shortCode: true,
                groomName: true,
                brideName: true,
                weddingTitle: true,
                date: true,
                startTime: true,
                endTime: true,
                venueName: true,
                venueType: true,
                address: true,
                googleMapsUrl: true,
                primaryColor: true,
                logoUrl: true,
                coverImageUrl: true,
                invitationType: true,
                totalGuests: true,
                confirmedCount: true,
                attendedCount: true
            }
        });

        if (!event) {
            return res.status(404).json({
                msg: "Event not found or not published"
            });
        }

        res.status(200).json({
            msg: "Success to get event",
            data: event
        });

    } catch(e) {
        console.log(e);
        res.status(500).json({
            msg: "Server error"
        });
    }
}

// UPDATE EVENT STATS (Internal/Background)
const updateEventStats = async(eventId) => {
    try {
        const stats = await prisma.$transaction(async (tx) => {
            // Hitung statistik
            const totalGuests = await tx.guest.count({
                where: { eventId: eventId }
            });

            const attendedCount = await tx.guest.count({
                where: { 
                    eventId: eventId,
                    status: 'ATTENDED'
                }
            });

            const confirmedCount = await tx.guest.count({
                where: { 
                    eventId: eventId,
                    rsvpStatus: 'YES'
                }
            });

            const photosTaken = await tx.eventPhoto.count({
                where: { eventId: eventId }
            });

            const photosSent = await tx.eventPhoto.count({
                where: { 
                    eventId: eventId,
                    waStatus: 'DELIVERED'
                }
            });

            // Update event stats
            const updatedEvent = await tx.event.update({
                where: { id: eventId },
                data: {
                    totalGuests: totalGuests,
                    attendedCount: attendedCount,
                    confirmedCount: confirmedCount,
                    updatedAt: new Date()
                }
            });

            // Simpan snapshot stats untuk analytics
            await tx.eventStats.create({
                data: {
                    eventId: eventId,
                    totalGuests: totalGuests,
                    guestsArrived: attendedCount,
                    guestsPending: totalGuests - attendedCount,
                    photosTaken: photosTaken,
                    photosSent: photosSent,
                    photosFailed: photosTaken - photosSent,
                    snapshotTime: new Date()
                }
            });

            return updatedEvent;
        });

        return stats;
    } catch (error) {
        console.error('Error updating event stats:', error);
        throw error;
    }
};

// TOGGLE EVENT ACTIVATION
const toggleEventActivation = async(req, res) => {
    const eventId = req.params.id;
    const { isActive } = req.body;

    try {
        const event = await prisma.event.findFirst({
            where: { id: parseInt(eventId) }
        });

        if (!event) {
            return res.status(404).json({
                msg: "Event not found"
            });
        }

        // Authorization check
        if (req.user.role !== "SUPER_ADMIN" && req.user.role !== "ADMIN") {
            return res.status(403).json({
                msg: "Only admin can toggle event activation"
            });
        }

        const updatedEvent = await prisma.event.update({
            where: { id: parseInt(eventId) },
            data: { 
                isActive: isActive !== undefined ? Boolean(isActive) : !event.isActive,
                updatedAt: new Date()
            }
        });

        res.status(200).json({
            msg: `Event ${updatedEvent.isActive ? 'activated' : 'deactivated'} successfully`,
            data: updatedEvent
        });

    } catch(e) {
        console.log(e);
        res.status(500).json({
            msg: "Server error"
        });
    }
}

module.exports = {
    createEvent, 
    updateEvent, 
    showEvent, 
    deleteEvent, 
    findEvent,
    getEventByShortCode,
    updateEventStats,
    toggleEventActivation
};