// utils/helpers.js
const generateSlug = (text) => {
    return text
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9\s]+/g, "")
        .replace(/\s+/g, "-")
        .replace(/(^-|-$)/g, "");
};

const generateRandomCode = (length = 6) => {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < length; i++) {
        code += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return code;
};

module.exports = {
    generateSlug,
    generateRandomCode
};