import { Router } from 'express';
import { uploader, tmp_uploader } from './multer.config';
import { createManyClubsFromCSV } from '../../controllers/clubs/club.controller';
import respond from '../../helpers/responseHandler';

// Multipart bodies are a poor fit for ts-rest's JSON-first model, so these
// two routes stay permanently outside the api-contract package - a
// deliberate, permanent exception, not a TODO (see
// packages/api-contract/src/index.ts's own note on this).
const router = Router();

router.post('/upload', uploader, (req, res) => {
  respond.success(res, 200, 'File uploaded successfully', req.file);
});

router.post('/upload-clubs', tmp_uploader, createManyClubsFromCSV);

export default router;
