const express = require("express");
const streamifier = require("streamifier");
const cloudinary = require("../config/cloudinary");
const authMiddleware = require("../middleware/auth");
const supportUpload = require("../middleware/supportUpload");

const router = express.Router();

/**
 * POST /api/uploads/support
 * form-data: file
 * returns: { url, type }
 */
router.post(
  "/support",
  authMiddleware,
  supportUpload.single("file"),
  async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ message: "No file provided" });

      const isVideo = req.file.mimetype.startsWith("video/");
      const resourceType = isVideo ? "video" : "image";

      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: "homerent/support",
          resource_type: resourceType,
        },
        (error, result) => {
          if (error) {
            console.error("Cloudinary error:", error);
            return res.status(500).json({ message: "Cloudinary upload failed" });
          }
          return res.json({ url: result.secure_url, type: resourceType });
        }
      );

      streamifier.createReadStream(req.file.buffer).pipe(uploadStream);
    } catch (err) {
      console.error("Support upload error:", err);
      res.status(500).json({ message: "Server error" });
    }
  }
);

module.exports = router;
