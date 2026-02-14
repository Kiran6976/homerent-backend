const multer = require("multer");

// Store file in memory (we upload to Cloudinary later)
const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB max
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/jpg",
      "application/pdf", // ✅ Allow PDF for electricity bill
    ];

    if (!allowedTypes.includes(file.mimetype)) {
      return cb(
        new Error(
          "Only JPG, PNG, WEBP images or PDF files are allowed"
        )
      );
    }

    cb(null, true);
  },
});

module.exports = upload;
