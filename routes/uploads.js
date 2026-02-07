const express = require("express");
const streamifier = require("streamifier");
const cloudinary = require("../config/cloudinary");
const authMiddleware = require("../middleware/auth");
const upload = require("../middleware/upload");

const router = express.Router();

/**
 * POST /api/uploads/image
 * body: form-data -> image: File
 * returns: { url }
 */
router.post(
  "/image",
  authMiddleware,
  upload.single("image"),
  async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ message: "No file provided" });

      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: "homerent/houses",
          resource_type: "image",
        },
        (error, result) => {
          if (error) {
            console.error("Cloudinary error:", error);
            return res.status(500).json({ message: "Cloudinary upload failed" });
          }
          return res.json({ url: result.secure_url });
        }
      );

      streamifier.createReadStream(req.file.buffer).pipe(uploadStream);
    } catch (err) {
      console.error("Upload error:", err);
      res.status(500).json({ message: "Server error" });
    }
  }
);

module.exports = router;
