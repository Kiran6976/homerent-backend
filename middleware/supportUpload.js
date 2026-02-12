const multer = require("multer");

const storage = multer.memoryStorage();

// You can change size if needed
const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB
  fileFilter: (req, file, cb) => {
    const allowed = [
      // images
      "image/jpeg", "image/png", "image/webp", "image/jpg",
      // videos
      "video/mp4", "video/webm", "video/quicktime",
    ];

    if (!allowed.includes(file.mimetype)) {
      return cb(new Error("Only JPG/PNG/WEBP images and MP4/WEBM/MOV videos allowed"));
    }
    cb(null, true);
  },
});

module.exports = upload;
