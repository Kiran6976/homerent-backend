const multer = require("multer");

const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const allowed = ["image/jpeg", "image/png", "image/webp", "image/jpg"];
    if (!allowed.includes(file.mimetype)) {
      return cb(new Error("Only JPG, PNG, WEBP images allowed"));
    }
    cb(null, true);
  },
});

module.exports = upload;
