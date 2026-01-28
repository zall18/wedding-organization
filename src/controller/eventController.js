const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();


const createEvent = async(req, res) => {
    const { name, date, location, themeColor, userId } = req.body;

    try {

        const baseSlug = name
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "");

        let slug = baseSlug;
        let counter = 1;

        while (await prisma.event.findUnique({ where: { slug } })) {
        slug = `${baseSlug}-${counter}`;
        counter++;
        }

        const event = await prisma.event.create({
            data : {
                slug: slug,
                name: name,
                date: new Date(date),
                location: location,
                themeColor: themeColor,
                isActive: false,
                userId: userId
            }
        });

        res.status(201).json({
        msg: "Success to create",
        data: event
    });
    } catch(e) {
        console.log(e);
        res.status(500).json({
            msg: "Server error"
        });
    }
}

const updateEvent = async(req, res) => {
    const { name, date, location, themeColor, isActive, eventId } = req.body;

    try {

        if(req.user.role == "ORGANIZER" && (parseInt(req.user.eventId) != eventId)) {
            return res.status(400).json({
                msg: "Organizer only can update his own event"
            });
        }

        const event = await prisma.event.findFirst({
            where : {
                id: eventId
            }
        });

        if(!event) {
            res.status(404).json({
                msg: "Event not found"
            });
        }

        let slug = event.slug;
        if(name != event.name) {
            baseSlug = name
            .toLowerCase()
            .trim()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/(^-|-$)/g, "");

            slug = baseSlug;
            let counter = 1;
            
            while (await prisma.event.findUnique({ where: { slug } })) {
            slug = `${baseSlug}-${counter}`;
            counter++;
            }
        }

        const eventUpdate = await prisma.event.update({
            where: {
                id: eventId
            },
            data : {
                slug: slug,
                name: name,
                date: new Date(date),
                location: location,
                themeColor: themeColor,
                isActive: isActive,
            }
        });

        res.status(200).json({
            msg: "Success to update",
            data: eventUpdate
        });
    } catch(e) {
        console.log(e);
        res.status(500).json({
            msg: "server error"
        });
    }
}

const deleteEvent = async(req, res) => {
    const eventSlug = req.params.slug;

    try {
        const event = await prisma.event.findFirst({
            where : {
                slug: eventSlug
            }
        });

        if(!event) {
            res.status(404).json({
                msg: "Event not found"
            });
        }

        if(event.isActive) {
            res.status(400).json({
                msg: "Event is active"
            });
        }

        await prisma.event.delete({
            where: {
                slug: event.slug
            }
        });

        res.status(200).json({
            msg: "Event success to delete"
        });
    } catch(e) {
        console.log(e);
        res.status(500).json({
            msg: "Server error"
        });
    }
}

const showEvent = async(req, res) => {
    try {
        const events = await prisma.event.findMany();

        res.status(200).json({
            msg: "Success to get all data",
            events: events
        });
    } catch(e) {
        res.status(500).json({
            msg: e
        });
    }
}

const findEvent = async(req, res) => {
    const eventSlug = req.params.slug;

    try {
        const event = await prisma.event.findFirst({
            where : {
                slug: eventSlug
            }
        });

        if(!event) {
            res.status(404).json({
                msg: "Event not found"
            });
        }

        res.status(200).json({
            msg: "Success to find data",
            event
        });


    } catch(e) {
        res.status(500).json({
            msg: e
        });
    }
}

module.exports = {createEvent, updateEvent, showEvent, deleteEvent, findEvent};