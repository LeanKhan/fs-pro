import { Router } from 'express';
import { uploader, tmp_uploader } from './multer.config';
import { createManyClubsFromCSV } from '../../controllers/clubs/club.controller';

const router = Router();

router.post('/upload', uploader, (req, res) => {
  return res.status(200).send(req.file);
});

router.post('/upload-clubs', tmp_uploader, createManyClubsFromCSV);

export default router;
