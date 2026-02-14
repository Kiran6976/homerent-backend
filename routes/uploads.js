const express = require("express");
const streamifier = require("streamifier");
const cloudinary = require("../config/cloudinary");
const authMiddleware = require("../middleware/auth");
const { roleMiddleware } = require("../middleware/role");
const upload = require("../middleware/upload");

const router = express.Router();

/**
 * Helper: Upload buffer to Cloudinary
 */
const uploadToCloudinary = (buffer, options) => {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      options,
      (error, result) => {
        if (error) return reject(error);
        resolve(result);
      }
    );

    streamifier.createReadStream(buffer).pipe(stream);
  });
};

/**
 * ====================================================
 * 1️⃣ Upload Property Image
 * POST /api/uploads/image
 * form-data: image
 * ====================================================
 */
router.post(
  "/image",
  authMiddleware,
  roleMiddleware("landlord"),
  upload.single("image"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No image file provided" });
      }

      const result = await uploadToCloudinary(req.file.buffer, {
        folder: "homerent/houses",
        resource_type: "image",
      });

      return res.json({
        success: true,
        url: result.secure_url,
      });
    } catch (err) {
      console.error("Image upload error:", err);
      res.status(500).json({ message: "Image upload failed" });
    }
  }
);

/**
 * ====================================================
 * 2️⃣ Upload Electricity Bill (PDF or Image)
 * POST /api/uploads/electricity-bill
 * form-data: bill
 * ====================================================
 */
router.post(
  "/electricity-bill",
  authMiddleware,
  roleMiddleware("landlord"),
  upload.single("bill"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No bill file provided" });
      }

      const mime = req.file.mimetype;
      const isPdf = mime === "application/pdf";

      const result = await uploadToCloudinary(req.file.buffer, {
        folder: "homerent/electricity-bills",
        resource_type: isPdf ? "raw" : "image",
      });

      return res.json({
        success: true,
        url: result.secure_url,
        mimeType: mime,
      });
    } catch (err) {
      console.error("Electricity bill upload error:", err);
      res.status(500).json({ message: "Electricity bill upload failed" });
    }
  }
);

module.exports = router;
