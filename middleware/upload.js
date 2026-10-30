import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { fileURLToPath } from "url";
import multer from "multer";
import { HttpError } from "./http.js";

const middlewareDirectory = path.dirname(fileURLToPath(import.meta.url));
export const privateUploadDirectory = path.resolve(middlewareDirectory, "..", "storage", "private");
fs.mkdirSync(privateUploadDirectory, { recursive: true });

const allowedTypes = new Set(["application/pdf", "image/jpeg", "image/png"]);
const fileExtensions = {
  "application/pdf": ".pdf",
  "image/jpeg": ".jpg",
  "image/png": ".png",
};

export const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, callback) => callback(null, privateUploadDirectory),
    filename: (_req, file, callback) => {
      callback(null, `${randomUUID()}${fileExtensions[file.mimetype] || ""}`);
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => {
    if (!allowedTypes.has(file.mimetype)) {
      return callback(new HttpError(400, "Upload a PDF, JPEG, or PNG file (maximum 10 MB)."));
    }
    callback(null, true);
  },
});

export const validateUploadedFile = async (req, _res, next) => {
  if (!req.file) return next();

  try {
    const handle = await fs.promises.open(req.file.path, "r");
    const header = Buffer.alloc(8);
    await handle.read(header, 0, header.length, 0);
    await handle.close();

    const signatureMatches =
      (req.file.mimetype === "application/pdf" && header.subarray(0, 5).toString() === "%PDF-") ||
      (req.file.mimetype === "image/jpeg" && header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff) ||
      (req.file.mimetype === "image/png" && header.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])));

    if (!signatureMatches) {
      await fs.promises.unlink(req.file.path);
      return next(new HttpError(400, "The uploaded file content does not match its file type."));
    }

    next();
  } catch (error) {
    next(error);
  }
};

export const removeUploadedFile = async (file) => {
  if (!file?.path) return;
  try {
    await fs.promises.unlink(file.path);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
};
