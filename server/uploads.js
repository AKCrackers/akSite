import fs from 'fs';
import multer from 'multer';
import path from 'path';
import { v4 as uuid } from 'uuid';
import { UPLOADS } from './config.js';

const storage = multer.diskStorage({
  destination: (_request, _file, callback) => callback(null, UPLOADS),
  filename: (_request, file, callback) => callback(null, `${Date.now()}-${uuid()}${path.extname(file.originalname).toLowerCase()}`)
});

export const imageUpload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024, files: 125 },
  fileFilter: (_request, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase();
    const validMime = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'].includes(file.mimetype);
    const validExtension = ['.jpg', '.jpeg', '.png', '.webp'].includes(extension);
    // Browsers and Windows can send an empty or generic MIME type. Let the
    // signature check below make the final decision for supported filenames.
    callback(validMime || validExtension ? null : new Error('Only JPG, PNG and WebP images are allowed'), validMime || validExtension);
  }
});

export function removeLocalUpload(image) {
  if (!image?.startsWith('/uploads/')) return;
  const filename = path.basename(image);
  const uploadRoot = path.resolve(UPLOADS);
  const target = path.resolve(uploadRoot, filename);
  if (target.startsWith(`${uploadRoot}${path.sep}`) && fs.existsSync(target)) fs.unlinkSync(target);
}

export function validImageFile(file) {
  const bytes = fs.readFileSync(file.path).subarray(0, 12);
  const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const png = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const webp = bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP';
  return jpeg || png || webp;
}
