import { Router } from 'express';
import { getHealth } from '../controllers/healthController.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
const router = Router();
router.get('/', asyncHandler(getHealth));
export default router;
